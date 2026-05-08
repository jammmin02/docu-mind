import { useState, useEffect } from 'react'
import { Button } from '../ui/Button'

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent'

const EMPTY_SECTION = { title: '', description: '', required_input: false, placeholder: '' }

/**
 * 템플릿 생성 / 수정 모달
 * Props: mode('create'|'edit'), initial, onConfirm(async), onClose
 */
export function TemplateEditor({ mode = 'create', initial, onConfirm, onClose }) {
  const [name,     setName]     = useState(initial?.name        ?? '')
  const [desc,     setDesc]     = useState(initial?.description ?? '')
  const [sections, setSections] = useState(
    initial?.sections?.length ? initial.sections : [{ ...EMPTY_SECTION }]
  )
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState(null)

  // ESC 닫기
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // ── 섹션 조작 ────────────────────────────────────────────────────────────────
  const addSection    = () => setSections((p) => [...p, { ...EMPTY_SECTION }])
  const removeSection = (i) => setSections((p) => p.filter((_, idx) => idx !== i))
  const moveUp        = (i) => {
    if (i === 0) return
    setSections((p) => { const a = [...p]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a })
  }
  const moveDown = (i) => {
    setSections((p) => {
      if (i === p.length - 1) return p
      const a = [...p]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a
    })
  }
  const setSection = (i, key, value) =>
    setSections((p) => p.map((s, idx) => idx === i ? { ...s, [key]: value } : s))

  // ── 제출 ─────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim())              { setError('템플릿 이름을 입력해 주세요.'); return }
    if (sections.some((s) => !s.title.trim())) { setError('모든 섹션의 제목을 입력해 주세요.'); return }
    try {
      setSubmitting(true); setError(null)
      await onConfirm({ name: name.trim(), description: desc.trim() || null, sections })
      onClose()
    } catch (err) {
      setError(err.message ?? '처리 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">
            {mode === 'create' ? '새 템플릿 만들기' : '템플릿 수정'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>

        {/* 바디 (스크롤) */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-5">

            {/* 이름 / 설명 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  템플릿 이름 <span className="text-red-400">*</span>
                </label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="예: 사업 기획서, 월간 리포트" maxLength={100} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">설명 (선택)</label>
                <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
                  placeholder="이 템플릿이 어떤 보고서에 쓰이는지" className={inputCls} />
              </div>
            </div>

            {/* 섹션 목록 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  섹션 구성 <span className="text-slate-400 font-normal">({sections.length}개)</span>
                </label>
                <button type="button" onClick={addSection}
                  className="text-xs text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1">
                  + 섹션 추가
                </button>
              </div>

              <div className="space-y-2">
                {sections.map((s, i) => (
                  <SectionRow
                    key={i} index={i} total={sections.length} section={s}
                    onChange={(k, v) => setSection(i, k, v)}
                    onRemove={() => removeSection(i)}
                    onUp={() => moveUp(i)}
                    onDown={() => moveDown(i)}
                  />
                ))}
              </div>

              {sections.length === 0 && (
                <div className="text-center py-6 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                  섹션이 없어요. 위 버튼으로 추가해 주세요.
                </div>
              )}
            </div>

            {/* 에러 */}
            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">⚠️ {error}</p>
            )}
          </div>

          {/* 푸터 */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>취소</Button>
            <Button type="submit" size="sm" disabled={submitting || !name.trim()} loading={submitting}>
              {mode === 'create' ? '템플릿 저장' : '변경 저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── 섹션 행 ───────────────────────────────────────────────────────────────────

function SectionRow({ index, total, section, onChange, onRemove, onUp, onDown }) {
  const [open, setOpen] = useState(true)

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      section.required_input ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white'
    }`}>
      {/* 행 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* 순서 번호 */}
        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs flex items-center justify-center shrink-0 font-medium">
          {index + 1}
        </span>

        {/* 제목 인풋 */}
        <input
          type="text"
          value={section.title}
          onChange={(e) => onChange('title', e.target.value)}
          placeholder="섹션 제목 (예: 개요, 시장 분석)"
          className="flex-1 text-sm font-medium text-slate-800 outline-none bg-transparent placeholder:text-slate-400 placeholder:font-normal"
        />

        {/* 필수 입력 토글 */}
        <button
          type="button"
          onClick={() => onChange('required_input', !section.required_input)}
          title={section.required_input ? '필수 입력 해제' : '필수 입력으로 설정'}
          className={`text-xs px-2 py-0.5 rounded-full border transition-colors shrink-0 ${
            section.required_input
              ? 'bg-amber-100 text-amber-700 border-amber-200'
              : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200'
          }`}
        >
          {section.required_input ? '필수 입력 ✓' : '필수 입력'}
        </button>

        {/* 순서 이동 */}
        <div className="flex gap-0.5 shrink-0">
          <button type="button" onClick={onUp} disabled={index === 0}
            className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 disabled:opacity-25 text-xs">▲</button>
          <button type="button" onClick={onDown} disabled={index === total - 1}
            className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 disabled:opacity-25 text-xs">▼</button>
        </div>

        {/* 펼치기/접기 */}
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 text-xs">
          {open ? '▾' : '▸'}
        </button>

        {/* 삭제 */}
        <button type="button" onClick={onRemove}
          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-red-500 text-xs shrink-0">
          ✕
        </button>
      </div>

      {/* 펼침 영역 */}
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2">
          <div>
            <label className="block text-[11px] text-slate-500 mb-0.5">섹션 설명</label>
            <input
              type="text"
              value={section.description}
              onChange={(e) => onChange('description', e.target.value)}
              placeholder="이 섹션에 어떤 내용을 작성하는지 AI에게 안내"
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary-400 bg-white"
            />
          </div>
          {section.required_input && (
            <div>
              <label className="block text-[11px] text-slate-500 mb-0.5">
                사용자 안내 문구 <span className="text-amber-500">(필수 입력 항목)</span>
              </label>
              <input
                type="text"
                value={section.placeholder}
                onChange={(e) => onChange('placeholder', e.target.value)}
                placeholder="예: 프로젝트 예산 금액과 항목별 배분을 입력하세요"
                className="w-full text-xs border border-amber-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-amber-400 bg-white"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
