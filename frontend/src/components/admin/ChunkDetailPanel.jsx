import { useEffect, useState } from 'react'
import { adminApi } from '../../api/admin'
import { Spinner } from '../ui/Spinner'

/**
 * 청크 상세 슬라이드 패널
 *
 * Props:
 *   chunkId   — 선택된 청크 id (null이면 닫힘)
 *   onClose   — () => void
 */
export function ChunkDetailPanel({ chunkId, onClose }) {
  const [chunk, setChunk]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (!chunkId) { setChunk(null); return }
    setLoading(true)
    setError(null)
    adminApi.getChunk(chunkId)
      .then(setChunk)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [chunkId])

  if (!chunkId) return null

  const meta = chunk?.metadata || {}

  return (
    <>
      {/* 오버레이 */}
      <div
        className="fixed inset-0 bg-black/20 z-30"
        onClick={onClose}
      />

      {/* 패널 */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl z-40 flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              청크 #{chunk?.chunk_index ?? '…'} 상세
            </h3>
            {chunk?.filename && (
              <p className="text-xs text-slate-400 mt-0.5">{chunk.filename}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none p-1"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {chunk && !loading && (
            <>
              {/* 메타 배지 그룹 */}
              <div className="flex flex-wrap gap-2">
                {meta.page_number != null && (
                  <MetaBadge label="페이지" value={`p.${meta.page_number}`} color="blue" />
                )}
                {meta.section && (
                  <MetaBadge label="섹션" value={meta.section} color="indigo" />
                )}
                <MetaBadge label="글자 수" value={chunk.char_count?.toLocaleString()} color="slate" />
                <MetaBadge label="토큰 수" value={chunk.token_count?.toLocaleString() ?? '—'} color="slate" />
                {meta.has_table && <MetaBadge label="표 포함" value="✓" color="amber" />}
                {meta.ocr_applied && <MetaBadge label="OCR" value="적용" color="purple" />}
              </div>

              {/* 청크 본문 */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  청크 내용
                </p>
                <pre className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto">
                  {chunk.content}
                </pre>
              </div>

              {/* 내부 메타 (raw) */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  메타데이터 (raw)
                </p>
                <pre className="bg-slate-900 rounded-xl p-4 text-xs text-green-300 leading-relaxed overflow-x-auto">
                  {JSON.stringify(meta, null, 2)}
                </pre>
              </div>

              {/* content_hash */}
              {chunk.content_hash && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Content Hash (SHA-256)
                  </p>
                  <p className="font-mono text-xs text-slate-400 break-all">{chunk.content_hash}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

function MetaBadge({ label, value, color = 'slate' }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-700 border-blue-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    amber:  'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    slate:  'bg-slate-50 text-slate-600 border-slate-200',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-medium ${colors[color]}`}>
      <span className="text-xs opacity-60">{label}</span>
      <span>{value}</span>
    </span>
  )
}
