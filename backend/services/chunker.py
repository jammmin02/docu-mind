"""
슬라이딩 윈도우 방식 텍스트 청킹
chunk_size=500자 / overlap=50자
"""
from typing import List

CHUNK_SIZE = 500
OVERLAP    = 50


def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = OVERLAP,
) -> List[str]:
    """
    슬라이딩 윈도우로 텍스트를 청크 리스트로 분할.
    빈 청크는 제거하고 순서대로 반환.
    """
    if not text or not text.strip():
        return []

    text = text.strip()
    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        # 마지막 청크면 종료
        if end == len(text):
            break

        # 다음 시작점: overlap만큼 뒤로
        start = end - overlap

    return chunks


def estimate_tokens(text: str) -> int:
    """한국어 기준 보수적 토큰 수 추정 (3자 ≈ 1토큰)"""
    return max(1, len(text) // 3)
