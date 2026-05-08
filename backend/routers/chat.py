"""
Chat 라우터 — RAG 파이프라인 + SSE 스트리밍
흐름: 질문 → 벡터 검색 → 프롬프트 구성 → Claude 스트리밍 → 저장
"""
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db.database import get_db
from services.retriever import search_chunks, format_context
from services.llm import stream_chat
from dependencies import get_current_user
from limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    session_id:   str
    query:        str
    document_ids: Optional[List[int]] = None   # None이면 전체 문서 검색
    top_k:        int   = 5
    score_cutoff: float = 0.3


# ── SSE 이벤트 헬퍼 ───────────────────────────────────────────────────────────

def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


# ── 세션 소유권 확인 헬퍼 ─────────────────────────────────────────────────────

def _assert_session_owner(session_id: str, user_id: int, is_admin: bool) -> dict:
    """
    세션이 존재하는지, 현재 사용자가 접근 가능한지 확인.
    - 관리자는 모든 세션 접근 가능
    - 일반 사용자는 자신의 세션(user_id 일치) 또는 레거시 세션(user_id IS NULL)만 접근 가능
    """
    with get_db() as (conn, cur):
        cur.execute(
            "SELECT session_id, user_id FROM chat_sessions WHERE session_id = %s",
            (session_id,)
        )
        session = cur.fetchone()

    if not session:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "SESSION_NOT_FOUND", "message": "세션을 찾을 수 없습니다", "status": 404}
        })

    # 관리자는 통과, 일반 사용자는 소유권 확인
    if not is_admin:
        owner_id = session["user_id"]
        if owner_id is not None and owner_id != user_id:
            raise HTTPException(status_code=403, detail={
                "error": {"code": "FORBIDDEN", "message": "해당 세션에 접근할 권한이 없습니다", "status": 403}
            })

    return dict(session)


# ── 메인 채팅 엔드포인트 ──────────────────────────────────────────────────────

@router.post("")
@limiter.limit("30/minute")   # IP당 분당 30회 — LLM 비용 및 서버 부하 제한
async def chat(request: Request, req: ChatRequest, current_user: dict = Depends(get_current_user)):
    """
    질문 전송 → SSE 스트리밍 응답

    SSE 이벤트 형식:
        {"type": "token",  "content": "..."}   — 토큰 단위 응답
        {"type": "sources","sources": [...]}   — 참고 문서 출처
        {"type": "done",   "content": "전체"}  — 스트리밍 완료
        {"type": "error",  "message": "..."}   — 오류
    """
    if not req.query.strip():
        raise HTTPException(status_code=400, detail={
            "error": {"code": "EMPTY_QUERY", "message": "질문을 입력해주세요", "status": 400}
        })

    user_id  = current_user["id"]
    is_admin = current_user["role"] == "admin"

    # ── 1. 세션 초기화 / 사용자 메시지 저장 ───────────────────────────────────
    with get_db() as (conn, cur):
        cur.execute(
            "SELECT session_id, user_id FROM chat_sessions WHERE session_id = %s",
            (req.session_id,)
        )
        existing = cur.fetchone()

        if not existing:
            # 신규 세션: user_id 포함하여 생성
            cur.execute("""
                INSERT INTO chat_sessions (session_id, user_id, title, updated_at)
                VALUES (%s, %s, %s, NOW())
            """, (req.session_id, user_id, req.query[:30]))
        else:
            # 기존 세션 소유권 확인 (관리자 제외)
            if not is_admin:
                owner_id = existing["user_id"]
                if owner_id is not None and owner_id != user_id:
                    raise HTTPException(status_code=403, detail={
                        "error": {"code": "FORBIDDEN", "message": "해당 세션에 접근할 권한이 없습니다", "status": 403}
                    })

        cur.execute("""
            INSERT INTO chat_messages (session_id, role, content)
            VALUES (%s, 'user', %s)
        """, (req.session_id, req.query))

    # ── 2. 대화 히스토리 로드 (최근 20개) ────────────────────────────────────
    with get_db() as (conn, cur):
        cur.execute("""
            SELECT role, content
            FROM chat_messages
            WHERE session_id = %s
            ORDER BY created_at DESC
            LIMIT 20
        """, (req.session_id,))
        rows = cur.fetchall()

    # 시간순 정렬, 마지막 user 메시지(방금 저장한 것) 제외
    history = [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]
    if history and history[-1]["role"] == "user":
        history = history[:-1]

    # ── 3. 벡터 검색 ─────────────────────────────────────────────────────────
    try:
        chunks = search_chunks(
            query=req.query,
            top_k=req.top_k,
            score_cutoff=req.score_cutoff,
            document_ids=req.document_ids,
        )
        context = format_context(chunks)
        sources = [
            {
                "filename":    c["filename"],
                "chunk_index": c["chunk_index"],
                "score":       c["score"],
            }
            for c in chunks
        ]
    except Exception as e:
        logger.error(f"[chat] retrieval error: {e}")
        chunks  = []
        context = ""
        sources = []

    # ── 4. SSE 스트리밍 ───────────────────────────────────────────────────────
    async def event_stream():
        full_reply = []

        try:
            if sources:
                yield sse({"type": "sources", "sources": sources})

            async for token in stream_chat(
                query=req.query,
                context=context,
                history=history,
            ):
                full_reply.append(token)
                yield sse({"type": "token", "content": token})

        except Exception as e:
            logger.error("[chat] streaming error: %s", e, exc_info=True)
            yield sse({"type": "error", "message": "응답 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."})

        finally:
            # ── 5. 어시스턴트 메시지 저장 ─────────────────────────────────────
            reply_text = "".join(full_reply)
            if reply_text:
                try:
                    with get_db() as (conn, cur):
                        cur.execute("""
                            INSERT INTO chat_messages
                                (session_id, role, content, sources)
                            VALUES (%s, 'assistant', %s, %s)
                        """, (req.session_id, reply_text, json.dumps(sources)))

                        cur.execute("""
                            UPDATE chat_sessions
                            SET updated_at           = NOW(),
                                total_messages       = total_messages + 2,
                                last_message_preview = %s
                            WHERE session_id = %s
                        """, (reply_text[:80], req.session_id))
                except Exception as db_err:
                    logger.error(f"[chat] DB save error: {db_err}")

            yield sse({"type": "done", "content": reply_text})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── 세션 관리 ─────────────────────────────────────────────────────────────────

@router.get("/sessions")
def list_sessions(current_user: dict = Depends(get_current_user)):
    """세션 목록 — 관리자는 전체, 일반 사용자는 자신의 세션만"""
    user_id  = current_user["id"]
    is_admin = current_user["role"] == "admin"

    with get_db() as (conn, cur):
        if is_admin:
            cur.execute("""
                SELECT session_id, title, total_messages, last_message_preview, updated_at
                FROM chat_sessions
                ORDER BY updated_at DESC
            """)
        else:
            # 자신의 세션 + 레거시(user_id IS NULL) 세션
            cur.execute("""
                SELECT session_id, title, total_messages, last_message_preview, updated_at
                FROM chat_sessions
                WHERE user_id = %s OR user_id IS NULL
                ORDER BY updated_at DESC
            """, (user_id,))
        return cur.fetchall()


@router.get("/sessions/{session_id}")
def get_session(session_id: str, limit: int = 50, offset: int = 0,
                current_user: dict = Depends(get_current_user)):
    """세션 메시지 조회 (소유권 검증)"""
    user_id  = current_user["id"]
    is_admin = current_user["role"] == "admin"

    _assert_session_owner(session_id, user_id, is_admin)

    with get_db() as (conn, cur):
        cur.execute("""
            SELECT role, content, sources, created_at
            FROM chat_messages
            WHERE session_id = %s
            ORDER BY created_at ASC
            LIMIT %s OFFSET %s
        """, (session_id, limit, offset))
        return cur.fetchall()


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    """세션 삭제 (소유권 검증)"""
    user_id  = current_user["id"]
    is_admin = current_user["role"] == "admin"

    _assert_session_owner(session_id, user_id, is_admin)

    with get_db() as (conn, cur):
        cur.execute(
            "DELETE FROM chat_sessions WHERE session_id = %s",
            (session_id,)
        )
    return {"message": "세션이 삭제되었습니다"}
