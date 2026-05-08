"""
Reports 라우터 — RAG 기반 보고서 생성 + SSE 스트리밍
흐름: 문서 선택 → 타입 선택 → 컨텍스트 수집 → Claude 스트리밍 → 저장 → 다운로드
"""
import json
import logging
import os
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse, FileResponse, Response
from pydantic import BaseModel

from db.database import get_db
from services.retriever import search_chunks, format_context
from services.llm import stream_chat
from services.converter import md_to_pdf, md_to_docx
from dependencies import get_current_user
from limiter import limiter

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


# ── 템플릿 → 프롬프트 변환 ────────────────────────────────────────────────────

def _build_template_prompt(sections: list) -> str:
    """
    섹션 목록을 LLM 프롬프트로 변환.
    required_input=True 섹션은 '[사용자 입력 필요]' 표시.
    """
    lines = ["아래 구조에 따라 보고서를 작성하세요. 각 섹션 제목을 ## 헤더로 사용하세요.\n"]
    for s in sections:
        title = s.get("title", "")
        desc  = s.get("description", "")
        req   = s.get("required_input", False)
        ph    = s.get("placeholder", "")
        if req:
            lines.append(f"## {title}\n[사용자 입력 필요 — {ph or desc}]\n(이 항목은 사용자가 직접 입력해야 합니다. 임의로 작성하지 마세요.)")
        else:
            lines.append(f"## {title}\n({desc})")
    return "\n\n".join(lines)


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
    document_ids: List[int]                # 선택한 문서 목록 (복수 가능)
    report_type:  Optional[str] = None     # 레거시: summary | analysis | minutes
    template_id:  Optional[int] = None     # 신규: report_structures.id
    query:        Optional[str] = ""       # 추가 지시사항 (선택)
    top_k:        int   = 8
    score_cutoff: float = 0.2


def _assert_report_owner(report_id: int, user_id: int, is_admin: bool) -> dict:
    """
    보고서 존재 확인 + 소유권 검증.
    - 관리자는 모든 보고서 접근 가능
    - 일반 사용자는 자신의 보고서(user_id 일치) 또는 레거시(user_id IS NULL)만 접근 가능
    템플릿 이름·활성 여부도 함께 반환 (삭제된 템플릿 표시용)
    """
    with get_db() as (conn, cur):
        cur.execute("""
            SELECT r.*,
                   rs.name      AS template_name,
                   rs.is_active AS template_active
            FROM reports r
            LEFT JOIN report_structures rs ON rs.id = r.structure_id
            WHERE r.id = %s
        """, (report_id,))
        report = cur.fetchone()

    if not report:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "REPORT_NOT_FOUND", "message": "보고서를 찾을 수 없습니다", "status": 404}
        })

    if not is_admin:
        owner_id = report["user_id"]
        if owner_id is not None and owner_id != user_id:
            raise HTTPException(status_code=403, detail={
                "error": {"code": "FORBIDDEN", "message": "해당 보고서에 접근할 권한이 없습니다", "status": 403}
            })

    return dict(report)


@router.get("")
def list_reports(current_user: dict = Depends(get_current_user)):
    """보고서 목록 — 관리자는 전체, 일반 사용자는 자신의 보고서만"""
    user_id  = current_user["id"]
    is_admin = current_user["role"] == "admin"

    with get_db() as (conn, cur):
        if is_admin:
            cur.execute("""
                SELECT r.id, r.document_ids, r.report_type, r.status, r.file_path, r.created_at,
                       rs.name        AS template_name,
                       rs.is_active   AS template_active
                FROM reports r
                LEFT JOIN report_structures rs ON rs.id = r.structure_id
                ORDER BY r.created_at DESC
            """)
        else:
            cur.execute("""
                SELECT r.id, r.document_ids, r.report_type, r.status, r.file_path, r.created_at,
                       rs.name        AS template_name,
                       rs.is_active   AS template_active
                FROM reports r
                LEFT JOIN report_structures rs ON rs.id = r.structure_id
                WHERE r.user_id = %s OR r.user_id IS NULL
                ORDER BY r.created_at DESC
            """, (user_id,))
        return cur.fetchall()


@router.get("/{report_id}")
def get_report(report_id: int, current_user: dict = Depends(get_current_user)):
    """보고서 상세 (소유권 검증)"""
    return _assert_report_owner(report_id, current_user["id"], current_user["role"] == "admin")


@router.post("")
@limiter.limit("10/minute")   # IP당 분당 10회 — LLM 비용 및 서버 부하 제한
async def create_report(request: Request, req: ReportRequest, current_user: dict = Depends(get_current_user)):
    """
    보고서 생성 — SSE 스트리밍

    SSE 이벤트:
        {"type": "status",  "message": "..."}         — 진행 상태
        {"type": "token",   "content": "..."}         — 토큰 스트리밍
        {"type": "done",    "report_id": N, "content": "..."}  — 완료
        {"type": "error",   "message": "..."}         — 오류
    """
    # ── 요청 유효성 검사 ─────────────────────────────────────────────────────────
    if not req.template_id and not req.report_type:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "MISSING_TYPE", "message": "template_id 또는 report_type 중 하나는 필수입니다", "status": 400}
        })

    # 템플릿 로드 (template_id 우선)
    structure = None
    if req.template_id:
        with get_db() as (conn, cur):
            cur.execute("SELECT * FROM report_structures WHERE id = %s AND is_active = TRUE", (req.template_id,))
            row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "TEMPLATE_NOT_FOUND", "message": "템플릿을 찾을 수 없습니다", "status": 404}
            })
        sections = row["sections"]
        if isinstance(sections, str):
            sections = json.loads(sections)
        structure = {"name": row["name"], "sections": sections}
    elif req.report_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "INVALID_REPORT_TYPE", "message": f"지원하는 타입: {', '.join(REPORT_TYPES.keys())}", "status": 400}
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

    # 보고서 레코드 생성 (user_id 포함)
    actual_type = req.report_type or "custom"
    with get_db() as (conn, cur):
        cur.execute("""
            INSERT INTO reports (user_id, document_ids, report_type, structure_id, status)
            VALUES (%s, %s, %s, %s, 'generating')
            RETURNING id
        """, (current_user["id"], json.dumps(req.document_ids), actual_type, req.template_id))
        report_id = cur.fetchone()["id"]

    # 프롬프트 결정
    if structure:
        label      = structure["name"]
        base_prompt = _build_template_prompt(structure["sections"])
    else:
        type_info   = REPORT_TYPES[req.report_type]
        label       = type_info["label"]
        base_prompt = type_info["prompt"]

    async def event_stream():
        full_content = []

        try:
            # ── 1. 컨텍스트 수집 ────────────────────────────────────────────
            yield sse({"type": "status", "message": "관련 문서 검색 중..."})

            filenames = " ".join(d["filename"] for d in docs)
            search_query = f"{label} {req.query or ''} {filenames}".strip()

            chunks = search_chunks(
                query=search_query,
                top_k=req.top_k,
                score_cutoff=req.score_cutoff,
                document_ids=req.document_ids,
            )
            context = format_context(chunks)

            # ── 2. 프롬프트 구성 ─────────────────────────────────────────────
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

            yield sse({"type": "error", "message": "보고서 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."})
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
def download_report(report_id: int, format: str = "pdf",
                    current_user: dict = Depends(get_current_user)):
    """
    보고서 다운로드 (소유권 검증)
    format: pdf (기본) | docx | md
    """
    report = _assert_report_owner(report_id, current_user["id"], current_user["role"] == "admin")

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
def delete_report(report_id: int, current_user: dict = Depends(get_current_user)):
    """보고서 삭제 (소유권 검증)"""
    report = _assert_report_owner(report_id, current_user["id"], current_user["role"] == "admin")

    with get_db() as (conn, cur):
        cur.execute("DELETE FROM reports WHERE id = %s", (report_id,))

    if report["file_path"]:
        p = Path(report["file_path"])
        if p.exists():
            p.unlink()

    return {"message": "보고서가 삭제되었습니다"}
