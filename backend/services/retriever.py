"""
RAG 벡터 검색 서비스
쿼리 임베딩 → pgvector cosine 유사도 검색 → 상위 K개 청크 반환
"""
import logging
from typing import List, Dict, Any, Optional

from pgvector.psycopg import register_vector

from db.database import get_db
from services.embedder import embed_query

logger = logging.getLogger(__name__)

# 기본 검색 파라미터
DEFAULT_TOP_K        = int(5)   # 반환할 청크 수
DEFAULT_SCORE_CUTOFF = 0.3      # 최소 유사도 (0~1, cosine distance 기준)


def search_chunks(
    query: str,
    top_k: int = DEFAULT_TOP_K,
    score_cutoff: float = DEFAULT_SCORE_CUTOFF,
    document_ids: Optional[List[int]] = None,
) -> List[Dict[str, Any]]:
    """
    자연어 쿼리를 임베딩 → pgvector cosine 유사도 검색.

    Args:
        query:        검색할 자연어 질문
        top_k:        반환할 최대 청크 수
        score_cutoff: 이 값 미만 유사도 청크는 제외 (0=전체 허용, 1=완전일치만)
        document_ids: 특정 문서 ID만 검색 (None이면 전체 검색)

    Returns:
        [
          {
            "chunk_id":    int,
            "document_id": int,
            "filename":    str,
            "content":     str,
            "chunk_index": int,
            "score":       float,   # 유사도 (높을수록 관련성 높음)
          }, ...
        ]
    """
    logger.info(f"[retriever] query='{query[:50]}' top_k={top_k}")

    # 1. 쿼리 임베딩
    query_embedding = embed_query(query)

    # 2. pgvector 유사도 검색
    with get_db() as (conn, cur):
        register_vector(conn)

        if document_ids:
            # 특정 문서 범위 내 검색
            cur.execute("""
                SELECT
                    c.id          AS chunk_id,
                    c.document_id,
                    d.filename,
                    c.content,
                    c.chunk_index,
                    1 - (c.embedding <=> %s::vector) AS score
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE d.status = 'ready'
                  AND c.document_id = ANY(%s)
                ORDER BY c.embedding <=> %s::vector
                LIMIT %s
            """, (query_embedding, document_ids, query_embedding, top_k * 2))
        else:
            # 전체 검색
            cur.execute("""
                SELECT
                    c.id          AS chunk_id,
                    c.document_id,
                    d.filename,
                    c.content,
                    c.chunk_index,
                    1 - (c.embedding <=> %s::vector) AS score
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE d.status = 'ready'
                ORDER BY c.embedding <=> %s::vector
                LIMIT %s
            """, (query_embedding, query_embedding, top_k * 2))

        rows = cur.fetchall()

    # 3. score_cutoff 필터링 + top_k 자르기
    results = [
        {
            "chunk_id":    row["chunk_id"],
            "document_id": row["document_id"],
            "filename":    row["filename"],
            "content":     row["content"],
            "chunk_index": row["chunk_index"],
            "score":       round(float(row["score"]), 4),
        }
        for row in rows
        if float(row["score"]) >= score_cutoff
    ][:top_k]

    logger.info(f"[retriever] found {len(results)} chunks (cutoff={score_cutoff})")
    return results


def format_context(chunks: List[Dict[str, Any]]) -> str:
    """
    검색된 청크를 LLM 프롬프트에 삽입할 컨텍스트 문자열로 변환.

    출력 형태:
        [출처: 파일명.pdf | 청크 3]
        청크 내용 ...

        [출처: 파일명2.docx | 청크 7]
        청크 내용 ...
    """
    if not chunks:
        return "관련 문서를 찾을 수 없습니다."

    parts = []
    for chunk in chunks:
        header = f"[출처: {chunk['filename']} | 청크 {chunk['chunk_index']}]"
        parts.append(f"{header}\n{chunk['content']}")

    return "\n\n".join(parts)
