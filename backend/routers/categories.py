from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from db.database import get_db
from dependencies import get_current_user, require_admin

router = APIRouter(prefix="/categories", tags=["categories"])


# ── 스키마 ────────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = None
    color: Optional[str] = Field(default="#6366f1", pattern=r"^#[0-9a-fA-F]{6}$")


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


# ── 엔드포인트 ────────────────────────────────────────────────────────────────

@router.get("")
def list_categories(_: dict = Depends(get_current_user)):
    """카테고리 목록 — 문서 수 포함 (로그인 필요)"""
    with get_db() as (conn, cur):
        cur.execute("""
            SELECT
                c.id, c.name, c.description, c.color, c.created_at,
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
                c.id, c.name, c.description, c.color, c.created_at,
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

        cur.execute("""
            INSERT INTO categories (name, description, color)
            VALUES (%s, %s, %s)
            RETURNING id, name, description, color, created_at
        """, (body.name, body.description, body.color or "#6366f1"))
        return cur.fetchone()


@router.patch("/{category_id}")
def update_category(category_id: int, body: CategoryUpdate, _: dict = Depends(require_admin)):
    """카테고리 수정 (관리자 전용)"""
    # 허용된 컬럼명 화이트리스트 — 동적 SQL 필드는 반드시 이 집합에서만 사용
    ALLOWED_FIELDS = frozenset({"name", "description", "color"})

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
                    "error": {"code": "DUPLICATE_NAME", "message": f"'{body.name}' 카테고리가 이미 존재합니다", "status": 409}
                })

        # (컬럼명, 값) 쌍 목록 — 컬럼명은 ALLOWED_FIELDS 에서만 선택
        col_val: list[tuple[str, object]] = []
        if body.name        is not None: col_val.append(("name",        body.name))
        if body.description is not None: col_val.append(("description", body.description))
        if body.color       is not None: col_val.append(("color",       body.color))

        # 방어적 화이트리스트 검증
        for col, _ in col_val:
            assert col in ALLOWED_FIELDS, f"허용되지 않은 컬럼: {col}"

        if not col_val:
            return cat

        set_clause = ", ".join(f"{col} = %s" for col, _ in col_val) + ", updated_at = NOW()"
        values     = [v for _, v in col_val] + [category_id]
        cur.execute(
            f"UPDATE categories SET {set_clause} WHERE id = %s RETURNING id, name, description, color, created_at, updated_at",
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
        "message": f"카테고리 '{cat['name']}'이(가) 삭제되었습니다",
        "unlinked_documents": doc_count,
    }
