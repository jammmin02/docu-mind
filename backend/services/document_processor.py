"""
문서 처리 백그라운드 파이프라인
upload → parse → chunk → embed → pgvector 저장 → status=ready

타임아웃: 각 단계 진입 전 경과 시간 확인 (PROCESSING_TIMEOUT 초 초과 시 중단)
에러 메시지: 사용자가 이해할 수 있는 한국어 안내로 변환
"""
import logging
import time
import os

from pgvector.psycopg import register_vector

from db.database import get_db
from services.parser import parse_file
from services.chunker import chunk_text, estimate_tokens
from services.embedder import embed_chunks

logger = logging.getLogger(__name__)

# 전체 처리 허용 시간 (초). 기본 5분.
PROCESSING_TIMEOUT = int(os.getenv("PROCESSING_TIMEOUT", 300))


# ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

def _check_timeout(start: float, step: str) -> None:
    """경과 시간이 PROCESSING_TIMEOUT을 초과하면 TimeoutError raise"""
    elapsed = time.time() - start
    if elapsed > PROCESSING_TIMEOUT:
        raise TimeoutError(
            f"처리 시간 초과 ({elapsed:.0f}초 경과): {step} 단계에서 중단되었습니다. "
            f"파일이 너무 크거나 서버가 일시적으로 혼잡합니다. 재시도해 주세요."
        )


def _friendly_error(e: Exception) -> str:
    """예외를 사용자 친화적 한국어 메시지로 변환"""
    name = type(e).__name__

    if name == "RateLimitError":
        return "OpenAI API 요청 한도 초과 — 잠시 후 재시도해 주세요."
    if name == "AuthenticationError":
        return "OpenAI API 키가 유효하지 않습니다. 관리자에게 문의해 주세요."
    if name in ("APITimeoutError", "TimeoutError") or "처리 시간 초과" in str(e):
        # 직접 raise한 TimeoutError 메시지는 그대로
        return str(e) if "처리 시간 초과" in str(e) else "임베딩 API 응답 시간 초과 — 재시도해 주세요."
    if name == "APIConnectionError":
        return "OpenAI API 연결 실패 — 네트워크 상태를 확인해 주세요."
    if name == "APIStatusError":
        return f"OpenAI API 오류 (HTTP {getattr(e, 'status_code', '?')}) — 잠시 후 재시도해 주세요."
    if "청킹 결과가 없습니다" in str(e):
        return "문서에서 텍스트를 추출할 수 없습니다. 빈 파일이거나 이미지 기반 PDF일 수 있습니다."

    # 그 외 예외: 내부 오류 상세는 서버 로그에만 기록, 사용자에게는 일반 메시지 반환
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
        # ── 1. 파싱 ───────────────────────────────────────────────────────────
        _check_timeout(start, "파싱")
        text = parse_file(contents, file_type)
        logger.info("[processor] parsed  doc_id=%d chars=%d", document_id, len(text))

        # ── 2. 청킹 ───────────────────────────────────────────────────────────
        _check_timeout(start, "청킹")
        chunks = chunk_text(text)
        if not chunks:
            raise ValueError("청킹 결과가 없습니다 (텍스트가 너무 짧거나 비어있음)")
        logger.info("[processor] chunked doc_id=%d chunks=%d", document_id, len(chunks))

        # ── 3. 임베딩 ─────────────────────────────────────────────────────────
        _check_timeout(start, "임베딩")
        embeddings = embed_chunks(chunks)
        logger.info("[processor] embedded doc_id=%d", document_id)

        # ── 4. DB 저장 ────────────────────────────────────────────────────────
        _check_timeout(start, "DB 저장")
        with get_db() as (conn, cur):
            register_vector(conn)

            # 재처리 시 기존 청크 삭제
            cur.execute("DELETE FROM chunks WHERE document_id = %s", (document_id,))

            for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                cur.execute("""
                    INSERT INTO chunks
                        (document_id, content, embedding, chunk_index, token_count)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    document_id,
                    chunk,
                    embedding,
                    idx,
                    estimate_tokens(chunk),
                ))

            cur.execute("""
                UPDATE documents
                SET status      = 'ready',
                    content     = %s,
                    chunk_count = %s,
                    updated_at  = NOW()
                WHERE id = %s
            """, (text[:50000], len(chunks), document_id))

        elapsed = time.time() - start
        logger.info(
            "[processor] done    doc_id=%d chunks=%d elapsed=%.1fs",
            document_id, len(chunks), elapsed,
        )

    except Exception as e:
        elapsed  = time.time() - start
        status   = "timeout" if isinstance(e, TimeoutError) else "failed"
        err_msg  = _friendly_error(e)

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
