-- ── 카테고리 및 문서 관리 마이그레이션 ──────────────────────────────────────
-- 실행: psql -U <user> -d <db> -f migrate_categories.sql

-- 1) categories 테이블 생성
CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    color       TEXT DEFAULT '#6366f1',  -- UI 표시용 hex 색상
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP
);

-- 2) documents 테이블에 category_id 컬럼 추가
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

-- 3) 인덱스
CREATE INDEX IF NOT EXISTS idx_documents_category_id
    ON documents (category_id);

-- 4) init.sql 반영용: categories 인덱스
CREATE INDEX IF NOT EXISTS idx_categories_name
    ON categories (name);
