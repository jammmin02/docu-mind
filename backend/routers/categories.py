from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from db.database import get_db

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
def list_categories():
    """카테고리 목록 — 문서 수 포함"""
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
def get_category(category_id: int):
    """카테고리 상세"""
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
def create_category(body: CategoryCreate):
    """카테고리 생성"""
    with get_db() as (conn, cur):
        # 중복 이름 체크
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
def update_category(category_id: int, body: CategoryUpdate):
    """카테고리 수정 (이름 / 설명 / 색상)"""
    with get_db() as (conn, cur):
        cur.execute("SELECT id, name FROM categories WHERE id = %s", (category_id,))
        cat = cur.fetchone()
        if not cat:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "CATEGORY_NOT_FOUND", "message": "카테고리를 찾을 수 없습니다", "status": 404}
            })

        # 이름 변경 시 중복 체크
        if body.name and body.name != cat["name"]:
            cur.execute("SELECT id FROM categories WHERE name = %s", (body.name,))
            if cur.fetchone():
                raise HTTPException(status_code=409, detail={
                    "error": {"code": "DUPLICATE_NAME", "message": f"'{body.name}' 카테고리가 이미 존재합니다", "status": 409}
                })

        fields, values = [], []
        if body.name is not None:
            fields.append("name = %s"); values.append(body.name)
        if body.description is not None:
            fields.append("description = %s"); values.append(body.description)
        if body.color is not None:
            fields.append("color = %s"); values.append(body.color)

        if not fields:
            return cat  # 변경 사항 없음

        fields.append("updated_at = NOW()")
        values.append(category_id)
        cur.execute(
            f"UPDATE categories SET {', '.join(fields)} WHERE id = %s RETURNING id, name, description, color, created_at, updated_at",
            values,
        )
        return cur.fetchone()


@router.delete("/{category_id}")
def delete_category(category_id: int):
    """카테고리 삭제 — 소속 문서의 category_id는 NULL로 변경 (ON DELETE SET NULL)"""
    with get_db() as (conn, cur):
        cur.execute("SELECT id, name FROM categories WHERE id = %s", (category_id,))
        cat = cur.fetchone()
        if not cat:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "CATEGORY_NOT_FOUND", "message": "카테고리를 찾을 수 없습니다", "status": 404}
            })

        # 소속 문서 수 확인 (안내용)
        cur.execute("SELECT COUNT(*) AS cnt FROM documents WHERE category_id = %s", (category_id,))
        doc_count = cur.fetchone()["cnt"]

        cur.execute("DELETE FROM categories WHERE id = %s", (category_id,))

    return {
        "message": f"카테고리 '{cat['name']}'이(가) 삭제되었습니다",
        "unlinked_documents": doc_count,
    }
