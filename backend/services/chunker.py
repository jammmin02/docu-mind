"""
Hierarchical 텍스트 청킹 서비스

청킹 전략 (우선순위 순):
  1. 표(Markdown table) — 분할하지 않고 단일 청크로 유지
  2. 섹션/제목 경계 — 섹션을 넘어서 청크 합치지 않음
  3. 단락 경계 (\n\n) — 단락을 기본 분할 단위로 사용
  4. 문장 경계 (. / ? / !) — 단락이 MAX_CHUNK 초과 시 문장 단위로 분할
  5. 슬라이딩 윈도우 — 그래도 길면 마지막 fallback

표(Markdown)는 LLM이 구조를 파악해야 하므로 절대 중간에서 자르지 않는다.
너무 짧은 청크(< MIN_CHUNK_LEN)는 이전 청크에 병합한다.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from services.parser import PageResult

# ── 청크 크기 파라미터 ─────────────────────────────────────────────────────────
MAX_CHUNK_CHARS = 800   # 청크 하나의 최대 문자 수
OVERLAP_CHARS   = 80    # sliding window fallback 시 overlap
MIN_CHUNK_LEN   = 30    # 이보다 짧으면 이전 청크에 병합

# 표 블록 감지 패턴 (Markdown table: | 로 시작하는 줄들의 연속)
_TABLE_PATTERN = re.compile(r'(\|.+\|(?:\n\|.+\|)*)', re.MULTILINE)

# 코드 블록 감지 패턴
# - Markdown 펜스: ```...```
# - 들여쓰기 코드: 4+ 공백 또는 탭으로 시작하는 줄 2줄 이상 연속
_CODE_FENCE_PATTERN = re.compile(r'(```[\s\S]*?```)', re.MULTILINE)
_CODE_INDENT_PATTERN = re.compile(r'((?:(?:    |\t)[^\n]+\n){2,})', re.MULTILINE)

# 섹션 제목 감지 패턴
# - 번호 시작: "1. ", "제2", "가. " 등
# - Markdown 헤더: "# ", "## " 등
# - 슬라이드 헤더: "[슬라이드 N]" 형식 (PPTX 파서가 생성)
_HEADING_PATTERN = re.compile(
    r'^(?:\[슬라이드\s*\d+\]|\d+[\.\)]\s|제\d+|[가-힣]\.\s|#+\s).{0,60}$',
    re.MULTILINE,
)


# ── 반환 타입 ──────────────────────────────────────────────────────────────────

@dataclass
class ChunkResult:
    content:  str
    metadata: dict[str, Any] = field(default_factory=dict)


# ── 공개 API ──────────────────────────────────────────────────────────────────

def chunk_pages(pages: list[PageResult]) -> list[ChunkResult]:
    """
    PageResult 리스트 → ChunkResult 리스트.
    각 페이지를 독립적으로 hierarchical 청킹하고, 청크에 해당 페이지의 metadata를 붙인다.
    """
    all_chunks: list[ChunkResult] = []

    for page in pages:
        text = page.content.strip()
        if not text:
            continue

        page_chunks = _chunk_page_text(text)

        for content in page_chunks:
            if not content.strip():
                continue
            all_chunks.append(ChunkResult(
                content=content.strip(),
                metadata=dict(page.metadata),
            ))

    return _merge_short_chunks(all_chunks)


def estimate_tokens(text: str) -> int:
    """한국어 기준 보수적 토큰 수 추정 (3자 ≈ 1토큰)"""
    return max(1, len(text) // 3)


# ── 핵심 청킹 로직 ─────────────────────────────────────────────────────────────

def _chunk_page_text(text: str) -> list[str]:
    """
    단일 페이지 텍스트를 hierarchical하게 청크 리스트로 분할.

    처리 순서:
      1. 표(Markdown table) 블록을 먼저 추출 → atomic 청크
      2. 나머지 텍스트를 섹션 경계로 1차 분할
      3. 각 섹션을 단락(\n\n) 경계로 2차 분할
      4. 긴 단락은 문장 경계 → sliding window 순으로 분할
      5. 표 청크를 원래 위치에 재삽입
    """
    # ── 1단계: 표 + 코드블록 추출 (atomic 청크 — 분할 금지) ────────────────────
    # placeholder로 치환 후 나중에 복원
    tables: dict[str, str] = {}
    counter = [0]

    def replace_atomic(key_prefix: str):
        def _replace(m: re.Match) -> str:
            key = f"\x00{key_prefix}_{counter[0]}\x00"
            tables[key] = m.group(0)
            counter[0] += 1
            return key
        return _replace

    # 코드 펜스 (``` ... ```) 먼저
    text_no_tables = _CODE_FENCE_PATTERN.sub(replace_atomic("CODE"), text)
    # 들여쓰기 코드 블록
    text_no_tables = _CODE_INDENT_PATTERN.sub(replace_atomic("INDENT"), text_no_tables)
    # Markdown 표
    text_no_tables = _TABLE_PATTERN.sub(replace_atomic("TABLE"), text_no_tables)

    # ── 2단계: 섹션 경계 분할 ─────────────────────────────────────────────────
    sections = _split_by_sections(text_no_tables)

    # ── 3~4단계: 각 섹션을 단락 → 문장 → sliding window로 분할 ────────────────
    result_chunks: list[str] = []
    for section in sections:
        chunks = _split_section(section)
        result_chunks.extend(chunks)

    # ── 5단계: placeholder를 실제 내용(표/코드)으로 복원 ─────────────────────
    final: list[str] = []
    _PLACEHOLDER_RE = re.compile(r'(\x00(?:TABLE|CODE|INDENT)_\d+\x00)')

    for chunk in result_chunks:
        if "\x00" in chunk:
            parts = _PLACEHOLDER_RE.split(chunk)
            for part in parts:
                if part in tables:
                    final.append(tables[part])   # atomic 청크로 독립 처리
                elif part.strip():
                    final.append(part)
        else:
            final.append(chunk)

    # placeholder가 result_chunks 밖에 단독으로 남은 경우 처리
    used_keys = set()
    for chunk in final:
        for key in tables:
            if key in chunk:
                used_keys.add(key)
    for key, atomic_content in tables.items():
        if key not in used_keys:
            final.append(atomic_content)

    return [c for c in final if c.strip()]


def _split_by_sections(text: str) -> list[str]:
    """
    섹션 제목 패턴을 기준으로 텍스트를 분할.
    제목 자체는 다음 섹션 텍스트에 포함시킨다.
    """
    # 섹션 경계 위치 찾기
    boundaries = [0]
    for m in _HEADING_PATTERN.finditer(text):
        if m.start() > 0:
            boundaries.append(m.start())
    boundaries.append(len(text))

    sections = []
    for i in range(len(boundaries) - 1):
        section = text[boundaries[i]:boundaries[i + 1]].strip()
        if section:
            sections.append(section)

    return sections if sections else [text]


def _split_section(text: str) -> list[str]:
    """
    섹션 텍스트를 단락 → 문장 → sliding window 순서로 청크 분할.
    """
    if len(text) <= MAX_CHUNK_CHARS:
        return [text]

    # 단락 분리
    paragraphs = [p.strip() for p in re.split(r'\n{2,}', text) if p.strip()]
    if not paragraphs:
        return [text]

    chunks: list[str] = []
    buffer = ""

    for para in paragraphs:
        # 단락 자체가 MAX_CHUNK_CHARS 초과 → 문장 단위로 재분할
        if len(para) > MAX_CHUNK_CHARS:
            if buffer:
                chunks.append(buffer)
                buffer = ""
            chunks.extend(_split_by_sentences(para))
            continue

        # buffer + 현재 단락이 MAX_CHUNK_CHARS 이하 → 합산
        candidate = (buffer + "\n\n" + para).strip() if buffer else para
        if len(candidate) <= MAX_CHUNK_CHARS:
            buffer = candidate
        else:
            # buffer를 확정하고 새 buffer 시작
            if buffer:
                chunks.append(buffer)
            buffer = para

    if buffer:
        chunks.append(buffer)

    return chunks if chunks else [text]


def _split_by_sentences(text: str) -> list[str]:
    """
    문장 경계(. ? ! 등)로 분할.
    그래도 긴 문장은 sliding window fallback.
    """
    # 한국어/영어 문장 경계
    sentences = re.split(r'(?<=[.!?。])\s+', text)
    sentences = [s.strip() for s in sentences if s.strip()]

    if not sentences:
        return _sliding_window(text)

    chunks: list[str] = []
    buffer = ""

    for sentence in sentences:
        if len(sentence) > MAX_CHUNK_CHARS:
            if buffer:
                chunks.append(buffer)
                buffer = ""
            chunks.extend(_sliding_window(sentence))
            continue

        candidate = (buffer + " " + sentence).strip() if buffer else sentence
        if len(candidate) <= MAX_CHUNK_CHARS:
            buffer = candidate
        else:
            if buffer:
                chunks.append(buffer)
            buffer = sentence

    if buffer:
        chunks.append(buffer)

    return chunks if chunks else _sliding_window(text)


def _sliding_window(text: str) -> list[str]:
    """마지막 fallback: 순수 슬라이딩 윈도우"""
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end   = min(start + MAX_CHUNK_CHARS, len(text))
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == len(text):
            break
        start = end - OVERLAP_CHARS
    return chunks


def _merge_short_chunks(chunks: list[ChunkResult]) -> list[ChunkResult]:
    """
    MIN_CHUNK_LEN 미만의 짧은 청크를 이전 청크에 병합.
    단, 표 청크(has_table=True)는 병합 대상에서 제외.
    """
    if not chunks:
        return chunks

    merged: list[ChunkResult] = []
    for chunk in chunks:
        is_short = len(chunk.content) < MIN_CHUNK_LEN
        is_table = chunk.metadata.get("has_table", False)

        if is_short and not is_table and merged:
            merged[-1].content += "\n" + chunk.content
        else:
            merged.append(chunk)

    return merged


# ── 레거시 호환 래퍼 ─────────────────────────────────────────────────────────

def chunk_text(text: str) -> list[str]:
    """단순 텍스트 → 문자열 청크 리스트 (레거시 호환용)"""
    return _sliding_window(text)
