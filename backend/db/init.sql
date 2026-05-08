-- pgvector 익스텐션 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- ── users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT,
    role        TEXT NOT NULL DEFAULT 'user',   -- 'admin' | 'user'
    created_at  TIMESTAMP DEFAULT NOW(),
    last_login  TIMESTAMP
);

-- ── categories (RAG 지식 베이스 단위) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    color       TEXT DEFAULT '#6366f1',  -- UI 표시용 hex 색상
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP
);

-- ── documents (admin 지식 문서) ────────────────────────────────────────────
-- doc_type: 'knowledge' = 관리자가 등록한 RAG 학습 문서
CREATE TABLE IF NOT EXISTS documents (
    id              SERIAL PRIMARY KEY,
    filename        TEXT NOT NULL,
    file_type       TEXT NOT NULL,              -- pdf | docx | txt | xlsx | csv | pptx
    doc_type        TEXT NOT NULL DEFAULT 'knowledge',  -- knowledge (향후 확장 가능)
    content         TEXT NOT NULL DEFAULT '',   -- 파싱된 전체 텍스트
    file_path       TEXT,                       -- 원본 파일 저장 경로
    storage_type    TEXT DEFAULT 'local',
    file_size       INTEGER,
    chunk_count     INTEGER,
    status          TEXT DEFAULT 'processing',  -- processing | ready | failed
    error_message   TEXT,
    category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    uploaded_at     TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP
);

-- ── chunks ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chunks (
    id               SERIAL PRIMARY KEY,
    document_id      INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content          TEXT NOT NULL,
    context_summary  TEXT,                      -- 문맥 강화 RAG용 (Phase 3)
    embedding        vector(1536),              -- OpenAI text-embedding-3-large with dimensions=1536
    chunk_index      INTEGER NOT NULL,
    token_count      INTEGER,
    created_at       TIMESTAMP DEFAULT NOW()
);

-- ── chat_sessions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
    id                   SERIAL PRIMARY KEY,
    session_id           TEXT UNIQUE NOT NULL,
    title                TEXT,
    total_messages       INTEGER DEFAULT 0,
    last_message_preview TEXT,
    created_at           TIMESTAMP DEFAULT NOW(),
    updated_at           TIMESTAMP
);

-- ── chat_messages ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    role        TEXT NOT NULL,                  -- user | assistant
    content     TEXT NOT NULL,
    sources     JSONB,                          -- [{"filename": "...", "chunk_index": 3}]
    created_at  TIMESTAMP DEFAULT NOW()
);

-- ── report_templates (사용자 업로드 양식) ─────────────────────────────────
-- 사용자가 보고서 생성 시 업로드하는 양식 파일
-- "이거 채워줘" / "이거랑 비슷한 양식 찾아줘"
CREATE TABLE IF NOT EXISTS report_templates (
    id          SERIAL PRIMARY KEY,
    filename    TEXT NOT NULL,
    file_type   TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    content     TEXT NOT NULL DEFAULT '',       -- 파싱된 텍스트 (양식 구조 파악용)
    created_at  TIMESTAMP DEFAULT NOW()
);

-- ── reports ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
    id              SERIAL PRIMARY KEY,
    document_ids    JSONB NOT NULL,             -- [1, 2, 3]  지식 문서 ID 목록
    template_id     INTEGER REFERENCES report_templates(id),  -- 양식 ID (선택)
    report_type     TEXT NOT NULL,              -- summary | analysis | minutes | template_fill
    content         TEXT NOT NULL DEFAULT '',
    file_path       TEXT,
    status          TEXT DEFAULT 'generating',  -- generating | done | failed
    error_message   TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ── 인덱스 ────────────────────────────────────────────────────────────────
-- 주의: ivfflat은 데이터가 어느 정도 쌓인 후 생성 권장
-- 개발 초기에는 hnsw 또는 기본 인덱스 없이 시작 가능
CREATE INDEX IF NOT EXISTS idx_chunks_document_id
    ON chunks (document_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
    ON chat_messages (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_documents_status
    ON documents (status);

CREATE INDEX IF NOT EXISTS idx_documents_doc_type
    ON documents (doc_type);

CREATE INDEX IF NOT EXISTS idx_documents_category_id
    ON documents (category_id);

CREATE INDEX IF NOT EXISTS idx_categories_name
    ON categories (name);
