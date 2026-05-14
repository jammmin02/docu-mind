"""
RAG 벡터 검색 서비스
쿼리 임베딩 → pgvector cosine 유사도 검색 → 상위 K개 청크 반환

검색 결과에 chunks.metadata (page_number, has_table, section, ocr_applied) 포함.
format_context()에서 페이지 번호 / 표 여부를 출처 헤더에 표시.
"""
import logging
from typing import Any, Dict, List, Optional

from pgvector.psycopg import register_vector

from db.database import get_db
from services.embedder import embed_query

logger = logging.getLogger(__name__)

DEFAULT_TOP_K        = 5
DEFAULT_SCORE_CUTOFF = 0.3


def search_chunks(
    query: str,
    top_k: int = DEFAULT_TOP_K,
    score_cutoff: float = DEFAULT_SCORE_CUTOFF,
    document_ids: Optional[List[int]] = None,
) -> List[Dict[str, Any]]:
    """
    자연어 쿼리를 임베딩 → pgvector cosine 유사도 검색.

    Returns:
        [
          {
            "chunk_id":    int,
            "document_id": int,
            "filename":    str,
            "content":     str,
            "chunk_index": int,
            "score":       float,
            "metadata":    dict,   ← page_number, has_table, section, ocr_applied
          }, ...
        ]
    """
    logger.info("[retriever] query='%s' top_k=%d", query[:50], top_k)

    query_embedding = embed_query(query)

    with get_db() as (conn, cur):
        register_vector(conn)

        if document_ids:
            cur.execute("""
                SELECT
                    c.id            AS chunk_id,
                    c.document_id,
                    d.filename,
                    c.content,
                    c.chunk_index,
                    c.metadata,
                    1 - (c.embedding <=> %s::vector) AS score
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE d.status = 'ready'
                  AND c.document_id = ANY(%s)
                ORDER BY c.embedding <=> %s::vector
                LIMIT %s
            """, (query_embedding, document_ids, query_embedding, top_k * 2))
        else:
            cur.execute("""
                SELECT
                    c.id            AS chunk_id,
                    c.document_id,
                    d.filename,
                    c.content,
                    c.chunk_index,
                    c.metadata,
                    1 - (c.embedding <=> %s::vector) AS score
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE d.status = 'ready'
                ORDER BY c.embedding <=> %s::vector
                LIMIT %s
            """, (query_embedding, query_embedding, top_k * 2))

        rows = cur.fetchall()

    results = [
        {
            "chunk_id":    row["chunk_id"],
            "document_id": row["document_id"],
            "filename":    row["filename"],
            "content":     row["content"],
            "chunk_index": row["chunk_index"],
            "score":       round(float(row["score"]), 4),
            "metadata":    row["metadata"] if row["metadata"] else {},
        }
        for row in rows
        if float(row["score"]) >= score_cutoff
    ][:top_k]

    logger.info("[retriever] found %d chunks (cutoff=%.2f)", len(results), score_cutoff)
    return results


def format_context(chunks: List[Dict[str, Any]]) -> str:
    """
    검색된 청크를 LLM 프롬프트용 컨텍스트 문자열로 변환.

    출력 예시:
        [출처: 보고서.pdf | p.3 | 표 포함]
        청크 내용 ...

        [출처: 회의록.docx | 청크 7]
        청크 내용 ...
    """
    if not chunks:
        return "관련 문서를 찾을 수 없습니다."

    parts = []
    for chunk in chunks:
        meta        = chunk.get("metadata") or {}
        page_num    = meta.get("page_number")
        has_table   = meta.get("has_table", False)
        section     = meta.get("section")

        # 출처 헤더 구성
        header_parts = [f"출처: {chunk['filename']}"]
        if page_num is not None:
            header_parts.append(f"p.{page_num}")
        if section:
            header_parts.append(f"섹션: {section}")
        if has_table:
            header_parts.append("표 포함")

        header = "[" + " | ".join(header_parts) + "]"
        parts.append(f"{header}\n{chunk['content']}")

    return "\n\n".join(parts)
