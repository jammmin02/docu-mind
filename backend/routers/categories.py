from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any
from db.database import get_db
from dependencies import get_current_user, require_admin
import json

router = APIRouter(prefix="/categories", tags=["categories"])

# chunk_config 허용 키 (화이트리스트)
_CHUNK_CONFIG_KEYS = frozenset({"max_chunk_chars", "overlap_chars", "min_chunk_len"})
_CHUNK_CONFIG_LIMITS = {
    "max_chunk_chars": (100, 4000),
    "overlap_chars":   (0,   500),
    "min_chunk_len":   (1,   200),
}


def _validate_chunk_config(v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """chunk_config 딕셔너리 값 검증."""
    if v is None:
        return v
    invalid = set(v.keys()) - _CHUNK_CONFIG_KEYS
    if invalid:
        raise ValueError("허용되지 않는 키: " + ", ".join(invalid))
    for key, val in v.items():
        lo, hi = _CHUNK_CONFIG_LIMITS[key]
        if not isinstance(val, int) or not (lo <= val <= hi):
            raise ValueError(key + " 값은 " + str(lo) + "~" + str(hi) + " 범위의 정수여야 합니다")
    return v


# ── 스키마 ────────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = None
    color: Optional[str] = Field(default="#6366f1", pattern=r"^#[0-9a-fA-F]{6}$")
    chunk_config: Optional[Dict[str, Any]] = None

    @field_validator("chunk_config")
    @classmethod
    def validate_chunk_config(cls, v):
        return _validate_chunk_config(v)


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    chunk_config: Optional[Dict[str, Any]] = None   # None = 변경 없음, {} = 설정 삭제

    @field_validator("chunk_config")
    @classmethod
    def validate_chunk_config(cls, v):
        return _validate_chunk_config(v)


# ── 엔드포인트 ────────────────────────────────────────────────────────────────

@router.get("")
def list_categories(_: dict = Depends(get_current_user)):
    """카테고리 목록 — 문서 수 포함 (로그인 필요)"""
    with get_db() as (conn, cur):
        cur.execute("""
            SELECT
                c.id, c.name, c.description, c.color, c.chunk_config, c.created_at,
                COUNT(d.id) FILTER (WHERE d.status = 'ready') AS doc_count
            FROM categories c
            LEFT JOIN documents d ON d.category_id = c.id
            GROUP BY c.id
            ORDER BY c.created_at ASC
        """)
        return cur.fetchall()


@router.get("/{category_id}")
def get_category(category_id: int, _: dict = Depends(get_current_user)):
    """카테고리 상세 (로그인 필요)"""
    with get_db() as (conn, cur):
        cur.execute("""
            SELECT
                c.id, c.name, c.description, c.color, c.chunk_config, c.created_at,
                COUNT(d.id) FILTER (WHERE d.status = 'ready') AS doc_count
            FROM categories c
            LEFT JOIN documents d ON d.category_id = c.id
            WHERE c.id = %s
            GROUP BY c.id
        """, (category_id,))
        cat = cur.fetchone()
    if not cat:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "CATEGORY_NOT_FOUND", "message": "카테고리를 찾을 수 없습니다", "status": 404}
        })
    return cat


@router.post("", status_code=201)
def create_category(body: CategoryCreate, _: dict = Depends(require_admin)):
    """카테고리 생성 (관리자 전용)"""
    with get_db() as (conn, cur):
        cur.execute("SELECT id FROM categories WHERE name = %s", (body.name,))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail={
                "error": {"code": "DUPLICATE_NAME", "message": f"'{body.name}' 카테고리가 이미 존재합니다", "status": 409}
            })

        cfg_json = json.dumps(body.chunk_config) if body.chunk_config else None
        cur.execute("""
            INSERT INTO categories (name, description, color, chunk_config)
            VALUES (%s, %s, %s, %s)
            RETURNING id, name, description, color, chunk_config, created_at
        """, (body.name, body.description, body.color or "#6366f1", cfg_json))
        return cur.fetchone()


@router.patch("/{category_id}")
def update_category(category_id: int, body: CategoryUpdate, _: dict = Depends(require_admin)):
    """카테고리 수정 (관리자 전용)"""
    # 허용된 컬럼명 화이트리스트
    ALLOWED_FIELDS = frozenset({"name", "description", "color", "chunk_config"})

    with get_db() as (conn, cur):
        cur.execute("SELECT id, name FROM categories WHERE id = %s", (category_id,))
        cat = cur.fetchone()
        if not cat:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "CATEGORY_NOT_FOUND", "message": "카테고리를 찾을 수 없습니다", "status": 404}
            })

        if body.name and body.name != cat["name"]:
            cur.execute("SELECT id FROM categories WHERE name = %s", (body.name,))
            if cur.fetchone():
                raise HTTPException(status_code=409, detail={
                    "error": {"code": "DUPLICATE_NAME", "message": "'" + body.name + "' 카테고리가 이미 존재합니다", "status": 409}
                })

        col_val: list[tuple[str, object]] = []
        if body.name        is not None: col_val.append(("name",        body.name))
        if body.description is not None: col_val.append(("description", body.description))
        if body.color       is not None: col_val.append(("color",       body.color))
        # chunk_config: None=변경없음, {}=삭제, {..}=업데이트
        if body.chunk_config is not None:
            cfg_val = json.dumps(body.chunk_config) if body.chunk_config else None
            col_val.append(("chunk_config", cfg_val))

        for col, _ in col_val:
            assert col in ALLOWED_FIELDS

        if not col_val:
            return cat

        set_clause = ", ".join(col + " = %s" for col, _ in col_val) + ", updated_at = NOW()"
        values     = [v for _, v in col_val] + [category_id]
        cur.execute(
            "UPDATE categories SET " + set_clause + " WHERE id = %s RETURNING id, name, description, color, chunk_config, created_at, updated_at",
            values,
        )
        return cur.fetchone()


@router.delete("/{category_id}")
def delete_category(category_id: int, _: dict = Depends(require_admin)):
    """카테고리 삭제 (관리자 전용) — 소속 문서의 category_id는 NULL로 변경"""
    with get_db() as (conn, cur):
        cur.execute("SELECT id, name FROM categories WHERE id = %s", (category_id,))
        cat = cur.fetchone()
        if not cat:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "CATEGORY_NOT_FOUND", "message": "카테고리를 찾을 수 없습니다", "status": 404}
            })

        cur.execute("SELECT COUNT(*) AS cnt FROM documents WHERE category_id = %s", (category_id,))
        doc_count = cur.fetchone()["cnt"]

        cur.execute("DELETE FROM categories WHERE id = %s", (category_id,))

    return {
        "message": "deleted",
        "unlinked_documents": doc_count,
    }
