import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from db.database import check_db_connection, close_pool
from limiter import limiter
from routers import documents, chat, report, auth, categories, company, templates, admin

load_dotenv()

ENV = os.getenv("ENV", "development")
IS_PROD = ENV == "production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 시작/종료 시 DB 풀 관리"""
    yield                # 앱 실행 중
    close_pool()         # 앱 종료 시 풀 정리


# 프로덕션에서는 /docs, /redoc 비노출
app = FastAPI(
    title="RAG 문서 Q&A API",
    description="기업용 RAG 기반 문서 Q&A 및 보고서 생성 시스템",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None if IS_PROD else "/docs",
    redoc_url=None if IS_PROD else "/redoc",
    openapi_url=None if IS_PROD else "/openapi.json",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# 허용 오리진: 환경변수로 재정의 가능 (쉼표 구분)
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# ── Rate Limiter ─────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],   # origins are restricted; headers are not a CORS security boundary
)

# ── 라우터 등록 ───────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(company.router)
app.include_router(templates.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(report.router)
app.include_router(admin.router)


# ── 헬스체크 ─────────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health():
    db_ok = check_db_connection()
    return {
        "status":   "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "disconnected",
        "version":  "0.1.0",
    }


@app.get("/", tags=["health"])
def root():
    return {"message": "RAG 문서 Q&A API"}
