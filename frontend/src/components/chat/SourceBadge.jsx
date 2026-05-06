export function SourceBadge({ source }) {
  return (
    <span className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] px-2 py-0.5 rounded-full transition-colors cursor-default">
      <span>📎</span>
      <span className="max-w-[120px] truncate">{source.filename}</span>
      <span className="text-slate-400">#{source.chunk_index}</span>
    </span>
  )
}
