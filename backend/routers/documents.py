from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from db.database import get_db

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("")
def list_documents():
    """문서 목록 조회"""
    with get_db() as (conn, cur):
        cur.execute("""
            SELECT id, filename, file_type, file_size, chunk_count, status, error_message, uploaded_at
            FROM documents
            ORDER BY uploaded_at DESC
        """)
        return cur.fetchall()


@router.get("/{doc_id}")
def get_document(doc_id: int):
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

    # DB에 processing 상태로 먼저 저장
    with get_db() as (conn, cur):
        cur.execute("""
            INSERT INTO documents (filename, file_type, content, file_size, status)
            VALUES (%s, %s, %s, %s, 'processing')
            RETURNING id, filename, status
        """, (file.filename, ext, "", len(contents)))
        doc = cur.fetchone()

    # TODO: background_tasks.add_task(process_document, doc["id"], contents, ext)
    return {"document_id": doc["id"], "filename": doc["filename"], "status": doc["status"]}


@router.delete("/{doc_id}")
def delete_document(doc_id: int):
    """문서 삭제"""
    with get_db() as (conn, cur):
        cur.execute("SELECT id, file_path FROM documents WHERE id = %s", (doc_id,))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "DOCUMENT_NOT_FOUND", "message": "해당 문서를 찾을 수 없습니다", "status": 404}
            })
        # TODO: storage_service.delete(doc["file_path"])
        cur.execute("DELETE FROM documents WHERE id = %s", (doc_id,))
    return {"message": "문서가 삭제되었습니다"}


@router.post("/{doc_id}/reprocess")
def reprocess_document(doc_id: int, background_tasks: BackgroundTasks):
    """실패 문서 재처리"""
    with get_db() as (conn, cur):
        cur.execute("SELECT id, status FROM documents WHERE id = %s", (doc_id,))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "DOCUMENT_NOT_FOUND", "message": "해당 문서를 찾을 수 없습니다", "status": 404}
            })
        if doc["status"] not in ("failed", "timeout"):
            raise HTTPException(status_code=409, detail={
                "error": {"code": "INVALID_STATUS", "message": "failed 또는 timeout 상태의 문서만 재처리할 수 있습니다", "status": 409}
            })
        cur.execute("""
            UPDATE documents
            SET status = 'processing', error_message = NULL, updated_at = NOW()
            WHERE id = %s
        """, (doc_id,))

    # TODO: background_tasks.add_task(process_document, doc_id)
    return {"message": "재처리가 시작되었습니다", "document_id": doc_id}
