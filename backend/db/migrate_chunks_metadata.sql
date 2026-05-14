-- chunks 테이블에 metadata JSONB 컬럼 추가
-- metadata 구조:
--   {
--     "page_number": 3,          -- 원본 PDF 페이지 번호 (1-based), PDF 외 파일은 null
--     "has_table":   true,       -- 이 청크에 표 내용이 포함되어 있는지 여부
--     "section":     "서론",      -- 감지된 섹션/제목 (감지 실패 시 null)
--     "ocr_applied": false       -- OCR fallback이 적용된 페이지에서 온 청크인지 여부
--   }

ALTER TABLE chunks
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_chunks_metadata_has_table
    ON chunks USING GIN (metadata);
