"""
문서 처리 백그라운드 파이프라인
upload → parse → chunk → embed → pgvector 저장 → status=ready
"""
import logging
from typing import Optional

from pgvector.psycopg import register_vector

from db.database import get_db
from services.parser import parse_file
from services.chunker import chunk_text, estimate_tokens
from services.embedder import embed_chunks

logger = logging.getLogger(__name__)


def process_document(document_id: int, contents: bytes, file_type: str) -> None:
    """
    BackgroundTask로 실행되는 문서 처리 파이프라인.
    실패 시 documents.status = 'failed', error_message 저장.
    """
    logger.info(f"[processor] start  doc_id={document_id} type={file_type}")

    try:
        # ── 1. 파싱 ───────────────────────────────────────────────────────────
        text = parse_file(contents, file_type)
        logger.info(f"[processor] parsed doc_id={document_id} chars={len(text)}")

        # ── 2. 청킹 ───────────────────────────────────────────────────────────
        chunks = chunk_text(text)
        if not chunks:
            raise ValueError("청킹 결과가 없습니다 (텍스트가 너무 짧거나 비어있음)")
        logger.info(f"[processor] chunked doc_id={document_id} chunks={len(chunks)}")

        # ── 3. 임베딩 ──────────────────────────────────────────────────────────
        embeddings = embed_chunks(chunks)
        logger.info(f"[processor] embedded doc_id={document_id}")

        # ── 4. DB 저장 ─────────────────────────────────────────────────────────
        with get_db() as (conn, cur):
            register_vector(conn)   # pgvector 타입 등록

            # 기존 청크 삭제 (재처리 시)
            cur.execute("DELETE FROM chunks WHERE document_id = %s", (document_id,))

            # 청크 + 임베딩 저장
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

            # 문서 상태 → ready
            cur.execute("""
                UPDATE documents
                SET status      = 'ready',
                    content     = %s,
                    chunk_count = %s,
                    updated_at  = NOW()
                WHERE id = %s
            """, (text[:50000], len(chunks), document_id))   # content는 최대 50000자

        logger.info(f"[processor] done   doc_id={document_id} chunks={len(chunks)}")

    except Exception as e:
        error_msg = str(e)[:500]
        logger.error(f"[processor] failed doc_id={document_id} error={error_msg}")

        # 실패 상태 기록
        try:
            with get_db() as (conn, cur):
                cur.execute("""
                    UPDATE documents
                    SET status        = 'failed',
                        error_message = %s,
                        updated_at    = NOW()
                    WHERE id = %s
                """, (error_msg, document_id))
        except Exception as db_err:
            logger.error(f"[processor] DB update failed: {db_err}")
