import { useState, useEffect } from 'react'
import { Button } from '../ui/Button'

const PRESET_COLORS = [
  '#6366f1', // indigo
  '#0ea5e9', // sky
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
]

/**
 * 카테고리 생성 / 수정 모달
 *
 * Props:
 *  mode        - 'create' | 'edit'
 *  initial     - 수정 시 기존 카테고리 객체
 *  onConfirm   - async (data) => void
 *  onClose     - () => void
 */
export function CategoryModal({ mode = 'create', initial, onConfirm, onClose }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [color, setColor] = useState(initial?.color ?? '#6366f1')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // ESC 키로 닫기
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { setError('카테고리 이름을 입력해 주세요.'); return }
    try {
      setSubmitting(true)
      setError(null)
      await onConfirm({ name: name.trim(), description: description.trim() || null, color })
      onClose()
    } catch (err) {
      setError(err.message ?? '처리 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    /* backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-800">
            {mode === 'create' ? '새 카테고리 추가' : '카테고리 수정'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* 이름 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              카테고리 이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 인사 관리, 재무 분석, 마케팅"
              maxLength={50}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
            />
          </div>

          {/* 설명 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">설명 (선택)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="이 카테고리에 어떤 문서를 업로드하는지 설명해 주세요"
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
            />
          </div>

          {/* 색상 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">색상</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-none"
                  style={{ backgroundColor: c, outline: color === c ? `3px solid ${c}` : 'none', outlineOffset: '2px' }}
                  title={c}
                />
              ))}
              {/* 직접 입력 */}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-slate-400">직접 입력</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border-0 p-0"
                />
              </div>
            </div>
          </div>

          {/* 미리보기 */}
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-sm text-slate-700 font-medium truncate">
              {name || '카테고리 이름 미리보기'}
            </span>
          </div>

          {/* 에러 */}
          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              ⚠️ {error}
            </p>
          )}

          {/* 버튼 */}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
              취소
            </Button>
            <Button type="submit" size="sm" disabled={submitting || !name.trim()}>
              {submitting ? '저장 중...' : mode === 'create' ? '추가' : '저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
