import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

STORAGE_PATH = Path(os.getenv("STORAGE_LOCAL_PATH", "./storage/uploads"))


class StorageService:
    def save(self, document_id: int, filename: str, contents: bytes) -> str:
        """파일을 storage/{document_id}/original.{ext} 에 저장하고 경로 반환"""
        ext = filename.rsplit(".", 1)[-1].lower()
        dir_path = STORAGE_PATH / str(document_id)
        dir_path.mkdir(parents=True, exist_ok=True)

        file_path = dir_path / f"original.{ext}"
        file_path.write_bytes(contents)
        return str(file_path)

    def delete(self, file_path: str) -> None:
        """파일 삭제. 부모 디렉토리가 비면 같이 삭제"""
        path = Path(file_path)
        if path.exists():
            path.unlink()

        parent = path.parent
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()

    def save_template(self, filename: str, contents: bytes) -> str:
        """보고서 양식 파일 저장 — storage/templates/ 하위"""
        ext = filename.rsplit(".", 1)[-1].lower()
        dir_path = STORAGE_PATH / "templates"
        dir_path.mkdir(parents=True, exist_ok=True)

        # 충돌 방지를 위해 타임스탬프 포함
        import time
        file_path = dir_path / f"{int(time.time())}_{filename}"
        file_path.write_bytes(contents)
        return str(file_path)


storage_service = StorageService()
