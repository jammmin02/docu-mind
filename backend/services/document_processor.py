"""
문서 처리 백그라운드 파이프라인
upload -> parse -> chunk -> embed(캐시 활용) -> pgvector 저장 -> status=ready

Phase 2 추가:
  - parsed_pages 테이블에 페이지별 파싱 결과 저장
  - ChunkConfig를 통한 카테고리별 청킹 파라미터 지원
  - 세분화 재처리: reparse / rechunk / reembed
"""
import hashlib
import json
import logging
import time
import os
from typing import List, Optional

from pgvector.psycopg import register_vector

from db.database import get_db
from services.parser import parse_file, pages_to_text, PageResult
from services.chunker import chunk_pages, estimate_tokens, ChunkConfig
from services.embedder import embed_chunks

logger = logging.getLogger(__name__)

PROCESSING_TIMEOUT = int(os.getenv("PROCESSING_TIMEOUT", 300))


# ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

def _hash_chunk(text: str) -> str:
    """청크 텍스트의 SHA-256 hex digest 반환 (임베딩 캐시 키)"""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _load_embedding_cache(hashes: List[str]) -> dict:
    """DB에서 주어진 해시 목록에 대한 기존 임베딩을 조회하여 캐시 맵 반환."""
    if not hashes:
        return {}
    try:
        with get_db() as (conn, cur):
            register_vector(conn)
            cur.execute("""
                SELECT DISTINCT ON (content_hash) content_hash, embedding
                FROM chunks
                WHERE content_hash = ANY(%s)
                  AND embedding IS NOT NULL
                ORDER BY content_hash, id DESC
            """, (hashes,))
            rows = cur.fetchall()
        cache = {row["content_hash"]: row["embedding"] for row in rows}
        logger.info("[processor] embedding cache: %d / %d hit", len(cache), len(hashes))
        return cache
    except Exception as e:
        logger.warning("[processor] 캐시 조회 실패 (전체 임베딩 진행): %s", e)
        return {}


def _check_timeout(start: float, step: str) -> None:
    elapsed = time.time() - start
    if elapsed > PROCESSING_TIMEOUT:
        raise TimeoutError(
            "처리 시간 초과 (" + str(int(elapsed)) + "초 경과): " + step +
            " 단계에서 중단되었습니다. 파일이 너무 크거나 서버가 일시적으로 혼잡합니다. 재시도해 주세요."
        )


def _friendly_error(e: Exception) -> str:
    name = type(e).__name__
    if name == "RateLimitError":
        return "OpenAI API 요청 한도 초과 — 잠시 후 재시도해 주세요."
    if name == "AuthenticationError":
        return "OpenAI API 키가 유효하지 않습니다. 관리자에게 문의해 주세요."
    if name in ("APITimeoutError", "TimeoutError") or "처리 시간 초과" in str(e):
        return str(e) if "처리 시간 초과" in str(e) else "임베딩 API 응답 시간 초과 — 재시도해 주세요."
    if name == "APIConnectionError":
        return "OpenAI API 연결 실패 — 네트워크 상태를 확인해 주세요."
    if name == "APIStatusError":
        return "OpenAI API 오류 (HTTP " + str(getattr(e, 'status_code', '?')) + ") — 잠시 후 재시도해 주세요."
    if "청킹 결과가 없습니다" in str(e):
        return "문서에서 텍스트를 추출할 수 없습니다. 빈 파일이거나 이미지 기반 PDF일 수 있습니다."
    logger.error("[processor] unhandled error type=%s msg=%s", type(e).__name__, e, exc_info=True)
    return "파일 처리 중 예상치 못한 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."


def _set_doc_error(document_id: int, e: Exception, elapsed: float) -> None:
    """문서 상태를 failed/timeout으로 업데이트."""
    status  = "timeout" if isinstance(e, TimeoutError) else "failed"
    err_msg = _friendly_error(e)
    logger.error("[processor] %s doc_id=%d elapsed=%.1fs error=%s", status, document_id, elapsed, err_msg)
    try:
        with get_db() as (conn, cur):
            cur.execute("""
                UPDATE documents
                SET status = %s, error_message = %s, updated_at = NOW()
                WHERE id = %s
            """, (status, err_msg, document_id))
    except Exception as db_err:
        logger.error("[processor] DB 상태 업데이트 실패: %s", db_err)


# ── parsed_pages 헬퍼 ─────────────────────────────────────────────────────────

def _save_parsed_pages(document_id: int, pages: List[PageResult]) -> None:
    """parsed_pages 테이블에 페이지별 파싱 결과를 저장 (기존 데이터 교체)."""
    with get_db() as (conn, cur):
        cur.execute("DELETE FROM parsed_pages WHERE document_id = %s", (document_id,))
        for page in pages:
            safe_content = page.content.replace("\x00", "")
            cur.execute("""
                INSERT INTO parsed_pages
                    (document_id, page_number, content, char_count, has_table, ocr_applied)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                document_id,
                page.metadata.get("page_number", 1),
                safe_content,
                len(safe_content),
                bool(page.metadata.get("has_table", False)),
                bool(page.metadata.get("ocr_applied", False)),
            ))
    logger.info("[processor] saved parsed_pages doc_id=%d pages=%d", document_id, len(pages))


def _load_parsed_pages(document_id: int) -> List[PageResult]:
    """parsed_pages 테이블에서 PageResult 리스트를 복원."""
    with get_db() as (conn, cur):
        cur.execute("""
            SELECT page_number, content, has_table, ocr_applied
            FROM parsed_pages
            WHERE document_id = %s
            ORDER BY page_number
        """, (document_id,))
        rows = cur.fetchall()
    return [
        PageResult(
            content=row["content"],
            metadata={
                "page_number": row["page_number"],
                "has_table":   row["has_table"],
                "ocr_applied": row["ocr_applied"],
            },
        )
        for row in rows
    ]


def _get_category_chunk_config(document_id: int) -> ChunkConfig:
    """문서의 카테고리에 설정된 chunk_config를 읽어 ChunkConfig 반환."""
    with get_db() as (conn, cur):
        cur.execute("""
            SELECT c.chunk_config
            FROM documents d
            LEFT JOIN categories c ON c.id = d.category_id
            WHERE d.id = %s
        """, (document_id,))
        row = cur.fetchone()
    cfg_dict = row["chunk_config"] if row and row["chunk_config"] else None
    return ChunkConfig.from_dict(cfg_dict)


# ── 청킹+임베딩+저장 공통 로직 ──────────────────────────────────────────────────

def _chunk_embed_save(
    document_id: int,
    pages: List[PageResult],
    full_text: str,
    chunk_config: Optional[ChunkConfig],
    start: float,
) -> int:
    """청킹 -> 임베딩 -> DB 저장. 저장된 청크 수 반환."""
    cfg = chunk_config or ChunkConfig()

    # 청킹
    _check_timeout(start, "청킹")
    chunk_results = chunk_pages(pages, cfg)
    if not chunk_results:
        raise ValueError("청킹 결과가 없습니다 (텍스트가 너무 짧거나 비어있음)")
    logger.info("[processor] chunked doc_id=%d chunks=%d", document_id, len(chunk_results))

    # 임베딩 (캐시 우선)
    _check_timeout(start, "임베딩")
    chunk_texts  = [c.content for c in chunk_results]
    chunk_hashes = [_hash_chunk(t) for t in chunk_texts]
    embed_cache  = _load_embedding_cache(chunk_hashes)

    miss_indices = [i for i, h in enumerate(chunk_hashes) if h not in embed_cache]
    if miss_indices:
        miss_texts      = [chunk_texts[i] for i in miss_indices]
        miss_embeddings = embed_chunks(miss_texts)
        for i, emb in zip(miss_indices, miss_embeddings):
            embed_cache[chunk_hashes[i]] = emb
        logger.info(
            "[processor] embedded doc_id=%d new=%d cached=%d",
            document_id, len(miss_indices), len(chunk_hashes) - len(miss_indices),
        )
    else:
        logger.info("[processor] embedded doc_id=%d (all %d from cache)", document_id, len(chunk_hashes))

    embeddings = [embed_cache[h] for h in chunk_hashes]

    # DB 저장
    _check_timeout(start, "DB 저장")
    with get_db() as (conn, cur):
        register_vector(conn)
        cur.execute("DELETE FROM chunks WHERE document_id = %s", (document_id,))

        for idx, (chunk_result, embedding, c_hash) in enumerate(
            zip(chunk_results, embeddings, chunk_hashes)
        ):
            safe_content  = chunk_result.content.replace("\x00", "")
            safe_metadata = {
                k: v.replace("\x00", "") if isinstance(v, str) else v
                for k, v in chunk_result.metadata.items()
            }
            # ndarray(캐시 조회) → list 변환, list(신규 임베딩)는 그대로
            emb = embedding.tolist() if hasattr(embedding, "tolist") else embedding
            cur.execute("""
                INSERT INTO chunks
                    (document_id, content, embedding, chunk_index, token_count, metadata, content_hash)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                document_id,
                safe_content,
                emb,
                idx,
                estimate_tokens(safe_content),
                json.dumps(safe_metadata, ensure_ascii=False),
                c_hash,
            ))

        cur.execute("""
            UPDATE documents
            SET status      = 'ready',
                content     = %s,
                chunk_count = %s,
                updated_at  = NOW()
            WHERE id = %s
        """, (full_text[:50000], len(chunk_results), document_id))

    return len(chunk_results)


# ── 메인 파이프라인 ───────────────────────────────────────────────────────────

def process_document(document_id: int, contents: bytes, file_type: str) -> None:
    """
    BackgroundTask로 실행되는 문서 처리 파이프라인 (전체).
    parse -> save parsed_pages -> chunk -> embed -> save
    """
    logger.info("[processor] start  doc_id=%d type=%s", document_id, file_type)
    start = time.time()

    try:
        # 1. 파싱
        _check_timeout(start, "파싱")
        pages     = parse_file(contents, file_type)
        full_text = pages_to_text(pages)
        logger.info(
            "[processor] parsed doc_id=%d pages=%d chars=%d",
            document_id, len(pages), len(full_text),
        )

        # 2. parsed_pages 저장
        _save_parsed_pages(document_id, pages)

        # 3. 카테고리 청킹 파라미터 로드
        cfg = _get_category_chunk_config(document_id)

        # 4. 청킹 + 임베딩 + 저장
        n = _chunk_embed_save(document_id, pages, full_text, cfg, start)

        elapsed = time.time() - start
        logger.info("[processor] done doc_id=%d chunks=%d elapsed=%.1fs", document_id, n, elapsed)

    except Exception as e:
        _set_doc_error(document_id, e, time.time() - start)


# ── 세분화 재처리 ─────────────────────────────────────────────────────────────

def reparse_document(document_id: int, contents: bytes, file_type: str) -> None:
    """
    파싱 단계만 재실행 -> parsed_pages 갱신 -> documents.content 갱신.
    chunks는 변경하지 않음.
    """
    logger.info("[processor] reparse doc_id=%d", document_id)
    start = time.time()
    try:
        with get_db() as (conn, cur):
            cur.execute("UPDATE documents SET status='reparsing', updated_at=NOW() WHERE id=%s", (document_id,))

        _check_timeout(start, "파싱")
        pages     = parse_file(contents, file_type)
        full_text = pages_to_text(pages)
        _save_parsed_pages(document_id, pages)

        with get_db() as (conn, cur):
            cur.execute("""
                UPDATE documents
                SET status='ready', content=%s, updated_at=NOW()
                WHERE id=%s
            """, (full_text[:50000], document_id))

        logger.info("[processor] reparse done doc_id=%d pages=%d elapsed=%.1fs",
                    document_id, len(pages), time.time() - start)
    except Exception as e:
        _set_doc_error(document_id, e, time.time() - start)


def rechunk_document(document_id: int, chunk_config: Optional[ChunkConfig] = None) -> None:
    """
    parsed_pages에서 페이지를 읽어 청킹+임베딩+저장 재실행.
    chunk_config가 None이면 카테고리 설정값 사용.
    """
    logger.info("[processor] rechunk doc_id=%d", document_id)
    start = time.time()
    try:
        with get_db() as (conn, cur):
            cur.execute("UPDATE documents SET status='rechunking', updated_at=NOW() WHERE id=%s", (document_id,))

        pages = _load_parsed_pages(document_id)
        if not pages:
            raise ValueError("저장된 파싱 결과가 없습니다. 먼저 재파싱을 실행해 주세요.")

        full_text = pages_to_text(pages)
        cfg = chunk_config or _get_category_chunk_config(document_id)
        n   = _chunk_embed_save(document_id, pages, full_text, cfg, start)

        logger.info("[processor] rechunk done doc_id=%d chunks=%d elapsed=%.1fs",
                    document_id, n, time.time() - start)
    except Exception as e:
        _set_doc_error(document_id, e, time.time() - start)


def reembed_document(document_id: int) -> None:
    """
    기존 chunks의 content를 그대로 사용하고 임베딩만 재생성.
    (content_hash 캐시 미스 시 API 호출)
    """
    logger.info("[processor] reembed doc_id=%d", document_id)
    start = time.time()
    try:
        with get_db() as (conn, cur):
            cur.execute("UPDATE documents SET status='reembedding', updated_at=NOW() WHERE id=%s", (document_id,))
            cur.execute("""
                SELECT id, content, content_hash, chunk_index, token_count, metadata
                FROM chunks
                WHERE document_id = %s
                ORDER BY chunk_index
            """, (document_id,))
            rows = cur.fetchall()

        if not rows:
            raise ValueError("청크가 없습니다. 먼저 재청킹을 실행해 주세요.")

        chunk_ids    = [r["id"] for r in rows]
        chunk_texts  = [r["content"] for r in rows]
        chunk_hashes = [r["content_hash"] or _hash_chunk(r["content"]) for r in rows]

        # 임베딩 (캐시 우선)
        _check_timeout(start, "임베딩")
        embed_cache  = _load_embedding_cache(chunk_hashes)
        miss_indices = [i for i, h in enumerate(chunk_hashes) if h not in embed_cache]
        if miss_indices:
            miss_embeddings = embed_chunks([chunk_texts[i] for i in miss_indices])
            for i, emb in zip(miss_indices, miss_embeddings):
                embed_cache[chunk_hashes[i]] = emb
            logger.info("[processor] reembed new=%d cached=%d", len(miss_indices), len(chunk_hashes) - len(miss_indices))

        # 임베딩 업데이트
        with get_db() as (conn, cur):
            register_vector(conn)
            for chunk_id, c_hash in zip(chunk_ids, chunk_hashes):
                cur.execute(
                    "UPDATE chunks SET embedding=%s WHERE id=%s",
                    (embed_cache[c_hash], chunk_id),
                )
            cur.execute("UPDATE documents SET status='ready', updated_at=NOW() WHERE id=%s", (document_id,))

        logger.info("[processor] reembed done doc_id=%d chunks=%d elapsed=%.1fs",
                    document_id, len(rows), time.time() - start)
    except Exception as e:
        _set_doc_error(document_id, e, time.time() - start)
