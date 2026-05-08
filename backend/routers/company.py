import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from db.database import get_db
from dependencies import get_current_user, require_admin
from utils.db_helpers import parse_jsonb_fields

router = APIRouter(prefix="/company", tags=["company"])

_JSONB_FIELDS = ["business_fields", "main_services"]


# ── 스키마 ────────────────────────────────────────────────────────────────────

class CompanyInfoUpdate(BaseModel):
    company_name:        Optional[str] = None
    description:         Optional[str] = None
    business_fields:     Optional[list[str]] = Field(default=None)
    main_services:       Optional[list[str]] = Field(default=None)
    vision_goals:        Optional[str] = None
    default_report_info: Optional[str] = None
    report_tone:         Optional[str] = None
    chat_tone:           Optional[str] = None


# ── 엔드포인트 ────────────────────────────────────────────────────────────────

def _fetch_company_info() -> dict:
    """내부 전용: DB에서 회사 정보 조회 (인증 없음)"""
    with get_db() as (conn, cur):
        cur.execute("SELECT * FROM company_info WHERE id = 1")
        row = cur.fetchone()
    if not row:
        return {
            "id": 1, "company_name": None, "description": None,
            "business_fields": [], "main_services": [], "vision_goals": None,
            "default_report_info": None, "report_tone": None, "chat_tone": None,
            "updated_at": None,
        }
    return parse_jsonb_fields(row, _JSONB_FIELDS)


@router.get("")
def get_company_info(_: dict = Depends(require_admin)):
    """회사 기본 정보 조회 (관리자 전용)"""
    return _fetch_company_info()


@router.put("")
def update_company_info(body: CompanyInfoUpdate, _: dict = Depends(require_admin)):
    """회사 기본 정보 저장 (관리자 전용)"""
    # 허용된 컬럼명 화이트리스트
    ALLOWED_FIELDS = frozenset({
        "company_name", "description", "business_fields",
        "main_services", "vision_goals", "default_report_info",
        "report_tone", "chat_tone",
    })

    # (컬럼명, 값) 쌍 목록 — JSONB 필드는 직렬화 처리
    col_val: list[tuple[str, object]] = []
    if body.company_name        is not None: col_val.append(("company_name",        body.company_name))
    if body.description         is not None: col_val.append(("description",         body.description))
    if body.business_fields     is not None: col_val.append(("business_fields",     json.dumps(body.business_fields, ensure_ascii=False)))
    if body.main_services       is not None: col_val.append(("main_services",       json.dumps(body.main_services,   ensure_ascii=False)))
    if body.vision_goals        is not None: col_val.append(("vision_goals",        body.vision_goals))
    if body.default_report_info is not None: col_val.append(("default_report_info", body.default_report_info))
    if body.report_tone         is not None: col_val.append(("report_tone",         body.report_tone))
    if body.chat_tone           is not None: col_val.append(("chat_tone",           body.chat_tone))

    # 방어적 화이트리스트 검증
    for col, _ in col_val:
        assert col in ALLOWED_FIELDS, f"허용되지 않은 컬럼: {col}"

    if not col_val:
        return _fetch_company_info()

    set_clause = ", ".join(f"{col} = %s" for col, _ in col_val) + ", updated_at = NOW()"
    values     = [v for _, v in col_val]

    with get_db() as (conn, cur):
        cur.execute(
            f"UPDATE company_info SET {set_clause} WHERE id = 1 RETURNING *",
            values,
        )
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=500, detail={
            "error": {"code": "UPDATE_FAILED", "message": "회사 정보 저장에 실패했습니다", "status": 500}
        })
    return parse_jsonb_fields(row, _JSONB_FIELDS)


@router.get("/context")
def get_company_context(_: dict = Depends(get_current_user)):
    """
    보고서 생성 시 LLM 프롬프트에 주입할 회사 정보 컨텍스트 문자열 반환 (로그인 필요).
    빈 필드는 제외.
    """
    info = _fetch_company_info()
    lines = []

    if info.get("company_name"):
        lines.append(f"회사명: {info['company_name']}")
    if info.get("description"):
        lines.append(f"회사 소개: {info['description']}")
    if info.get("business_fields"):
        lines.append(f"사업 분야: {', '.join(info['business_fields'])}")
    if info.get("main_services"):
        lines.append(f"주요 서비스: {', '.join(info['main_services'])}")
    if info.get("vision_goals"):
        lines.append(f"비전 및 목표: {info['vision_goals']}")
    if info.get("report_tone"):
        lines.append(f"보고서 작성 톤: {info['report_tone']}")
    if info.get("chat_tone"):
        lines.append(f"채팅 응답 톤: {info['chat_tone']}")
    if info.get("default_report_info"):
        lines.append(f"보고서 기본 참고사항: {info['default_report_info']}")

    return {
        "context": "\n".join(lines) if lines else "",
        "has_info": len(lines) > 0,
    }
