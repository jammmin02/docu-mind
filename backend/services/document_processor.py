"""
문서 처리 백그라운드 파이프라인
upload → parse → chunk → embed(캐시 활용) → pgvector 저장 → status=ready

파이프라인 변경사항:
  - parse_file()이 List[PageResult] 반환 (페이지별 content + metadata)
  - chunk_pages()가 List[ChunkResult] 반환 (content + metadata)
  - chunks 테이블에 metadata JSONB, content_hash 컬럼 저장
  - content_hash(SHA-256) 기반 임베딩 캐시: 동일 텍스트는 재임베딩 생략
"""
import hashlib
import json
import logging
import time
import os
from typing import List

from pgvector.psycopg import register_vector

from db.database import get_db
from services.parser import parse_file, pages_to_text
from services.chunker import chunk_pages, estimate_tokens
from services.embedder import embed_chunks

logger = logging.getLogger(__name__)

PROCESSING_TIMEOUT = int(os.getenv("PROCESSING_TIMEOUT", 300))


def _hash_chunk(text: str) -> str:
    """청크 텍스트의 SHA-256 hex digest 반환 (임베딩 캐시 키)"""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _load_embedding_cache(hashes: List[str]) -> dict:
    """
    DB에서 주어진 해시 목록에 대한 기존 임베딩을 조회하여 캐시 맵 반환.
    반환: {content_hash: embedding_vector}
    """
    if not hashes:
        return {}
    try:
        with get_db() as (conn, cur):
            register_vector(conn)
            # DISTINCT ON으로 동일 해시에서 최신 임베딩 하나만 가져옴
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


# ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

def _check_timeout(start: float, step: str) -> None:
    elapsed = time.time() - start
    if elapsed > PROCESSING_TIMEOUT:
        raise TimeoutError(
            f"처리 시간 초과 ({elapsed:.0f}초 경과): {step} 단계에서 중단되었습니다. "
            f"파일이 너무 크거나 서버가 일시적으로 혼잡합니다. 재시도해 주세요."
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
        return f"OpenAI API 오류 (HTTP {getattr(e, 'status_code', '?')}) — 잠시 후 재시도해 주세요."
    if "청킹 결과가 없습니다" in str(e):
        return "문서에서 텍스트를 추출할 수 없습니다. 빈 파일이거나 이미지 기반 PDF일 수 있습니다."

    logger.error("[processor] unhandled error type=%s msg=%s", type(e).__name__, e, exc_info=True)
    return "파일 처리 중 예상치 못한 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."


# ── 메인 파이프라인 ───────────────────────────────────────────────────────────

def process_document(document_id: int, contents: bytes, file_type: str) -> None:
    """
    BackgroundTask로 실행되는 문서 처리 파이프라인.
    각 단계 전 타임아웃 검사 → 실패 시 status='failed'|'timeout' + error_message 기록.
    """
    logger.info("[processor] start  doc_id=%d type=%s", document_id, file_type)
    start = time.time()

    try:
        # ── 1. 파싱 (List[PageResult] 반환) ──────────────────────────────────
        _check_timeout(start, "파싱")
        pages = parse_file(contents, file_type)
        full_text = pages_to_text(pages)
        logger.info(
            "[processor] parsed  doc_id=%d pages=%d chars=%d",
            document_id, len(pages), len(full_text),
        )

        # ── 2. 청킹 (List[ChunkResult] 반환) ─────────────────────────────────
        _check_timeout(start, "청킹")
        chunk_results = chunk_pages(pages)
        if not chunk_results:
            raise ValueError("청킹 결과가 없습니다 (텍스트가 너무 짧거나 비어있음)")
        logger.info("[processor] chunked doc_id=%d chunks=%d", document_id, len(chunk_results))

        # ── 3. 임베딩 (캐시 우선) ────────────────────────────────────────────
        _check_timeout(start, "임베딩")
        chunk_texts  = [c.content for c in chunk_results]
        chunk_hashes = [_hash_chunk(t) for t in chunk_texts]

        # 캐시 조회 — 이미 DB에 있는 동일 텍스트 청크의 벡터 재사용
        embed_cache = _load_embedding_cache(chunk_hashes)

        # 캐시 미스 목록만 API 호출
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

        # ── 4. DB 저장 ────────────────────────────────────────────────────────
        _check_timeout(start, "DB 저장")
        with get_db() as (conn, cur):
            register_vector(conn)

            # 재처리 시 기존 청크 삭제
            cur.execute("DELETE FROM chunks WHERE document_id = %s", (document_id,))

            for idx, (chunk_result, embedding, c_hash) in enumerate(
                zip(chunk_results, embeddings, chunk_hashes)
            ):
                # 안전망: NUL 바이트가 청크 단계까지 남아있을 경우 제거
                safe_content  = chunk_result.content.replace("\x00", "")
                safe_metadata = {
                    k: v.replace("\x00", "") if isinstance(v, str) else v
                    for k, v in chunk_result.metadata.items()
                }
                cur.execute("""
                    INSERT INTO chunks
                        (document_id, content, embedding, chunk_index, token_count, metadata, content_hash)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (
                    document_id,
                    safe_content,
                    embedding,
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

        elapsed = time.time() - start
        logger.info(
            "[processor] done    doc_id=%d chunks=%d elapsed=%.1fs",
            document_id, len(chunk_results), elapsed,
        )

    except Exception as e:
        elapsed = time.time() - start
        status  = "timeout" if isinstance(e, TimeoutError) else "failed"
        err_msg = _friendly_error(e)

        logger.error(
            "[processor] %s  doc_id=%d elapsed=%.1fs error=%s",
            status, document_id, elapsed, err_msg,
        )

        try:
            with get_db() as (conn, cur):
                cur.execute("""
                    UPDATE documents
                    SET status        = %s,
                        error_message = %s,
                        updated_at    = NOW()
                    WHERE id = %s
                """, (status, err_msg, document_id))
        except Exception as db_err:
            logger.error("[processor] DB 상태 업데이트 실패: %s", db_err)
