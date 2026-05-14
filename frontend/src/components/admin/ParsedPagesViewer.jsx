/**
 * ParsedPagesViewer
 * 문서의 parsed_pages 테이블 데이터를 페이지 카드 형태로 표시합니다.
 */
import { useState, useEffect } from 'react'
import { Spinner } from '../ui/Spinner'
import { adminApi } from '../../api/admin'

export function ParsedPagesViewer({ documentId }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [expanded, setExpanded] = useState({}) // { [page_number]: bool }

  useEffect(() => {
    if (!documentId) return
    setLoading(true)
    setError(null)
    adminApi.getParsedPages(documentId)
      .then(setData)
      .catch((e) => setError(e.message ?? 'parsed_pages 로드 실패'))
      .finally(() => setLoading(false))
  }, [documentId])

  const toggleExpand = (pageNum) =>
    setExpanded((prev) => ({ ...prev, [pageNum]: !prev[pageNum] }))

  if (loading) return <div className="flex items-center gap-2 text-slate-500 text-sm py-6"><Spinner size="sm" /> 불러오는 중...</div>
  if (error)   return <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
  if (!data)   return null

  if (data.total_pages === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700">
        저장된 파싱 결과가 없습니다. 문서를 처리하거나 재파싱을 실행해 주세요.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">
          총 <span className="font-bold text-blue-600">{data.total_pages}</span>페이지
        </p>
        <button
          onClick={() => {
            const allExpanded = data.pages.every((p) => expanded[p.page_number])
            const next = {}
            data.pages.forEach((p) => { next[p.page_number] = !allExpanded })
            setExpanded(next)
          }}
          className="text-xs text-blue-500 hover:text-blue-700"
        >
          {data.pages.every((p) => expanded[p.page_number]) ? '모두 접기' : '모두 펼치기'}
        </button>
      </div>

      {data.pages.map((page) => (
        <div
          key={page.page_number}
          className="bg-white border border-slate-200 rounded-xl overflow-hidden"
        >
          {/* 페이지 헤더 */}
          <button
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
            onClick={() => toggleExpand(page.page_number)}
          >
            {/* 페이지 번호 */}
            <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
              {page.page_number}
            </span>

            {/* 메타 정보 */}
            <div className="flex-1 flex items-center gap-3 flex-wrap min-w-0">
              <span className="text-sm text-slate-700 font-medium">
                {page.char_count?.toLocaleString() ?? 0}자
              </span>
              {page.has_table && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                  표 포함
                </span>
              )}
              {page.ocr_applied && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                  OCR
                </span>
              )}
              <span className="text-xs text-slate-400 truncate max-w-xs">
                {page.content_preview?.slice(0, 80).replace(/\n/g, ' ')}...
              </span>
            </div>

            {/* 토글 아이콘 */}
            <span className="text-slate-400 text-xs shrink-0">
              {expanded[page.page_number] ? '▲' : '▼'}
            </span>
          </button>

          {/* 페이지 텍스트 (펼침) */}
          {expanded[page.page_number] && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <pre className="mt-3 text-xs text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto scrollbar-thin font-sans">
                {page.content_preview}
                {page.char_count > 500 && (
                  <span className="text-slate-400 not-italic">
                    {'\n\n'}… (총 {page.char_count?.toLocaleString()}자, 처음 500자만 표시)
                  </span>
                )}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
