from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel
from typing import Optional
from db.database import get_db
from services.storage_service import storage_service
from services.document_processor import process_document
from services.retriever import search_chunks, format_context
from dependencies import get_current_user, require_admin

router = APIRouter(prefix="/documents", tags=["documents"])

# ── 파일 시그니처(매직 바이트) 검증 ──────────────────────────────────────────
# PDF: %PDF  /  Office Open XML(docx·xlsx·pptx): PK ZIP 헤더
_MAGIC: dict[str, bytes] = {
    "pdf":  b"%PDF",
    "docx": b"PK\x03\x04",
    "xlsx": b"PK\x03\x04",
    "pptx": b"PK\x03\x04",
    # txt / csv: 텍스트 파일은 바이너리 시그니처 없음 → 별도 검사 불필요
}

def _check_magic(contents: bytes, ext: str) -> bool:
    """확장자에 해당하는 매직 바이트로 실제 파일 형식을 검증한다."""
    sig = _MAGIC.get(ext)
    if sig is None:
        return True          # txt / csv → 검사 생략
    return contents[:len(sig)] == sig


@router.get("")
def list_documents(category_id: Optional[int] = Query(default=None), _: dict = Depends(require_admin)):
    """
    문서 목록 조회 (category_id 필터 지원).
    categories LEFT JOIN으로 category_name, category_color를 한 번에 반환.
    """
    with get_db() as (conn, cur):
        base_sql = """
            SELECT d.id, d.filename, d.file_type, d.file_size, d.chunk_count,
                   d.status, d.error_message, d.category_id, d.uploaded_at,
                   c.name  AS category_name,
                   c.color AS category_color
            FROM documents d
            LEFT JOIN categories c ON c.id = d.category_id
        """
        if category_id is not None:
            cur.execute(base_sql + "WHERE d.category_id = %s ORDER BY d.uploaded_at DESC", (category_id,))
        else:
            cur.execute(base_sql + "ORDER BY d.uploaded_at DESC")
        return cur.fetchall()


@router.get("/{doc_id}")
def get_document(doc_id: int, _: dict = Depends(require_admin)):
    """문서 상세 조회"""
    with get_db() as (conn, cur):
        cur.execute("SELECT * FROM documents WHERE id = %s", (doc_id,))
        doc = cur.fetchone()
    if not doc:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "DOCUMENT_NOT_FOUND", "message": "해당 문서를 찾을 수 없습니다", "status": 404}
        })
    return doc


@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    category_id: Optional[int] = Form(default=None),
    _: dict = Depends(require_admin),
):
    """문서 업로드 — 파싱/청킹/임베딩은 백그라운드 처리"""
    ALLOWED_TYPES = {"pdf", "docx", "txt", "xlsx", "csv", "pptx"}
    MAX_SIZE = 10 * 1024 * 1024  # 10MB

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "UNSUPPORTED_FILE_TYPE", "message": f".{ext} 형식은 지원하지 않습니다", "status": 400}
        })

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "FILE_TOO_LARGE", "message": "파일 크기는 10MB 이하여야 합니다", "status": 400}
        })

    # 파일 시그니처(매직 바이트) 검증 — 확장자 위조 차단
    if not _check_magic(contents, ext):
        raise HTTPException(status_code=400, detail={
            "error": {"code": "INVALID_FILE_CONTENT", "message": "파일 내용이 확장자와 일치하지 않습니다", "status": 400}
        })

    # category_id 유효성 검사
    if category_id is not None:
        with get_db() as (conn, cur):
            cur.execute("SELECT id FROM categories WHERE id = %s", (category_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail={
                    "error": {"code": "CATEGORY_NOT_FOUND", "message": "카테고리를 찾을 수 없습니다", "status": 404}
                })

    # DB에 processing 상태로 먼저 저장
    with get_db() as (conn, cur):
        cur.execute("""
            INSERT INTO documents (filename, file_type, content, file_size, status, category_id)
            VALUES (%s, %s, %s, %s, 'processing', %s)
            RETURNING id, filename, status, category_id
        """, (file.filename, ext, "", len(contents), category_id))
        doc = cur.fetchone()
        doc_id = doc["id"]

    # 로컬 스토리지에 원본 파일 저장
    file_path = storage_service.save(doc_id, file.filename, contents)

    # file_path DB에 업데이트
    with get_db() as (conn, cur):
        cur.execute(
            "UPDATE documents SET file_path = %s WHERE id = %s",
            (file_path, doc_id),
        )

    # 파싱 → 청킹 → 임베딩 → DB 저장 백그라운드 처리
    background_tasks.add_task(process_document, doc_id, contents, ext)

    return {"id": doc_id, "filename": doc["filename"], "status": doc["status"], "category_id": doc["category_id"]}


@router.delete("/{doc_id}")
def delete_document(doc_id: int, _: dict = Depends(require_admin)):
    """문서 삭제"""
    with get_db() as (conn, cur):
        cur.execute("SELECT id, file_path FROM documents WHERE id = %s", (doc_id,))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "DOCUMENT_NOT_FOUND", "message": "해당 문서를 찾을 수 없습니다", "status": 404}
            })
        cur.execute("DELETE FROM documents WHERE id = %s", (doc_id,))

    # DB 삭제 후 스토리지 파일 정리
    if doc["file_path"]:
        storage_service.delete(doc["file_path"])
    return {"message": "문서가 삭제되었습니다"}


@router.post("/{doc_id}/reprocess")
def reprocess_document(doc_id: int, background_tasks: BackgroundTasks, _: dict = Depends(require_admin)):
    """실패 문서 재처리"""
    with get_db() as (conn, cur):
        cur.execute("SELECT id, status, file_path, file_type FROM documents WHERE id = %s", (doc_id,))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "DOCUMENT_NOT_FOUND", "message": "해당 문서를 찾을 수 없습니다", "status": 404}
            })
        if doc["status"] not in ("failed", "timeout"):
            raise HTTPException(status_code=409, detail={
                "error": {"code": "INVALID_STATUS", "message": "failed 또는 timeout 상태의 문서만 재처리할 수 있습니다", "status": 409}
            })
        if not doc["file_path"]:
            raise HTTPException(status_code=409, detail={
                "error": {"code": "FILE_NOT_FOUND", "message": "저장된 파일을 찾을 수 없습니다", "status": 409}
            })

        cur.execute("""
            UPDATE documents
            SET status = 'processing', error_message = NULL, updated_at = NOW()
            WHERE id = %s
        """, (doc_id,))

    # 스토리지에서 원본 파일 읽어서 재처리
    from pathlib import Path
    file_path = Path(doc["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=409, detail={
            "error": {"code": "FILE_NOT_FOUND", "message": "스토리지에 파일이 존재하지 않습니다", "status": 409}
        })
    contents = file_path.read_bytes()
    background_tasks.add_task(process_document, doc_id, contents, doc["file_type"])

    return {"message": "재처리가 시작되었습니다", "document_id": doc_id}


# ── 검색 ──────────────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    score_cutoff: float = 0.3
    document_ids: list[int] | None = None


@router.post("/search")
def search_documents(req: SearchRequest, _: dict = Depends(get_current_user)):
    """
    자연어 쿼리로 벡터 유사도 검색.
    반환: 관련 청크 목록 + LLM 컨텍스트 문자열
    """
    if not req.query.strip():
        raise HTTPException(status_code=400, detail={
            "error": {"code": "EMPTY_QUERY", "message": "검색어를 입력해주세요", "status": 400}
        })

    chunks = search_chunks(
        query=req.query,
        top_k=req.top_k,
        score_cutoff=req.score_cutoff,
        document_ids=req.document_ids,
    )

    return {
        "query":   req.query,
        "count":   len(chunks),
        "chunks":  chunks,
        "context": format_context(chunks),   # LLM 프롬프트 주입용
    }
