import { useState } from 'react'
import { adminApi } from '../../api/admin'
import { Button } from '../ui/Button'

/**
 * 검색 디버그 패널
 *
 * Props:
 *   documentId  — 특정 문서로 범위 제한 시 사용 (null이면 전체)
 *   categoryId  — 특정 카테고리로 범위 제한 (null이면 전체)
 */
export function SearchDebugPanel({ documentId = null, categoryId = null }) {
  const [query,       setQuery]       = useState('')
  const [topK,        setTopK]        = useState(5)
  const [scoreCutoff, setScoreCutoff] = useState(0.3)
  const [callLlm,     setCallLlm]     = useState(true)
  const [result,      setResult]      = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  // 컨텍스트 / 프롬프트 토글
  const [showContext, setShowContext]  = useState(false)
  const [showPrompt,  setShowPrompt]   = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const body = {
        query,
        top_k:        topK,
        score_cutoff: scoreCutoff,
        call_llm:     callLlm,
        document_ids: documentId ? [documentId] : null,
        category_id:  categoryId ?? null,
      }
      const res = await adminApi.debugSearch(body)
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSearch()
  }

  return (
    <div className="space-y-5">
      {/* ── 입력 영역 ───────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
            테스트 질문
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="질문을 입력하세요 (Ctrl+Enter로 실행)"
            rows={3}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* 옵션 행 */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span>Top-K</span>
            <input
              type="number"
              min={1} max={20}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="w-14 border border-slate-200 rounded px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span>Score Cutoff</span>
            <input
              type="number"
              min={0} max={1} step={0.05}
              value={scoreCutoff}
              onChange={(e) => setScoreCutoff(Number(e.target.value))}
              className="w-16 border border-slate-200 rounded px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={callLlm}
              onChange={(e) => setCallLlm(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-blue-600"
            />
            LLM 답변 생성
          </label>

          <div className="ml-auto">
            <Button
              onClick={handleSearch}
              loading={loading}
              disabled={!query.trim()}
              size="sm"
            >
              검색 실행
            </Button>
          </div>
        </div>

        {documentId && (
          <p className="text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
            이 문서({documentId})에서만 검색합니다.
          </p>
        )}
      </div>

      {/* ── 에러 ────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ── 결과 ────────────────────────────────────────────────────── */}
      {result && (
        <div className="space-y-4">
          {/* 메타 배지 */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-slate-500">
              검색된 청크 <span className="font-semibold text-slate-700">{result.chunk_count}</span>개
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500">
              소요 <span className="font-semibold text-slate-700">{result.elapsed_ms}ms</span>
            </span>
          </div>

          {/* 검색 결과 테이블 */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-center w-10">순위</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-center w-20">점수</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">파일 / 섹션</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-center w-16">페이지</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">미리보기</th>
                </tr>
              </thead>
              <tbody>
                {result.chunks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-sm">
                      검색 결과가 없습니다. score_cutoff를 낮추거나 질문을 바꿔보세요.
                    </td>
                  </tr>
                ) : (
                  result.chunks.map((c) => (
                    <tr key={c.chunk_id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold inline-flex items-center justify-center">
                          {c.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ScoreBar score={c.score} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium text-slate-700 truncate max-w-[160px]">{c.filename}</p>
                        {c.section && (
                          <p className="text-xs text-slate-400 truncate max-w-[160px]">{c.section}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate-500">
                        {c.page_number != null ? `p.${c.page_number}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[280px]">
                        <span className="line-clamp-2">{c.preview}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* LLM 컨텍스트 토글 */}
          <ToggleSection
            label="LLM에 전달된 Context"
            open={showContext}
            onToggle={() => setShowContext((v) => !v)}
          >
            <pre className="bg-slate-900 rounded-xl p-4 text-xs text-green-300 leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto scrollbar-thin">
              {result.llm_context || '(없음)'}
            </pre>
          </ToggleSection>

          {/* 프롬프트 미리보기 토글 */}
          <ToggleSection
            label="프롬프트 미리보기"
            open={showPrompt}
            onToggle={() => setShowPrompt((v) => !v)}
          >
            <pre className="bg-slate-900 rounded-xl p-4 text-xs text-yellow-200 leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto scrollbar-thin">
              {result.llm_prompt_preview || '(없음)'}
            </pre>
          </ToggleSection>

          {/* LLM 최종 답변 */}
          {result.answer != null && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-700 mb-2">최종 답변</p>
              <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{result.answer}</p>
            </div>
          )}
          {callLlm && result.answer == null && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-400">
              LLM 답변이 없습니다.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── 내부 컴포넌트 ──────────────────────────────────────────────────────────── */

function ScoreBar({ score }) {
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-orange-400'
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-xs font-mono font-semibold text-slate-700">{score.toFixed(3)}</span>
      <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ToggleSection({ label, open, onToggle, children }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="text-xs font-semibold text-slate-600">{label}</span>
        <span className="text-slate-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}
