-- ── Phase 2 마이그레이션 ──────────────────────────────────────────────────────
-- 실행: psql -d <dbname> -f 002_phase2.sql

-- 1. categories: 카테고리별 청킹 파라미터 (없으면 전역 기본값 사용)
ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS chunk_config JSONB DEFAULT NULL;
-- 예시: {"max_chunk_chars": 600, "overlap_chars": 60, "min_chunk_len": 20}

-- 2. parsed_pages: 파싱된 페이지 단위 결과 저장
CREATE TABLE IF NOT EXISTS parsed_pages (
    id          SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,          -- 1-based
    content     TEXT    NOT NULL DEFAULT '',
    char_count  INTEGER,                   -- LENGTH(content) — 앱에서 계산해서 INSERT
    has_table   BOOLEAN DEFAULT FALSE,
    ocr_applied BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE (document_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_parsed_pages_document_id
    ON parsed_pages (document_id);

-- 추가 status 값: 'reparsing' | 'rechunking' | 'reembedding'
-- documents.status 컬럼이 이미 TEXT이므로 별도 마이그레이션 불필요
