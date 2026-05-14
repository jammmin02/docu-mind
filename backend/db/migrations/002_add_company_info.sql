-- ── 회사 기본 정보 관리 마이그레이션 ────────────────────────────────────────
-- 실행: docker exec -it rag_db psql -U postgres -d ragdb -f /tmp/migrate_company_info.sql

-- 1) company_info 테이블 생성 (단일 행 singleton 패턴)
--    id=1 고정 행을 UPSERT로 관리
CREATE TABLE IF NOT EXISTS company_info (
    id                  INTEGER PRIMARY KEY DEFAULT 1,  -- 항상 1
    company_name        TEXT,
    description         TEXT,                          -- 회사 소개
    business_fields     JSONB DEFAULT '[]',            -- 사업 분야 (배열)
    main_services       JSONB DEFAULT '[]',            -- 주요 서비스 (배열)
    vision_goals        TEXT,                          -- 비전 및 목표
    default_report_info TEXT,                          -- 기본 보고서 참고 정보
    updated_at          TIMESTAMP DEFAULT NOW(),
    -- singleton 보장: id=1만 허용
    CONSTRAINT company_info_singleton CHECK (id = 1)
);

-- 2) 기본 빈 행 삽입 (없으면)
INSERT INTO company_info (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
