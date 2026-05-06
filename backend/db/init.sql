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

-- ── documents ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id              SERIAL PRIMARY KEY,
    filename        TEXT NOT NULL,
    file_type       TEXT NOT NULL,              -- pdf | docx | txt | xlsx | csv | pptx
    content         TEXT NOT NULL,              -- 파싱된 전체 텍스트
    file_path       TEXT,                       -- 원본 파일 저장 경로
    storage_type    TEXT DEFAULT 'local',       -- local | s3
    file_size       INTEGER,
    chunk_count     INTEGER,
    status          TEXT DEFAULT 'processing',  -- processing | ready | failed
    error_message   TEXT,
    uploaded_at     TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP
);

-- ── chunks ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chunks (
    id               SERIAL PRIMARY KEY,
    document_id      INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content          TEXT NOT NULL,
    context_summary  TEXT,                      -- 문맥 강화 RAG용 (Phase 3)
    embedding        vector(1536),              -- OpenAI text-embedding-3-small
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

-- ── reports ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
    id           SERIAL PRIMARY KEY,
    document_ids JSONB NOT NULL,                -- [1, 2, 3]
    report_type  TEXT NOT NULL,                 -- summary | analysis | minutes
    content      TEXT NOT NULL DEFAULT '',
    file_path    TEXT,                          -- 변환된 PDF/DOCX 경로
    status       TEXT DEFAULT 'generating',     -- generating | done | failed
    error_message TEXT,
    created_at   TIMESTAMP DEFAULT NOW()
);

-- ── 인덱스 ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
    ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id
    ON chunks (document_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
    ON chat_messages (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_documents_status
    ON documents (status);
