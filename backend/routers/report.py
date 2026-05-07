"""
Reports 라우터 — RAG 기반 보고서 생성 + SSE 스트리밍
흐름: 문서 선택 → 타입 선택 → 컨텍스트 수집 → Claude 스트리밍 → 저장 → 다운로드
"""
import json
import logging
import os
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse, Response
from pydantic import BaseModel

from db.database import get_db
from services.retriever import search_chunks, format_context
from services.llm import stream_chat
from services.converter import md_to_pdf, md_to_docx

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports", tags=["reports"])

REPORT_STORAGE = Path(os.getenv("STORAGE_LOCAL_PATH", "./storage/uploads")) / "reports"

# ── 보고서 타입 정의 ───────────────────────────────────────────────────────────

REPORT_TYPES = {
    "summary": {
        "label":  "요약 보고서",
        "prompt": (
            "아래 문서를 바탕으로 핵심 내용을 체계적으로 요약하세요.\n\n"
            "작성 형식:\n"
            "## 개요\n(문서의 전체 목적과 배경)\n\n"
            "## 핵심 내용\n(3~5개 항목으로 정리)\n\n"
            "## 주요 결론\n(문서에서 도출되는 결론)"
        ),
    },
    "analysis": {
        "label":  "분석 보고서",
        "prompt": (
            "아래 문서를 바탕으로 심층 분석 보고서를 작성하세요.\n\n"
            "작성 형식:\n"
            "## 현황 분석\n(현재 상태와 주요 데이터)\n\n"
            "## 문제점 / 이슈\n(발견된 문제점과 원인)\n\n"
            "## 인사이트\n(분석에서 도출된 시사점)\n\n"
            "## 개선 방안\n(구체적인 액션 아이템)"
        ),
    },
    "minutes": {
        "label":  "회의록",
        "prompt": (
            "아래 문서를 바탕으로 공식 회의록 형식으로 작성하세요.\n\n"
            "작성 형식:\n"
            "## 회의 정보\n- 일시:\n- 장소:\n- 참석자:\n\n"
            "## 안건\n(논의된 주요 안건 목록)\n\n"
            "## 논의 내용\n(안건별 상세 논의 내용)\n\n"
            "## 결정 사항\n(합의된 내용)\n\n"
            "## 액션 아이템\n(담당자 | 내용 | 기한)"
        ),
    },
    "template_fill": {
        "label":  "양식 작성",
        "prompt": (
            "아래 문서 내용을 바탕으로 요청된 양식을 빠짐없이 채워서 작성하세요.\n"
            "문서에서 명확히 확인되지 않는 항목은 '[확인 필요]'로 표기하세요."
        ),
    },
}


# ── SSE 헬퍼 ──────────────────────────────────────────────────────────────────

def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


# ── 보고서 파일 저장 ──────────────────────────────────────────────────────────

def save_report_file(report_id: int, content: str) -> str:
    """생성된 보고서를 마크다운 파일로 저장하고 경로 반환"""
    REPORT_STORAGE.mkdir(parents=True, exist_ok=True)
    file_path = REPORT_STORAGE / f"report_{report_id}.md"
    file_path.write_text(content, encoding="utf-8")
    return str(file_path)


# ── 엔드포인트 ────────────────────────────────────────────────────────────────

class ReportRequest(BaseModel):
    document_ids: List[int]          # 선택한 문서 목록 (복수 가능)
    report_type:  str                # summary | analysis | minutes | template_fill
    query:        Optional[str] = "" # 추가 지시사항 (선택)
    top_k:        int   = 8          # 문서당 검색 청크 수
    score_cutoff: float = 0.2        # 보고서는 더 넓게 수집


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
    """
    보고서 생성 — SSE 스트리밍

    SSE 이벤트:
        {"type": "status",  "message": "..."}         — 진행 상태
        {"type": "token",   "content": "..."}         — 토큰 스트리밍
        {"type": "done",    "report_id": N, "content": "..."}  — 완료
        {"type": "error",   "message": "..."}         — 오류
    """
    if req.report_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail={
            "error": {
                "code": "INVALID_REPORT_TYPE",
                "message": f"지원하는 타입: {', '.join(REPORT_TYPES.keys())}",
                "status": 400,
            }
        })

    # 선택한 문서 모두 ready 상태 확인
    with get_db() as (conn, cur):
        cur.execute(
            "SELECT id, filename, status FROM documents WHERE id = ANY(%s)",
            (req.document_ids,)
        )
        docs = cur.fetchall()

    found_ids = {d["id"] for d in docs}
    missing   = set(req.document_ids) - found_ids
    if missing:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "DOCUMENT_NOT_FOUND", "message": f"문서 ID {missing} 를 찾을 수 없습니다", "status": 404}
        })

    not_ready = [d["filename"] for d in docs if d["status"] != "ready"]
    if not_ready:
        raise HTTPException(status_code=409, detail={
            "error": {"code": "DOCUMENT_NOT_READY", "message": f"처리 중인 문서: {not_ready}", "status": 409}
        })

    # 보고서 레코드 생성 (generating 상태)
    with get_db() as (conn, cur):
        cur.execute("""
            INSERT INTO reports (document_ids, report_type, status)
            VALUES (%s, %s, 'generating')
            RETURNING id
        """, (json.dumps(req.document_ids), req.report_type))
        report_id = cur.fetchone()["id"]

    type_info = REPORT_TYPES[req.report_type]

    async def event_stream():
        full_content = []

        try:
            # ── 1. 컨텍스트 수집 ────────────────────────────────────────────
            yield sse({"type": "status", "message": "관련 문서 검색 중..."})

            # 보고서용 쿼리: 타입 레이블 + 사용자 추가 지시 + 문서명
            filenames = " ".join(d["filename"] for d in docs)
            search_query = f"{type_info['label']} {req.query or ''} {filenames}".strip()

            chunks = search_chunks(
                query=search_query,
                top_k=req.top_k,
                score_cutoff=req.score_cutoff,
                document_ids=req.document_ids,
            )
            context = format_context(chunks)

            # ── 2. 프롬프트 구성 ─────────────────────────────────────────────
            base_prompt = type_info["prompt"]
            user_prompt = base_prompt
            if req.query:
                user_prompt += f"\n\n추가 지시사항: {req.query}"

            yield sse({"type": "status", "message": f"보고서 생성 중... (참고 청크 {len(chunks)}개)"})

            # ── 3. Claude 스트리밍 ───────────────────────────────────────────
            async for token in stream_chat(
                query=user_prompt,
                context=context,
                history=[],          # 보고서는 히스토리 없이 단발 생성
            ):
                full_content.append(token)
                yield sse({"type": "token", "content": token})

        except Exception as e:
            logger.error(f"[report] streaming error report_id={report_id}: {e}")

            # 실패 상태 저장
            with get_db() as (conn, cur):
                cur.execute("""
                    UPDATE reports
                    SET status = 'failed', error_message = %s
                    WHERE id = %s
                """, (str(e)[:500], report_id))

            yield sse({"type": "error", "message": str(e)[:200]})
            return

        # ── 4. 결과 저장 ──────────────────────────────────────────────────────
        final_content = "".join(full_content)
        file_path = save_report_file(report_id, final_content)

        with get_db() as (conn, cur):
            cur.execute("""
                UPDATE reports
                SET content   = %s,
                    file_path = %s,
                    status    = 'done'
                WHERE id = %s
            """, (final_content, file_path, report_id))

        yield sse({
            "type":      "done",
            "report_id": report_id,
            "content":   final_content,
        })

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{report_id}/download")
def download_report(report_id: int, format: str = "pdf"):
    """
    보고서 다운로드
    format: pdf (기본) | docx | md
    """
    with get_db() as (conn, cur):
        cur.execute("SELECT * FROM reports WHERE id = %s", (report_id,))
        report = cur.fetchone()

    if not report:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "REPORT_NOT_FOUND", "message": "보고서를 찾을 수 없습니다", "status": 404}
        })
    if report["status"] != "done":
        raise HTTPException(status_code=409, detail={
            "error": {"code": "REPORT_NOT_DONE", "message": "보고서 생성이 완료되지 않았습니다", "status": 409}
        })
    if not report["file_path"] or not Path(report["file_path"]).exists():
        raise HTTPException(status_code=404, detail={
            "error": {"code": "FILE_NOT_FOUND", "message": "파일을 찾을 수 없습니다", "status": 404}
        })

    md_text  = Path(report["file_path"]).read_text(encoding="utf-8")
    basename = f"report_{report_id}_{report['report_type']}"

    if format == "pdf":
        try:
            pdf_bytes = md_to_pdf(md_text)
        except Exception as e:
            logger.error("[download] PDF 변환 실패 report_id=%s: %s", report_id, e, exc_info=True)
            raise HTTPException(status_code=500, detail={
                "error": {"code": "PDF_CONVERSION_FAILED", "message": f"PDF 변환 실패: {e}", "status": 500}
            })
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{basename}.pdf"'},
        )

    elif format == "docx":
        try:
            docx_bytes = md_to_docx(md_text)
        except Exception as e:
            logger.error(f"[download] DOCX 변환 실패 report_id={report_id}: {e}")
            raise HTTPException(status_code=500, detail={
                "error": {"code": "DOCX_CONVERSION_FAILED", "message": "DOCX 변환 중 오류가 발생했습니다", "status": 500}
            })
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{basename}.docx"'} ,
        )

    else:  # md
        return FileResponse(
            path=report["file_path"],
            filename=f"{basename}.md",
            media_type="text/markdown",
        )


@router.delete("/{report_id}")
def delete_report(report_id: int):
    """보고서 삭제"""
    with get_db() as (conn, cur):
        cur.execute("SELECT file_path FROM reports WHERE id = %s", (report_id,))
        report = cur.fetchone()
        if not report:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "REPORT_NOT_FOUND", "message": "보고서를 찾을 수 없습니다", "status": 404}
            })
        cur.execute("DELETE FROM reports WHERE id = %s", (report_id,))

    if report["file_path"]:
        p = Path(report["file_path"])
        if p.exists():
            p.unlink()

    return {"message": "보고서가 삭제되었습니다"}
