import { useState } from 'react'

const DEFAULTS = { max_chunk_chars: 800, overlap_chars: 80, min_chunk_len: 30 }
const LIMITS   = {
  max_chunk_chars: { min: 100,  max: 4000, label: '최대 청크 크기 (글자)' },
  overlap_chars:   { min: 0,    max: 500,  label: '슬라이딩 윈도우 오버랩 (글자)' },
  min_chunk_len:   { min: 1,    max: 200,  label: '최소 청크 길이 (글자)' },
}

/**
 * 카테고리 청킹 파라미터 편집 컴포넌트.
 *
 * Props:
 *   value       - 현재 chunk_config 객체 (null 또는 {max_chunk_chars, overlap_chars, min_chunk_len})
 *   onChange    - (newConfig | null) => void
 *   disabled    - bool
 */
export function ChunkConfigEditor({ value, onChange, disabled = false }) {
  // value가 null이면 "기본값 사용" 상태
  const isCustom = value != null
  const cfg = value ?? DEFAULTS

  function toggleCustom(e) {
    onChange(e.target.checked ? { ...DEFAULTS } : null)
  }

  function handleField(key, raw) {
    const num = parseInt(raw, 10)
    if (isNaN(num)) return
    const { min, max } = LIMITS[key]
    onChange({ ...cfg, [key]: Math.min(max, Math.max(min, num)) })
  }

  return (
    <div className="space-y-3">
      {/* 커스텀 사용 여부 토글 */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isCustom}
          onChange={toggleCustom}
          disabled={disabled}
          className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
        />
        <span className="text-sm font-medium text-slate-700">
          이 카테고리에 커스텀 청킹 파라미터 적용
        </span>
      </label>

      {isCustom && (
        <div className="grid grid-cols-3 gap-3 pl-6">
          {Object.entries(LIMITS).map(([key, { min, max, label }]) => (
            <div key={key}>
              <label className="block text-xs text-slate-500 mb-1">{label}</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={cfg[key] ?? DEFAULTS[key]}
                  min={min}
                  max={max}
                  disabled={disabled}
                  onChange={(e) => handleField(key, e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5
                             focus:outline-none focus:ring-2 focus:ring-primary-400
                             disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">{min}~{max}</p>
            </div>
          ))}
        </div>
      )}

      {!isCustom && (
        <p className="pl-6 text-xs text-slate-400">
          전역 기본값 사용 — 최대 {DEFAULTS.max_chunk_chars}자 / 오버랩 {DEFAULTS.overlap_chars}자 / 최소 {DEFAULTS.min_chunk_len}자
        </p>
      )}
    </div>
  )
}
