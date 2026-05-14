-- 청크 임베딩 캐시를 위한 content_hash 컬럼 추가
-- SHA-256 hex digest (64자)
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- 해시 조회 인덱스 (캐시 히트 조회에 사용)
CREATE INDEX IF NOT EXISTS idx_chunks_content_hash
    ON chunks (content_hash)
    WHERE content_hash IS NOT NULL;

-- 기존 행은 content_hash가 NULL — 재처리 시 자동으로 채워짐
