from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from db.database import check_db_connection
from routers import documents, chat, report, auth, categories

load_dotenv()

app = FastAPI(
    title="RAG 문서 Q&A API",
    description="기업용 RAG 기반 문서 Q&A 및 보고서 생성 시스템",
    version="0.1.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 라우터 등록 ───────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(report.router)


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
    return {"message": "RAG 문서 Q&A API", "docs": "/docs"}
