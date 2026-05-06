from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from db.database import get_db
import json

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    session_id: str
    query: str
    document_ids: Optional[List[int]] = []


@router.post("")
async def chat(req: ChatRequest):
    """질문 전송 — SSE 스트리밍 응답"""

    # 세션 없으면 생성
    with get_db() as (conn, cur):
        cur.execute("SELECT session_id FROM chat_sessions WHERE session_id = %s", (req.session_id,))
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO chat_sessions (session_id, title, updated_at)
                VALUES (%s, %s, NOW())
            """, (req.session_id, req.query[:20]))

        # 사용자 메시지 저장
        cur.execute("""
            INSERT INTO chat_messages (session_id, role, content)
            VALUES (%s, 'user', %s)
        """, (req.session_id, req.query))

    async def event_stream():
        # TODO: 실제 RAG 파이프라인 연결
        # 1. 쿼리 임베딩
        # 2. 벡터 검색
        # 3. 컨텍스트 빌더
        # 4. Claude API 스트리밍 호출

        # 임시 스텁 응답
        stub_reply = f"'{req.query}'에 대한 답변입니다. (RAG 파이프라인 연결 전 스텁)"
        for word in stub_reply.split():
            yield f"data: {json.dumps({'type': 'token', 'content': word + ' '})}\n\n"

        sources = []
        yield f"data: {json.dumps({'type': 'done', 'sources': sources})}\n\n"

        # 어시스턴트 메시지 저장
        with get_db() as (conn, cur):
            cur.execute("""
                INSERT INTO chat_messages (session_id, role, content, sources)
                VALUES (%s, 'assistant', %s, %s)
            """, (req.session_id, stub_reply, json.dumps(sources)))
            cur.execute("""
                UPDATE chat_sessions
                SET updated_at = NOW(), total_messages = total_messages + 2,
                    last_message_preview = %s
                WHERE session_id = %s
            """, (stub_reply[:50], req.session_id))

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/sessions")
def list_sessions():
    """세션 목록"""
    with get_db() as (conn, cur):
        cur.execute("""
            SELECT session_id, title, total_messages, last_message_preview, updated_at
            FROM chat_sessions
            ORDER BY updated_at DESC
        """)
        return cur.fetchall()


@router.get("/sessions/{session_id}")
def get_session(session_id: str, limit: int = 50, offset: int = 0):
    """세션 메시지 조회"""
    with get_db() as (conn, cur):
        cur.execute("SELECT session_id FROM chat_sessions WHERE session_id = %s", (session_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail={
                "error": {"code": "SESSION_NOT_FOUND", "message": "세션을 찾을 수 없습니다", "status": 404}
            })
        cur.execute("""
            SELECT role, content, sources, created_at
            FROM chat_messages
            WHERE session_id = %s
            ORDER BY created_at ASC
            LIMIT %s OFFSET %s
        """, (session_id, limit, offset))
        return cur.fetchall()


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    """세션 삭제"""
    with get_db() as (conn, cur):
        cur.execute("DELETE FROM chat_sessions WHERE session_id = %s", (session_id,))
    return {"message": "세션이 삭제되었습니다"}
