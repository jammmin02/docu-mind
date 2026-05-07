FROM python:3.11-slim

WORKDIR /app

# 시스템 의존성 설치
# - curl: 헬스체크용
# - WeasyPrint 의존성: libglib2, libpango, libcairo
# - PyMuPDF: libmupdf 불필요 (바이너리 휠 사용)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libglib2.0-0 \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libffi-dev \
    libgdk-pixbuf-2.0-0 \
    shared-mime-info \
    fonts-nanum \
    && rm -rf /var/lib/apt/lists/*

# 파이썬 패키지 설치 (코드보다 먼저 복사 → 레이어 캐시 활용)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 소스코드 복사
COPY . .

# 업로드 디렉토리 생성
RUN mkdir -p storage/uploads

EXPOSE 8000

# --reload: 코드 변경 시 자동 재시작 (개발 환경)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
