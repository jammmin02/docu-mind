-- ── AI 톤 설정 필드 추가 마이그레이션 ───────────────────────────────────────
ALTER TABLE company_info
    ADD COLUMN IF NOT EXISTS report_tone TEXT,  -- 보고서 작성 톤/스타일
    ADD COLUMN IF NOT EXISTS chat_tone   TEXT;  -- 채팅 응답 톤/스타일
