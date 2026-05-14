-- ── 세션 소유권 컬럼 추가 ───────────────────────────────────────────────────
-- chat_sessions에 user_id 추가 (기존 행은 NULL 유지 → 레거시 호환)
ALTER TABLE chat_sessions
    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- reports에 user_id 추가 (기존 행은 NULL 유지 → 레거시 호환)
ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- 인덱스 추가 (사용자별 목록 조회 성능)
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id
    ON chat_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_reports_user_id
    ON reports (user_id);
