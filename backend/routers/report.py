from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from typing import List
from db.database import get_db
import json

router = APIRouter(prefix="/reports", tags=["reports"])


class ReportRequest(BaseModel):
    document_id: int
    report_type: str   # summary | analysis | minutes


REPORT_TYPE_LABEL = {
    "summary":  "요약",
    "analysis": "분석",
    "minutes":  "회의록",
}

REPORT_PROMPTS = {
    "summary":  "핵심 내용을 3~5개 항목으로 요약해주세요.",
    "analysis": "데이터를 분석하고 인사이트와 개선안을 작성해주세요.",
    "minutes":  "회의록 형식(일시/참석자/안건/결정사항/액션아이템)으로 작성해주세요.",
}


@router.get("")
def list_reports():
    """보고서 목록"""
    with get_db() as (conn, cur):
        cur.execute("""
            SELECT id, document_ids, report_type, status, file_path, created_at
            FROM reports
            ORDER BY created_at DESC
        """)
        return cur.fetchall()


@router.get("/{report_id}")
def get_report(report_id: int):
    """보고서 상세"""
    with get_db() as (conn, cur):
        cur.execute("SELECT * FROM reports WHERE id = %s", (report_id,))
        report = cur.fetchone()
    if not report:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "REPORT_NOT_FOUND", "message": "보고서를 찾을 수 없습니다", "status": 404}
        })
    return report


@router.post("")
async def create_report(req: ReportRequest):
    """보고서 생성 — SSE 스트리밍"""
    if req.report_type not in REPORT_PROMPTS:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "INVALID_REPORT_TYPE", "message": "유효하지 않은 보고서 종류입니다", "status": 400}
        })

    # 문서 존재 및 ready 상태 확인
    with get_db() as (conn, cur):
        cur.execute("SELECT id, status, content FROM documents WHERE id = %s", (req.document_id,))
        doc = cur.fetchone()
    if not doc:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "DOCUMENT_NOT_FOUND", "message": "해당 문서를 찾을 수 없습니다", "status": 404}
        })
    if doc["status"] != "ready":
        raise HTTPException(status_code=409, detail={
            "error": {"code": "DOCUMENT_NOT_READY", "message": "문서가 아직 처리 중입니다", "status": 409}
        })

    # 보고서 레코드 생성
    with get_db() as (conn, cur):
        cur.execute("""
            INSERT INTO reports (document_ids, report_type, status)
            VALUES (%s, %s, 'generating')
            RETURNING id
        """, (json.dumps([req.document_id]), req.report_type))
        report_id = cur.fetchone()["id"]

    async def event_stream():
        # TODO: 실제 Claude API 스트리밍 연결
        # 1. 문서 컨텍스트 조합
        # 2. 양식별 프롬프트 분기
        # 3. Claude API SSE 스트리밍

        # 임시 스텁 응답
        stub_content = (
            f"# {REPORT_TYPE_LABEL[req.report_type]} 보고서\n\n"
            f"이 보고서는 문서 ID {req.document_id}를 기반으로 생성되었습니다.\n\n"
            "Claude API 연결 전 스텁 응답입니다."
        )
        for char in stub_content:
            yield f"data: {json.dumps({'type': 'token', 'content': char})}\n\n"

        # 완료 처리
        with get_db() as (conn, cur):
            cur.execute("""
                UPDATE reports SET content = %s, status = 'done'
                WHERE id = %s
            """, (stub_content, report_id))

        yield f"data: {json.dumps({'type': 'done', 'report_id': report_id, 'content': stub_content})}\n\n"

        # TODO: background_tasks.add_task(convert_to_file, report_id)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/{report_id}/download")
def download_report(report_id: int, format: str = "pdf"):
    """보고서 파일 다운로드"""
    with get_db() as (conn, cur):
        cur.execute("SELECT * FROM reports WHERE id = %s", (report_id,))
        report = cur.fetchone()
    if not report:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "REPORT_NOT_FOUND", "message": "보고서를 찾을 수 없습니다", "status": 404}
        })
    if not report["file_path"]:
        raise HTTPException(status_code=409, detail={
            "error": {"code": "REPORT_NOT_DONE", "message": "파일 변환이 아직 완료되지 않았습니다", "status": 409}
        })
    return FileResponse(report["file_path"], filename=f"report_{report_id}.{format}")
