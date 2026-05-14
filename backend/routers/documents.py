from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel
from typing import Optional
from pathlib import Path
from db.database import get_db
from services.storage_service import storage_service
from services.document_processor import (
    process_document,
    reparse_document,
    rechunk_document,
    reembed_document,
)
from services.chunker import ChunkConfig
from services.retriever import search_chunks, format_context
from dependencies import get_current_user, require_admin

DATASET_ROOT  = Path(__file__).parent.parent / "dataset"
ALLOWED_EXTS  = {"pdf", "docx", "txt", "xlsx", "csv", "pptx"}

CATEGORY_DISPLAY_NAMES: dict[str, str] = {
    "policy":  "정책/규제",
    "finance": "금융/경제",
    "company": "기업 정보",
    "YMC":     "YMC",
}
CATEGORY_COLORS: dict[str, str] = {
    "policy":  "#3b82f6",
    "finance": "#10b981",
    "company": "#f59e0b",
    "YMC":     "#8b5cf6",
}

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
    MAX_SIZE = 50 * 1024 * 1024  # 50MB (보고서 특성상 대용량 PDF 허용)

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "UNSUPPORTED_FILE_TYPE", "message": f".{ext} 형식은 지원하지 않습니다", "status": 400}
        })

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "FILE_TOO_LARGE", "message": "파일 크기는 50MB 이하여야 합니다", "status": 400}
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
    # import-dataset 파일은 dataset/ 경로를 가리키므로 파일 삭제 실패해도 500 내지 않음
    if doc["file_path"]:
        try:
            storage_service.delete(doc["file_path"])
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                "[document] 파일 삭제 실패 (DB 레코드는 삭제됨): %s", e
            )
    return {"message": "문서가 삭제되었습니다"}


@router.post("/reprocess-all")
def reprocess_all_documents(background_tasks: BackgroundTasks, _: dict = Depends(require_admin)):
    """모든 문서의 청크를 삭제하고 전체 재처리 (청킹/임베딩 재실행)"""
    with get_db() as (conn, cur):
        # 청크 전체 삭제
        cur.execute("DELETE FROM chunks")
        # 모든 문서를 processing 상태로 초기화
        cur.execute("""
            UPDATE documents
            SET status = 'processing', chunk_count = 0, error_message = NULL, updated_at = NOW()
            WHERE file_path IS NOT NULL
            RETURNING id, file_path, file_type
        """)
        docs = cur.fetchall()

    queued, errors = [], []
    for doc in docs:
        file_path = Path(doc["file_path"])
        if not file_path.exists():
            errors.append({"document_id": doc["id"], "error": "파일 없음"})
            continue
        contents = file_path.read_bytes()
        background_tasks.add_task(process_document, doc["id"], contents, doc["file_type"])
        queued.append(doc["id"])

    return {
        "message": f"{len(queued)}개 문서 재처리 시작, {len(errors)}개 실패",
        "queued": queued,
        "errors": errors,
    }


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


# ── 세분화 재처리 ─────────────────────────────────────────────────────────────

def _require_doc_with_file(doc_id: int, cur) -> dict:
    """공통: 문서 존재 + 파일 경로 확인. 없으면 HTTPException."""
    cur.execute("SELECT id, status, file_path, file_type FROM documents WHERE id = %s", (doc_id,))
    doc = cur.fetchone()
    if not doc:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "DOCUMENT_NOT_FOUND", "message": "해당 문서를 찾을 수 없습니다", "status": 404}
        })
    return doc


@router.post("/{doc_id}/reparse")
def reparse_document_route(doc_id: int, background_tasks: BackgroundTasks, _: dict = Depends(require_admin)):
    """
    파싱 단계만 재실행 → parsed_pages 갱신, chunks 변경 없음.
    모든 상태에서 실행 가능 (단, 처리 중 상태는 제외).
    """
    with get_db() as (conn, cur):
        doc = _require_doc_with_file(doc_id, cur)
        if doc["status"] in ("processing", "reparsing", "rechunking", "reembedding"):
            raise HTTPException(status_code=409, detail={
                "error": {"code": "INVALID_STATUS", "message": "현재 처리 중인 문서입니다. 완료 후 재시도해 주세요.", "status": 409}
            })
        if not doc["file_path"]:
            raise HTTPException(status_code=409, detail={
                "error": {"code": "FILE_NOT_FOUND", "message": "저장된 파일을 찾을 수 없습니다", "status": 409}
            })

    from pathlib import Path
    file_path = Path(doc["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=409, detail={
            "error": {"code": "FILE_NOT_FOUND", "message": "스토리지에 파일이 존재하지 않습니다", "status": 409}
        })
    contents = file_path.read_bytes()
    background_tasks.add_task(reparse_document, doc_id, contents, doc["file_type"])
    return {"message": "재파싱이 시작되었습니다", "document_id": doc_id}


class RechunkRequest(BaseModel):
    max_chunk_chars: Optional[int] = None
    overlap_chars:   Optional[int] = None
    min_chunk_len:   Optional[int] = None


@router.post("/{doc_id}/rechunk")
def rechunk_document_route(
    doc_id: int,
    body: RechunkRequest,
    background_tasks: BackgroundTasks,
    _: dict = Depends(require_admin),
):
    """
    parsed_pages 기반 청킹+임베딩 재실행.
    body에 파라미터가 있으면 해당 값 사용, 없으면 카테고리 설정값 사용.
    """
    with get_db() as (conn, cur):
        doc = _require_doc_with_file(doc_id, cur)
        if doc["status"] in ("processing", "reparsing", "rechunking", "reembedding"):
            raise HTTPException(status_code=409, detail={
                "error": {"code": "INVALID_STATUS", "message": "현재 처리 중인 문서입니다.", "status": 409}
            })

    # body에 파라미터가 하나라도 있으면 ChunkConfig 구성
    cfg_dict = {k: v for k, v in body.dict().items() if v is not None}
    chunk_config = ChunkConfig.from_dict(cfg_dict) if cfg_dict else None

    background_tasks.add_task(rechunk_document, doc_id, chunk_config)
    return {"message": "재청킹이 시작되었습니다", "document_id": doc_id}


@router.post("/{doc_id}/reembed")
def reembed_document_route(doc_id: int, background_tasks: BackgroundTasks, _: dict = Depends(require_admin)):
    """기존 chunks content를 그대로 사용해 임베딩만 재생성."""
    with get_db() as (conn, cur):
        doc = _require_doc_with_file(doc_id, cur)
        if doc["status"] in ("processing", "reparsing", "rechunking", "reembedding"):
            raise HTTPException(status_code=409, detail={
                "error": {"code": "INVALID_STATUS", "message": "현재 처리 중인 문서입니다.", "status": 409}
            })

    background_tasks.add_task(reembed_document, doc_id)
    return {"message": "재임베딩이 시작되었습니다", "document_id": doc_id}


@router.get("/{doc_id}/parsed_pages")
def get_parsed_pages(doc_id: int, _: dict = Depends(require_admin)):
    """
    문서의 페이지별 파싱 결과 목록 반환 (parsed_pages 테이블).
    content는 첫 500자만 포함하고 total_chars를 함께 반환합니다.
    """
    with get_db() as (conn, cur):
        cur.execute("SELECT id FROM documents WHERE id = %s", (doc_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail={
                "error": {"code": "DOCUMENT_NOT_FOUND", "message": "해당 문서를 찾을 수 없습니다", "status": 404}
            })
        cur.execute("""
            SELECT
                page_number,
                LEFT(content, 500) AS content_preview,
                char_count,
                has_table,
                ocr_applied
            FROM parsed_pages
            WHERE document_id = %s
            ORDER BY page_number
        """, (doc_id,))
        rows = cur.fetchall()
    return {"document_id": doc_id, "pages": rows, "total_pages": len(rows)}


# ── 데이터셋 일괄 Import ──────────────────────────────────────────────────────

def _get_or_create_category(cur, folder_name: str) -> int:
    display_name = CATEGORY_DISPLAY_NAMES.get(folder_name, folder_name)
    cur.execute("SELECT id FROM categories WHERE name = %s", (display_name,))
    row = cur.fetchone()
    if row:
        return row["id"]
    color = CATEGORY_COLORS.get(folder_name, "#6366f1")
    cur.execute(
        "INSERT INTO categories (name, description, color) VALUES (%s, %s, %s) RETURNING id",
        (display_name, f"{display_name} 관련 문서", color),
    )
    return cur.fetchone()["id"]


def _import_single(file_path: Path, category_id: int, background_tasks: BackgroundTasks) -> str:
    """파일 하나를 DB에 등록하고 백그라운드 처리 예약. 이미 있으면 'skipped' 반환."""
    filename = file_path.name
    ext      = file_path.suffix.lstrip(".").lower()

    with get_db() as (conn, cur):
        cur.execute(
            "SELECT id FROM documents WHERE filename = %s AND category_id = %s",
            (filename, category_id),
        )
        if cur.fetchone():
            return "skipped"

        contents = file_path.read_bytes()
        cur.execute(
            """
            INSERT INTO documents (filename, file_type, content, file_size, status, category_id, file_path)
            VALUES (%s, %s, %s, %s, 'processing', %s, %s)
            RETURNING id
            """,
            (filename, ext, "", len(contents), category_id, str(file_path)),
        )
        doc_id = cur.fetchone()["id"]

    background_tasks.add_task(process_document, doc_id, contents, ext)
    return "queued"


@router.post("/import-dataset")
def import_dataset(
    background_tasks: BackgroundTasks,
    force: bool = Query(default=False, description="이미 등록된 파일도 재처리"),
    category: Optional[str] = Query(default=None, description="특정 카테고리 폴더명만 처리"),
    _: dict = Depends(require_admin),
):
    """
    dataset/ 폴더를 스캔하여 미등록 파일을 일괄 import.

    - 폴더명을 카테고리로 자동 매핑 (없으면 신규 생성)
    - 이미 등록된 파일은 skip (force=true 시 재처리)
    - 처리(파싱/청킹/임베딩)는 백그라운드로 실행
    """
    if not DATASET_ROOT.exists():
        raise HTTPException(status_code=500, detail={
            "error": {"code": "DATASET_NOT_FOUND", "message": "dataset 폴더를 찾을 수 없습니다", "status": 500}
        })

    folders = sorted([d for d in DATASET_ROOT.iterdir() if d.is_dir()])
    if category:
        folders = [f for f in folders if f.name == category]
        if not folders:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "CATEGORY_NOT_FOUND", "message": f"'{category}' 폴더를 찾을 수 없습니다", "status": 404}
            })

    results = {"queued": [], "skipped": [], "errors": []}

    for folder in folders:
        files = [
            f for f in sorted(folder.iterdir())
            if f.is_file() and f.suffix.lstrip(".").lower() in ALLOWED_EXTS
        ]
        if not files:
            continue

        with get_db() as (conn, cur):
            cat_id = _get_or_create_category(cur, folder.name)

        for file_path in files:
            try:
                if force:
                    # force: 기존 레코드 삭제 후 재등록
                    with get_db() as (conn, cur):
                        cur.execute(
                            "DELETE FROM documents WHERE filename = %s AND category_id = %s",
                            (file_path.name, cat_id),
                        )

                status = _import_single(file_path, cat_id, background_tasks)
                results[status].append(f"{folder.name}/{file_path.name}")
            except Exception as e:
                results["errors"].append({"file": f"{folder.name}/{file_path.name}", "error": str(e)})

    return {
        "message": f"Import 시작: {len(results['queued'])}개 처리 중, {len(results['skipped'])}개 스킵",
        "queued":  results["queued"],
        "skipped": results["skipped"],
        "errors":  results["errors"],
    }
