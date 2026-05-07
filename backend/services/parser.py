"""
파일 형식별 텍스트 추출 서비스
XLSX/CSV는 "컬럼명: 값 / 컬럼명: 값" 형태로 변환 (LLM 맥락 이해 최적화)
"""
import io


def parse_file(contents: bytes, file_type: str) -> str:
    parsers = {
        "pdf":  _parse_pdf,
        "docx": _parse_docx,
        "txt":  _parse_txt,
        "xlsx": _parse_xlsx,
        "csv":  _parse_csv,
        "pptx": _parse_pptx,
    }
    parser = parsers.get(file_type)
    if not parser:
        raise ValueError(f"지원하지 않는 파일 형식입니다: {file_type}")

    text = parser(contents)
    if not text or not text.strip():
        raise ValueError("파일에서 텍스트를 추출할 수 없습니다")
    return text.strip()


def _parse_pdf(contents: bytes) -> str:
    import fitz  # PyMuPDF
    doc = fitz.open(stream=contents, filetype="pdf")
    pages = []
    for page in doc:
        text = page.get_text()
        if text.strip():
            pages.append(text)
    doc.close()
    return "\n\n".join(pages)


def _parse_docx(contents: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(contents))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    # 표 내용도 추출
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
            if row_text:
                paragraphs.append(row_text)
    return "\n".join(paragraphs)


def _parse_txt(contents: bytes) -> str:
    for encoding in ("utf-8", "cp949", "euc-kr"):
        try:
            return contents.decode(encoding)
        except UnicodeDecodeError:
            continue
    return contents.decode("utf-8", errors="ignore")


def _parse_xlsx(contents: bytes) -> str:
    import pandas as pd
    xl = pd.ExcelFile(io.BytesIO(contents))
    rows = []
    for sheet_name in xl.sheet_names:
        df = xl.parse(sheet_name)
        rows.append(f"[시트: {sheet_name}]")
        for _, row in df.iterrows():
            # "컬럼명: 값" 형태로 변환 — LLM이 맥락을 잘 파악하도록
            row_parts = [
                f"{col}: {val}"
                for col, val in row.items()
                if pd.notna(val) and str(val).strip()
            ]
            if row_parts:
                rows.append(" / ".join(row_parts))
    return "\n".join(rows)


def _parse_csv(contents: bytes) -> str:
    import pandas as pd
    # 인코딩 자동 감지
    for encoding in ("utf-8", "cp949", "euc-kr"):
        try:
            df = pd.read_csv(io.BytesIO(contents), encoding=encoding)
            break
        except (UnicodeDecodeError, Exception):
            continue
    else:
        df = pd.read_csv(io.BytesIO(contents), encoding="utf-8", errors="ignore")

    rows = []
    for _, row in df.iterrows():
        row_parts = [
            f"{col}: {val}"
            for col, val in row.items()
            if pd.notna(val) and str(val).strip()
        ]
        if row_parts:
            rows.append(" / ".join(row_parts))
    return "\n".join(rows)


def _parse_pptx(contents: bytes) -> str:
    from pptx import Presentation
    prs = Presentation(io.BytesIO(contents))
    slides = []
    for i, slide in enumerate(prs.slides, 1):
        texts = []
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                texts.append(shape.text.strip())
        if texts:
            slides.append(f"[슬라이드 {i}]\n" + "\n".join(texts))
    return "\n\n".join(slides)
