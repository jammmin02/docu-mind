"""
dataset/ 폴더 배치 import 스크립트

사용법:
  # 컨테이너 내부에서 실행
  docker exec rag_backend python scripts/import_dataset.py

  # 옵션
  --dry-run   실제 처리 없이 어떤 파일이 import될지만 출력
  --force     이미 DB에 있는 파일도 재처리
  --category  특정 카테고리(폴더명)만 처리
  --workers   동시 처리 수 (기본 1, 순차 처리)

동작 방식:
  1. /app/dataset/<카테고리명>/<파일명> 구조를 스캔
  2. 카테고리가 DB에 없으면 자동 생성 (폴더명 → 카테고리명)
  3. 같은 파일명이 같은 카테고리에 이미 있으면 skip (--force로 재처리 가능)
  4. 파싱 → 청킹 → 임베딩 → DB 저장 파이프라인 실행
  5. 처리 결과(성공/실패/스킵) 요약 출력
"""
import argparse
import logging
import sys
import time
from pathlib import Path

# 백엔드 루트를 sys.path에 추가 (스크립트가 scripts/ 하위에 있으므로)
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from db.database import get_db
from services.document_processor import process_document

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

DATASET_ROOT  = Path(__file__).parent.parent / "dataset"
ALLOWED_EXTS  = {".pdf", ".docx", ".txt", ".xlsx", ".csv", ".pptx"}

# 카테고리 폴더명 → 표시 이름 매핑 (없으면 폴더명 그대로 사용)
CATEGORY_DISPLAY_NAMES: dict[str, str] = {
    "policy":  "정책/규제",
    "finance": "금융/경제",
    "company": "기업 정보",
    "YMC":     "YMC",
}

# 카테고리별 색상 (없으면 기본색)
CATEGORY_COLORS: dict[str, str] = {
    "policy":  "#3b82f6",   # blue
    "finance": "#10b981",   # green
    "company": "#f59e0b",   # amber
    "YMC":     "#8b5cf6",   # violet
}


def get_or_create_category(cur, folder_name: str) -> int:
    """카테고리 조회 or 생성 후 id 반환"""
    display_name = CATEGORY_DISPLAY_NAMES.get(folder_name, folder_name)
    cur.execute("SELECT id FROM categories WHERE name = %s", (display_name,))
    row = cur.fetchone()
    if row:
        return row["id"]

    color = CATEGORY_COLORS.get(folder_name, "#6366f1")
    cur.execute(
        """
        INSERT INTO categories (name, description, color)
        VALUES (%s, %s, %s)
        RETURNING id
        """,
        (display_name, f"{display_name} 관련 문서", color),
    )
    cat_id = cur.fetchone()["id"]
    logger.info("  📁 카테고리 생성: %s (id=%d)", display_name, cat_id)
    return cat_id


def is_already_imported(cur, filename: str, category_id: int) -> int | None:
    """같은 파일명 + 카테고리가 DB에 있으면 document id 반환, 없으면 None"""
    cur.execute(
        "SELECT id FROM documents WHERE filename = %s AND category_id = %s",
        (filename, category_id),
    )
    row = cur.fetchone()
    return row["id"] if row else None


def import_file(
    file_path: Path,
    category_id: int,
    force: bool = False,
    dry_run: bool = False,
) -> str:
    """
    단일 파일 import.
    반환값: 'imported' | 'skipped' | 'failed'
    """
    filename = file_path.name
    ext      = file_path.suffix.lstrip(".").lower()

    with get_db() as (conn, cur):
        existing_id = is_already_imported(cur, filename, category_id)

        if existing_id and not force:
            return "skipped"

        if dry_run:
            return "dry_run"

        contents = file_path.read_bytes()

        if existing_id and force:
            # 재처리: 기존 레코드 상태만 리셋 (청크는 process_document 내에서 삭제)
            cur.execute(
                """
                UPDATE documents
                SET status = 'processing', error_message = NULL, updated_at = NOW()
                WHERE id = %s
                """,
                (existing_id,),
            )
            doc_id = existing_id
        else:
            # 신규 등록
            cur.execute(
                """
                INSERT INTO documents (filename, file_type, content, file_size, status, category_id, file_path)
                VALUES (%s, %s, %s, %s, 'processing', %s, %s)
                RETURNING id
                """,
                (filename, ext, "", len(contents), category_id, str(file_path)),
            )
            doc_id = cur.fetchone()["id"]

    # 파싱 → 청킹 → 임베딩 → DB 저장 (동기 실행)
    process_document(doc_id, contents, ext)

    # 처리 결과 확인
    with get_db() as (conn, cur):
        cur.execute("SELECT status, error_message FROM documents WHERE id = %s", (doc_id,))
        result = cur.fetchone()

    if result["status"] == "ready":
        return "imported"
    else:
        return f"failed: {result['error_message']}"


def run_import(
    dry_run:  bool = False,
    force:    bool = False,
    category: str | None = None,
) -> None:
    if not DATASET_ROOT.exists():
        logger.error("dataset 폴더를 찾을 수 없습니다: %s", DATASET_ROOT)
        sys.exit(1)

    # 처리 대상 폴더 수집
    folders = sorted(
        [d for d in DATASET_ROOT.iterdir() if d.is_dir()],
        key=lambda d: d.name,
    )
    if category:
        folders = [f for f in folders if f.name == category]
        if not folders:
            logger.error("카테고리 폴더를 찾을 수 없습니다: %s", category)
            sys.exit(1)

    total = imported = skipped = failed = 0
    start_time = time.time()

    print("\n" + "=" * 60)
    print(f"  RAG 데이터셋 배치 Import {'(DRY RUN)' if dry_run else ''}")
    print(f"  경로: {DATASET_ROOT}")
    print("=" * 60)

    for folder in folders:
        files = sorted(
            [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in ALLOWED_EXTS]
        )
        if not files:
            continue

        print(f"\n📂 {folder.name}  ({len(files)}개 파일)")

        # 카테고리 조회/생성
        with get_db() as (conn, cur):
            cat_id = get_or_create_category(cur, folder.name)

        for file_path in files:
            total += 1
            size_mb = file_path.stat().st_size / (1024 * 1024)
            print(f"  {'[DRY]' if dry_run else '     '} {file_path.name}  ({size_mb:.1f}MB) ... ", end="", flush=True)

            t0     = time.time()
            result = import_file(file_path, cat_id, force=force, dry_run=dry_run)
            elapsed = time.time() - t0

            if result == "imported":
                imported += 1
                print(f"✅ 완료 ({elapsed:.1f}s)")
            elif result == "skipped":
                skipped += 1
                print("⏭️  스킵 (이미 등록됨)")
            elif result == "dry_run":
                print("📋 등록 예정")
            else:
                failed += 1
                print(f"❌ 실패 — {result}")

    elapsed_total = time.time() - start_time
    print("\n" + "=" * 60)
    print(f"  완료: {imported}개  스킵: {skipped}개  실패: {failed}개  전체: {total}개")
    print(f"  소요시간: {elapsed_total:.1f}초")
    print("=" * 60 + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="dataset/ 폴더 배치 import")
    parser.add_argument("--dry-run",  action="store_true", help="실제 처리 없이 대상 파일만 출력")
    parser.add_argument("--force",    action="store_true", help="이미 등록된 파일도 재처리")
    parser.add_argument("--category", type=str, default=None, help="특정 카테고리(폴더명)만 처리")
    args = parser.parse_args()

    run_import(dry_run=args.dry_run, force=args.force, category=args.category)


if __name__ == "__main__":
    main()
