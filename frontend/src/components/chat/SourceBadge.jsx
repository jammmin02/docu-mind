export function SourceBadge({ source }) {
  const meta      = source.metadata || {}
  const pageNum   = meta.page_number
  const section   = meta.section
  const hasTable  = meta.has_table

  // 툴팁용 상세 정보 구성
  const tooltipParts = [source.filename]
  if (pageNum != null)  tooltipParts.push(`p.${pageNum}`)
  if (section)          tooltipParts.push(section)
  if (hasTable)         tooltipParts.push('표 포함')
  const tooltip = tooltipParts.join(' · ')

  return (
    <span
      className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] px-2 py-0.5 rounded-full transition-colors cursor-default max-w-[220px]"
      title={tooltip}
    >
      <span>{hasTable ? '📊' : '📎'}</span>

      {/* 파일명 (짧게 truncate) */}
      <span className="max-w-[100px] truncate">{source.filename}</span>

      {/* 페이지 번호 */}
      {pageNum != null && (
        <span className="text-slate-400 shrink-0">p.{pageNum}</span>
      )}

      {/* 섹션명 (있을 때만, 짧게) */}
      {section && (
        <span className="text-slate-400 max-w-[60px] truncate shrink-0">
          {section}
        </span>
      )}

      {/* 섹션도 페이지도 없으면 청크 인덱스 표시 (레거시 데이터 대응) */}
      {pageNum == null && !section && (
        <span className="text-slate-400">#{source.chunk_index}</span>
      )}
    </span>
  )
}
