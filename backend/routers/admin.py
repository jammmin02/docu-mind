"""
관리자 디버그 / 검수 전용 라우터

엔드포인트:
  GET  /admin/documents/{doc_id}/chunks   — 청크 목록
  GET  /admin/chunks/{chunk_id}           — 청크 상세
  POST /admin/debug/search               — 검색 디버그 (LLM 실호출 포함)
"""
import json
import logging
import time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from db.database import get_db
from dependencies import require_admin
from services.retriever import search_chunks, format_context
from services.llm import call_llm_once, build_messages, SYSTEM_PROMPT

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


# ── 청크 목록 ──────────────────────────────────────────────────────────────────

@router.get("/documents/{doc_id}/chunks")
def get_document_chunks(
    doc_id: int,
    page:    int   = Query(default=1,   ge=1),
    size:    int   = Query(default=50,  ge=1, le=200),
    sort:    str   = Query(default="index",
                           description="index | token_count | char_count"),
    section: Optional[str] = Query(default=None, description="섹션 이름 필터"),
    _: dict = Depends(require_admin),
):
    """
    문서에 속한 청크 목록을 반환합니다.

    반환 필드:
      id, chunk_index, char_count, token_count, section,
      page_number, has_table, ocr_applied, preview(50자)
    """
    with get_db() as (conn, cur):
        # 문서 존재 여부 확인
        cur.execute("SELECT id, filename, status FROM documents WHERE id = %s", (doc_id,))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "DOCUMENT_NOT_FOUND",
                          "message": "해당 문서를 찾을 수 없습니다", "status": 404}
            })

        # 섹션 필터 조건
        section_filter = ""
        params_base = [doc_id]
        if section:
            section_filter = "AND (metadata->>'section') ILIKE %s"
            params_base.append(f"%{section}%")

        # 정렬 기준
        order_map = {
            "index":       "chunk_index ASC",
            "token_count": "token_count DESC",
            "char_count":  "LENGTH(content) DESC",
        }
        order_clause = order_map.get(sort, "chunk_index ASC")

        # 전체 건수
        cur.execute(
            f"SELECT COUNT(*) AS cnt FROM chunks WHERE document_id = %s {section_filter}",
            params_base,
        )
        total = cur.fetchone()["cnt"]

        # 페이지 조회
        offset = (page - 1) * size
        cur.execute(
            f"""
            SELECT
                id,
                chunk_index,
                token_count,
                LENGTH(content)                     AS char_count,
                metadata->>'section'                AS section,
                (metadata->>'page_number')::int     AS page_number,
                (metadata->>'has_table')::boolean   AS has_table,
                (metadata->>'ocr_applied')::boolean AS ocr_applied,
                LEFT(content, 80)                   AS preview
            FROM chunks
            WHERE document_id = %s {section_filter}
            ORDER BY {order_clause}
            LIMIT %s OFFSET %s
            """,
            params_base + [size, offset],
        )
        rows = cur.fetchall()

    return {
        "document_id":   doc_id,
        "document_name": doc["filename"],
        "total":         total,
        "page":          page,
        "size":          size,
        "chunks":        rows,
    }


# ── 청크 상세 ──────────────────────────────────────────────────────────────────

@router.get("/chunks/{chunk_id}")
def get_chunk(chunk_id: int, _: dict = Depends(require_admin)):
    """
    단일 청크의 전체 내용을 반환합니다.
    """
    with get_db() as (conn, cur):
        cur.execute(
            """
            SELECT
                c.id,
                c.document_id,
                d.filename,
                c.chunk_index,
                c.token_count,
                LENGTH(c.content)                   AS char_count,
                c.content,
                c.metadata,
                c.content_hash,
                metadata->>'section'                AS section,
                (metadata->>'page_number')::int     AS page_number,
                (metadata->>'has_table')::boolean   AS has_table,
                (metadata->>'ocr_applied')::boolean AS ocr_applied
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.id = %s
            """,
            (chunk_id,),
        )
        chunk = cur.fetchone()

    if not chunk:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "CHUNK_NOT_FOUND",
                      "message": "해당 청크를 찾을 수 없습니다", "status": 404}
        })
    return chunk


# ── 검색 디버그 ────────────────────────────────────────────────────────────────

class DebugSearchRequest(BaseModel):
    query:        str
    document_ids: Optional[List[int]] = None
    category_id:  Optional[int]       = None
    top_k:        int   = 5
    score_cutoff: float = 0.3
    call_llm:     bool  = True


@router.post("/debug/search")
async def debug_search(req: DebugSearchRequest, _: dict = Depends(require_admin)):
    """
    테스트 질문으로 RAG 파이프라인 전체를 실행하고 디버그 정보를 반환합니다.

    반환:
      query, chunks(rank/score/chunk_id/filename/section/page_number/preview),
      llm_context, llm_prompt_preview, answer(call_llm=true 시), elapsed_ms
    """
    if not req.query.strip():
        raise HTTPException(status_code=400, detail={
            "error": {"code": "EMPTY_QUERY", "message": "질문을 입력해주세요", "status": 400}
        })

    start = time.time()

    # ── 1. category_id → document_ids 변환 ─────────────────────────────────
    document_ids = req.document_ids
    if document_ids is None and req.category_id is not None:
        with get_db() as (conn, cur):
            cur.execute(
                "SELECT id FROM documents WHERE category_id = %s AND status = 'ready'",
                (req.category_id,),
            )
            rows = cur.fetchall()
            document_ids = [r["id"] for r in rows] if rows else [-1]

    # ── 2. 벡터 검색 ─────────────────────────────────────────────────────────
    try:
        chunks = search_chunks(
            query=req.query,
            top_k=req.top_k,
            score_cutoff=req.score_cutoff,
            document_ids=document_ids,
        )
    except Exception as e:
        logger.error("[admin/debug] retrieval error: %s", e)
        raise HTTPException(status_code=500, detail={
            "error": {"code": "RETRIEVAL_ERROR",
                      "message": f"검색 중 오류가 발생했습니다: {str(e)}", "status": 500}
        })

    context = format_context(chunks)

    # 반환용 chunk 요약 리스트
    chunk_list = [
        {
            "rank":        i + 1,
            "score":       c["score"],
            "chunk_id":    c["chunk_id"],
            "document_id": c["document_id"],
            "filename":    c["filename"],
            "chunk_index": c["chunk_index"],
            "section":     c.get("metadata", {}).get("section"),
            "page_number": c.get("metadata", {}).get("page_number"),
            "has_table":   c.get("metadata", {}).get("has_table", False),
            "preview":     c["content"][:120],
        }
        for i, c in enumerate(chunks)
    ]

    # ── 3. LLM 프롬프트 미리보기 구성 ────────────────────────────────────────
    messages = build_messages(query=req.query, context=context, history=[])
    user_content = messages[-1]["content"] if messages else ""
    prompt_preview = f"[System]\n{SYSTEM_PROMPT}\n\n[User]\n{user_content}"

    # ── 4. LLM 실호출 (call_llm=True) ────────────────────────────────────────
    answer = None
    if req.call_llm:
        try:
            answer = await call_llm_once(
                query=req.query,
                context=context,
                history=[],
            )
        except Exception as e:
            logger.error("[admin/debug] llm error: %s", e)
            answer = f"[LLM 오류: {str(e)[:200]}]"

    elapsed_ms = round((time.time() - start) * 1000)

    return {
        "query":               req.query,
        "chunks":              chunk_list,
        "llm_context":         context,
        "llm_prompt_preview":  prompt_preview[:2000],
        "answer":              answer,
        "elapsed_ms":          elapsed_ms,
        "chunk_count":         len(chunk_list),
    }
