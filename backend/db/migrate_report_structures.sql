-- ── 보고서 템플릿(섹션 구조) 마이그레이션 ────────────────────────────────────

-- 1) report_structures 테이블 생성
CREATE TABLE IF NOT EXISTS report_structures (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    -- sections: [{title, description, required_input, placeholder}]
    sections    JSONB NOT NULL DEFAULT '[]',
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP
);

-- 2) reports 테이블에 structure_id 컬럼 추가
ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS structure_id INTEGER REFERENCES report_structures(id) ON DELETE SET NULL;

-- 3) 기본 템플릿 3개 seed (없을 때만 삽입)
INSERT INTO report_structures (name, description, sections) VALUES
(
  '요약 보고서',
  '문서의 핵심 내용을 체계적으로 요약합니다.',
  '[
    {"title":"개요","description":"문서의 전체 목적과 배경을 서술","required_input":false,"placeholder":""},
    {"title":"핵심 내용","description":"3~5개 항목으로 핵심 내용 정리","required_input":false,"placeholder":""},
    {"title":"주요 결론","description":"문서에서 도출되는 결론","required_input":false,"placeholder":""}
  ]'::jsonb
),
(
  '분석 보고서',
  '현황 분석부터 개선 방안까지 심층 분석 보고서를 작성합니다.',
  '[
    {"title":"현황 분석","description":"현재 상태와 주요 데이터","required_input":false,"placeholder":""},
    {"title":"문제점 / 이슈","description":"발견된 문제점과 원인","required_input":false,"placeholder":""},
    {"title":"인사이트","description":"분석에서 도출된 시사점","required_input":false,"placeholder":""},
    {"title":"개선 방안","description":"구체적인 액션 아이템","required_input":false,"placeholder":""}
  ]'::jsonb
),
(
  '사업 기획서',
  '사업 계획을 체계적으로 정리하는 기획서 템플릿입니다.',
  '[
    {"title":"개요","description":"사업 아이디어 및 배경","required_input":false,"placeholder":""},
    {"title":"시장 분석","description":"타깃 시장 규모 및 경쟁 현황","required_input":false,"placeholder":""},
    {"title":"전략","description":"차별화 전략 및 실행 계획","required_input":false,"placeholder":""},
    {"title":"예산","description":"사업 추진에 필요한 예산 계획","required_input":true,"placeholder":"예산 규모와 항목별 배분을 입력하세요"},
    {"title":"결론","description":"기대 효과 및 마무리","required_input":false,"placeholder":""}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;

-- 4) 인덱스
CREATE INDEX IF NOT EXISTS idx_report_structures_active
    ON report_structures (is_active);
