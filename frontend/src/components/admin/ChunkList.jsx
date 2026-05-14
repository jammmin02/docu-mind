import { useState } from 'react'
import { Badge } from '../ui/Badge'
import { Spinner } from '../ui/Spinner'

const SORT_OPTIONS = [
  { value: 'index',       label: '순서' },
  { value: 'token_count', label: '토큰 수' },
  { value: 'char_count',  label: '글자 수' },
]

/**
 * 청크 목록 테이블
 *
 * Props:
 *   chunks        — 청크 배열
 *   total         — 전체 건수
 *   page          — 현재 페이지
 *   size          — 페이지 크기
 *   sort          — 정렬 기준
 *   loading       — 로딩 상태
 *   selectedId    — 선택된 청크 id
 *   onSelect      — (chunk) => void
 *   onSortChange  — (sort) => void
 *   onPageChange  — (page) => void
 */
export function ChunkList({
  chunks = [],
  total = 0,
  page = 1,
  size = 50,
  sort = 'index',
  loading = false,
  selectedId = null,
  onSelect,
  onSortChange,
  onPageChange,
}) {
  const totalPages = Math.ceil(total / size) || 1

  return (
    <div className="flex flex-col gap-3">
      {/* 헤더 툴바 */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          전체 <span className="font-semibold text-slate-800">{total}</span>개 청크
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">정렬</span>
          <select
            value={sort}
            onChange={(e) => onSortChange?.(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-12">#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-16">페이지</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-32">섹션</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 w-20">글자</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 w-20">토큰</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">미리보기</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 w-16">표</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 w-16">OCR</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Spinner />
                    <span className="text-xs">청크 불러오는 중...</span>
                  </div>
                </td>
              </tr>
            ) : chunks.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                  청크가 없습니다.
                </td>
              </tr>
            ) : (
              chunks.map((chunk) => (
                <tr
                  key={chunk.id}
                  onClick={() => onSelect?.(chunk)}
                  className={`
                    border-b border-slate-100 cursor-pointer transition-colors
                    ${selectedId === chunk.id
                      ? 'bg-blue-50 border-l-2 border-l-blue-500'
                      : 'hover:bg-slate-50'}
                  `}
                >
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                    {chunk.chunk_index}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {chunk.page_number != null ? `p.${chunk.page_number}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {chunk.section ? (
                      <span className="text-xs text-slate-600 truncate max-w-[120px] block" title={chunk.section}>
                        {chunk.section}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-xs font-mono font-medium ${
                      chunk.char_count > 700 ? 'text-orange-600' : 'text-slate-600'
                    }`}>
                      {chunk.char_count?.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-mono text-slate-500">
                      {chunk.token_count?.toLocaleString() ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-500 line-clamp-1">{chunk.preview}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {chunk.has_table
                      ? <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">표</span>
                      : <span className="text-slate-200 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {chunk.ocr_applied
                      ? <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">OCR</span>
                      : <span className="text-slate-200 text-xs">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => onPageChange?.(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            이전
          </button>
          <span className="text-xs text-slate-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange?.(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            다음
          </button>
        </div>
      )}
    </div>
  )
}
