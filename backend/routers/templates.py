"""
보고서 템플릿(섹션 구조) 관리 라우터
관리자가 보고서 구조(섹션 목록)를 정의·관리하는 CRUD API
"""
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from db.database import get_db
from dependencies import get_current_user, require_admin
from utils.db_helpers import parse_jsonb_fields

router = APIRouter(prefix="/templates", tags=["templates"])

_JSONB_FIELDS = ["sections"]


# ── 스키마 ────────────────────────────────────────────────────────────────────

class Section(BaseModel):
    title:          str
    description:    str  = ""
    required_input: bool = False   # 사용자가 반드시 직접 입력해야 하는 항목
    placeholder:    str  = ""      # 필수 입력 항목의 안내 문구


class TemplateCreate(BaseModel):
    name:        str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    sections:    list[Section] = Field(default_factory=list)


class TemplateUpdate(BaseModel):
    name:        Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    sections:    Optional[list[Section]] = None
    is_active:   Optional[bool] = None


# ── 엔드포인트 ────────────────────────────────────────────────────────────────

@router.get("")
def list_templates(active_only: bool = True, _: dict = Depends(get_current_user)):
    """템플릿 목록"""
    with get_db() as (conn, cur):
        if active_only:
            cur.execute("""
                SELECT id, name, description, sections, is_active, created_at, updated_at
                FROM report_structures
                WHERE is_active = TRUE
                ORDER BY created_at ASC
            """)
        else:
            cur.execute("""
                SELECT id, name, description, sections, is_active, created_at, updated_at
                FROM report_structures
                ORDER BY created_at ASC
            """)
        return [parse_jsonb_fields(r, _JSONB_FIELDS) for r in cur.fetchall()]


@router.get("/{template_id}")
def get_template(template_id: int, _: dict = Depends(get_current_user)):
    """템플릿 상세"""
    with get_db() as (conn, cur):
        cur.execute("SELECT * FROM report_structures WHERE id = %s", (template_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "TEMPLATE_NOT_FOUND", "message": "템플릿을 찾을 수 없습니다", "status": 404}
        })
    return parse_jsonb_fields(row, _JSONB_FIELDS)


@router.post("", status_code=201)
def create_template(body: TemplateCreate, _: dict = Depends(require_admin)):
    """템플릿 생성"""
    sections_json = json.dumps(
        [s.model_dump() for s in body.sections], ensure_ascii=False
    )
    with get_db() as (conn, cur):
        cur.execute("""
            INSERT INTO report_structures (name, description, sections)
            VALUES (%s, %s, %s)
            RETURNING id, name, description, sections, is_active, created_at
        """, (body.name, body.description, sections_json))
        return parse_jsonb_fields(cur.fetchone(), _JSONB_FIELDS)


@router.patch("/{template_id}")
def update_template(template_id: int, body: TemplateUpdate, _: dict = Depends(require_admin)):
    """템플릿 수정"""
    with get_db() as (conn, cur):
        cur.execute("SELECT id FROM report_structures WHERE id = %s", (template_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail={
                "error": {"code": "TEMPLATE_NOT_FOUND", "message": "템플릿을 찾을 수 없습니다", "status": 404}
            })

        # 허용된 컬럼명 화이트리스트
        ALLOWED_FIELDS = frozenset({"name", "description", "sections", "is_active"})

        col_val: list[tuple[str, object]] = []
        if body.name        is not None: col_val.append(("name",        body.name))
        if body.description is not None: col_val.append(("description", body.description))
        if body.sections    is not None:
            sections_json = json.dumps([s.model_dump() for s in body.sections], ensure_ascii=False)
            col_val.append(("sections", sections_json))
        if body.is_active   is not None: col_val.append(("is_active",   body.is_active))

        # 방어적 화이트리스트 검증
        for col, _ in col_val:
            assert col in ALLOWED_FIELDS, f"허용되지 않은 컬럼: {col}"

        if not col_val:
            cur.execute("SELECT * FROM report_structures WHERE id = %s", (template_id,))
            return parse_jsonb_fields(cur.fetchone(), _JSONB_FIELDS)

        set_clause = ", ".join(f"{col} = %s" for col, _ in col_val) + ", updated_at = NOW()"
        values     = [v for _, v in col_val] + [template_id]
        cur.execute(
            f"UPDATE report_structures SET {set_clause} WHERE id = %s RETURNING *",
            values,
        )
        return parse_jsonb_fields(cur.fetchone(), _JSONB_FIELDS)


@router.delete("/{template_id}")
def delete_template(template_id: int, _: dict = Depends(require_admin)):
    """템플릿 삭제 (소프트: is_active=false)"""
    with get_db() as (conn, cur):
        cur.execute("SELECT id, name FROM report_structures WHERE id = %s", (template_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "TEMPLATE_NOT_FOUND", "message": "템플릿을 찾을 수 없습니다", "status": 404}
            })
        # 소프트 삭제 (연결된 보고서 유지)
        cur.execute(
            "UPDATE report_structures SET is_active = FALSE, updated_at = NOW() WHERE id = %s",
            (template_id,)
        )
    return {"message": f"템플릿 '{row['name']}'이(가) 삭제되었습니다"}
