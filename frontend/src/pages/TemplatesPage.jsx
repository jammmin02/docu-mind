import { useState, useCallback } from 'react'
import { Layout } from '../components/layout/Layout'
import { Button } from '../components/ui/Button'
import { TemplateEditor } from '../components/templates/TemplateEditor'
import { useTemplates } from '../hooks/useTemplates'

// ── 필드 프리셋 (자주 쓰는 필수 입력 항목) ───────────────────────────────────
const FIELD_PRESETS = [
  { title: '예산',        placeholder: '항목별 예산 금액과 배분 계획을 입력하세요',      icon: '💰' },
  { title: '내부 전략',   placeholder: '대외비 전략 방향 및 핵심 실행 계획을 입력하세요', icon: '🔒' },
  { title: '민감 정보',   placeholder: '외부에 공개할 수 없는 정보를 직접 입력하세요',    icon: '⚠️' },
  { title: '프로젝트 일정', placeholder: '주요 마일스톤과 일정을 입력하세요',             icon: '📅' },
  { title: '담당자 정보', placeholder: '담당자명 및 연락처를 입력하세요',                icon: '👤' },
  { title: '실적 데이터', placeholder: '최신 실적 수치를 직접 입력하세요',               icon: '📊' },
]

// ── 탭 버튼 ──────────────────────────────────────────────────────────────────
function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-primary-600 text-primary-700'
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function TemplatesPage() {
  const { templates, loading, createTemplate, updateTemplate, deleteTemplate } = useTemplates(false)
  const [tab,       setTab]       = useState('list')   // 'list' | 'required'
  const [editor,    setEditor]    = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const handleDelete = async (t) => {
    if (!window.confirm(`'${t.name}' 템플릿을 삭제할까요?`)) return
    setDeletingId(t.id)
    try { await deleteTemplate(t.id) } finally { setDeletingId(null) }
  }

  // 섹션 required_input 토글 (인라인 저장)
  const toggleRequired = useCallback(async (template, sectionIdx) => {
    const newSections = template.sections.map((s, i) =>
      i === sectionIdx ? { ...s, required_input: !s.required_input } : s
    )
    await updateTemplate(template.id, { sections: newSections })
  }, [updateTemplate])

  // placeholder 인라인 저장
  const updatePlaceholder = useCallback(async (template, sectionIdx, value) => {
    const newSections = template.sections.map((s, i) =>
      i === sectionIdx ? { ...s, placeholder: value } : s
    )
    await updateTemplate(template.id, { sections: newSections })
  }, [updateTemplate])

  // 프리셋 섹션 추가 (해당 템플릿에 없을 때만)
  const applyPreset = useCallback(async (template, preset) => {
    const already = template.sections.some(
      (s) => s.title.trim() === preset.title.trim()
    )
    if (already) return
    const newSections = [
      ...template.sections,
      { title: preset.title, description: '', required_input: true, placeholder: preset.placeholder },
    ]
    await updateTemplate(template.id, { sections: newSections })
  }, [updateTemplate])

  const activeTemplates   = templates.filter((t) => t.is_active)
  const totalRequired     = templates.reduce(
    (sum, t) => sum + (t.sections?.filter((s) => s.required_input).length ?? 0), 0
  )

  return (
    <Layout>
      <div className="h-full overflow-y-auto scrollbar-thin">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">

          {/* 탭 + 버튼 */}
          <div className="flex items-center justify-between border-b border-slate-200">
            <div className="flex">
              <Tab active={tab === 'list'} onClick={() => setTab('list')}>
                📋 템플릿 목록
                <span className="ml-1.5 text-xs text-slate-400">{activeTemplates.length}</span>
              </Tab>
              <Tab active={tab === 'required'} onClick={() => setTab('required')}>
                ⚠️ 필수 입력 필드 설정
                {totalRequired > 0 && (
                  <span className="ml-1.5 text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">
                    {totalRequired}
                  </span>
                )}
              </Tab>
            </div>
            {tab === 'list' && (
              <Button size="sm" onClick={() => setEditor({ mode: 'create' })}>
                + 새 템플릿
              </Button>
            )}
          </div>

          {/* 로딩 */}
          {loading && (
            <div className="flex items-center justify-center py-24 text-slate-400 text-sm">불러오는 중...</div>
          )}

          {/* ── 탭 1: 템플릿 목록 ── */}
          {!loading && tab === 'list' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {templates.map((t) => (
                <TemplateCard
                  key={t.id} template={t}
                  isDeleting={deletingId === t.id}
                  onEdit={() => setEditor({ mode: 'edit', initial: t })}
                  onDelete={() => handleDelete(t)}
                />
              ))}
              {templates.length === 0 && (
                <div className="col-span-full text-center py-20 text-slate-400">
                  <div className="text-4xl mb-3">📋</div>
                  <p className="text-sm">등록된 템플릿이 없어요</p>
                  <button onClick={() => setEditor({ mode: 'create' })}
                    className="mt-2 text-sm text-primary-500 hover:text-primary-700 underline underline-offset-2">
                    첫 템플릿 만들기
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── 탭 2: 필수 입력 필드 설정 ── */}
          {!loading && tab === 'required' && (
            <RequiredFieldsTab
              templates={templates}
              onToggle={toggleRequired}
              onUpdatePlaceholder={updatePlaceholder}
              onApplyPreset={applyPreset}
            />
          )}
        </div>
      </div>

      {/* 에디터 모달 */}
      {editor && (
        <TemplateEditor
          mode={editor.mode}
          initial={editor.initial}
          onConfirm={async (data) => {
            if (editor.mode === 'create') await createTemplate(data)
            else await updateTemplate(editor.initial.id, data)
          }}
          onClose={() => setEditor(null)}
        />
      )}
    </Layout>
  )
}


// ── 템플릿 카드 (목록 탭) ─────────────────────────────────────────────────────

function TemplateCard({ template, isDeleting, onEdit, onDelete }) {
  const sections      = template.sections ?? []
  const requiredCount = sections.filter((s) => s.required_input).length

  return (
    <div className={`bg-white border rounded-2xl p-5 shadow-sm flex flex-col gap-3 transition-opacity ${
      !template.is_active ? 'opacity-50' : ''
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-800 text-sm truncate">{template.name}</h3>
          {template.description && (
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{template.description}</p>
          )}
        </div>
        {!template.is_active && (
          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded shrink-0">비활성</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {sections.map((s, i) => (
          <span key={i} className={`text-xs px-2 py-0.5 rounded-full border ${
            s.required_input
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-slate-50 text-slate-500 border-slate-200'
          }`}>
            {s.title}{s.required_input && ' *'}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-400 mt-auto">
        <span>{sections.length}개 섹션</span>
        {requiredCount > 0 && <span className="text-amber-500">{requiredCount}개 필수 입력</span>}
      </div>

      <div className="flex gap-2 pt-1 border-t border-slate-100">
        <Button variant="ghost" size="sm" onClick={onEdit} className="flex-1 text-xs">수정</Button>
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={isDeleting}
          className="flex-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50">
          {isDeleting ? '삭제 중...' : '삭제'}
        </Button>
      </div>
    </div>
  )
}


// ── 필수 입력 필드 탭 ─────────────────────────────────────────────────────────

function RequiredFieldsTab({ templates, onToggle, onUpdatePlaceholder, onApplyPreset }) {
  const activeTemplates = templates.filter((t) => t.is_active)
  const totalRequired   = activeTemplates.reduce(
    (sum, t) => sum + (t.sections?.filter((s) => s.required_input).length ?? 0), 0
  )

  return (
    <div className="space-y-6">

      {/* 설명 배너 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-lg shrink-0 mt-0.5">⚠️</span>
        <div>
          <p className="text-sm font-medium text-amber-800">필수 입력 필드란?</p>
          <p className="text-xs text-amber-700 mt-0.5">
            AI가 자동으로 채울 수 없는 예산, 내부 전략, 민감 정보 등을 지정합니다.
            보고서 생성 후 사용자가 직접 입력해야 하는 영역으로 강조 표시됩니다.
          </p>
        </div>
      </div>

      {/* 프리셋 빠른 추가 */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">필드 프리셋</h3>
        <p className="text-xs text-slate-400 mb-3">
          자주 쓰이는 필수 입력 필드 유형이에요. 원하는 템플릿에 클릭 한 번으로 추가하세요.
        </p>
        <div className="flex flex-wrap gap-2">
          {FIELD_PRESETS.map((preset) => (
            <PresetBadge key={preset.title} preset={preset} templates={activeTemplates} onApply={onApplyPreset} />
          ))}
        </div>
      </div>

      {/* 요약 */}
      {totalRequired > 0 && (
        <p className="text-xs text-slate-500 px-1">
          현재 활성 템플릿 <strong>{activeTemplates.length}개</strong> 중
          총 <strong className="text-amber-600">{totalRequired}개</strong> 섹션이 필수 입력으로 지정되어 있어요.
        </p>
      )}

      {/* 템플릿별 섹션 테이블 */}
      {activeTemplates.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">활성 템플릿이 없어요.</div>
      ) : (
        <div className="space-y-4">
          {activeTemplates.map((t) => (
            <TemplateRequiredBlock
              key={t.id}
              template={t}
              onToggle={(idx) => onToggle(t, idx)}
              onUpdatePlaceholder={(idx, val) => onUpdatePlaceholder(t, idx, val)}
            />
          ))}
        </div>
      )}
    </div>
  )
}


// ── 프리셋 배지 (클릭 시 템플릿 선택 드롭다운) ──────────────────────────────

function PresetBadge({ preset, templates, onApply }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs bg-white border border-slate-200 hover:border-primary-300 hover:bg-primary-50 text-slate-600 px-3 py-1.5 rounded-full transition-colors"
      >
        <span>{preset.icon}</span>
        <span>{preset.title}</span>
        <span className="text-slate-400">▾</span>
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 min-w-[160px]">
            <p className="text-[11px] text-slate-400 px-3 pb-1.5 border-b border-slate-100">추가할 템플릿 선택</p>
            {templates.map((t) => {
              const already = t.sections?.some((s) => s.title.trim() === preset.title.trim())
              return (
                <button
                  key={t.id}
                  onClick={() => { onApply(t, preset); setOpen(false) }}
                  disabled={already}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    already
                      ? 'text-slate-300 cursor-not-allowed'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {t.name}
                  {already && <span className="ml-1 text-slate-300">(이미 있음)</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}


// ── 템플릿별 섹션 블록 ────────────────────────────────────────────────────────

function TemplateRequiredBlock({ template, onToggle, onUpdatePlaceholder }) {
  const [saving,     setSaving]     = useState(null)  // sectionIdx | null
  const [editingPh,  setEditingPh]  = useState(null)  // sectionIdx | null
  const [phValue,    setPhValue]    = useState('')
  const [collapsed,  setCollapsed]  = useState(false)

  const sections = template.sections ?? []
  const reqCount = sections.filter((s) => s.required_input).length

  const handleToggle = async (idx) => {
    setSaving(idx)
    try { await onToggle(idx) } finally { setSaving(null) }
  }

  const startEditPh = (idx, current) => {
    setEditingPh(idx); setPhValue(current ?? '')
  }

  const commitPh = async (idx) => {
    setSaving(idx)
    try { await onUpdatePlaceholder(idx, phValue) } finally {
      setSaving(null); setEditingPh(null)
    }
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">

      {/* 헤더 */}
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-800">{template.name}</span>
          <span className="text-xs text-slate-400">{sections.length}개 섹션</span>
          {reqCount > 0 && (
            <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-medium">
              {reqCount}개 필수 입력
            </span>
          )}
          {reqCount === 0 && (
            <span className="text-xs text-slate-400">필수 입력 없음</span>
          )}
        </div>
        <span className="text-slate-400 text-xs">{collapsed ? '▸' : '▾'}</span>
      </div>

      {/* 섹션 목록 */}
      {!collapsed && (
        <div className="border-t border-slate-100">
          {sections.length === 0 ? (
            <p className="px-5 py-4 text-xs text-slate-400">섹션이 없어요.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-5 py-2 text-xs font-medium text-slate-500 w-8">#</th>
                  <th className="px-2 py-2 text-xs font-medium text-slate-500">섹션 제목</th>
                  <th className="px-2 py-2 text-xs font-medium text-slate-500 hidden sm:table-cell">설명</th>
                  <th className="px-2 py-2 text-xs font-medium text-slate-500">사용자 안내 문구</th>
                  <th className="px-5 py-2 text-xs font-medium text-slate-500 text-center">필수 입력</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sections.map((s, i) => (
                  <tr
                    key={i}
                    className={`transition-colors ${s.required_input ? 'bg-amber-50/60' : 'bg-white hover:bg-slate-50'}`}
                  >
                    {/* 번호 */}
                    <td className="px-5 py-3 text-xs text-slate-400">{i + 1}</td>

                    {/* 제목 */}
                    <td className="px-2 py-3">
                      <span className={`text-sm font-medium ${s.required_input ? 'text-amber-800' : 'text-slate-700'}`}>
                        {s.title}
                      </span>
                    </td>

                    {/* 설명 */}
                    <td className="px-2 py-3 text-xs text-slate-400 hidden sm:table-cell max-w-[180px]">
                      <span className="line-clamp-2">{s.description || '—'}</span>
                    </td>

                    {/* placeholder 인라인 편집 */}
                    <td className="px-2 py-3 max-w-[240px]">
                      {s.required_input ? (
                        editingPh === i ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={phValue}
                              onChange={(e) => setPhValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitPh(i)
                                if (e.key === 'Escape') setEditingPh(null)
                              }}
                              className="flex-1 text-xs border border-primary-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary-400"
                              placeholder="사용자에게 표시할 안내 문구"
                            />
                            <button
                              onClick={() => commitPh(i)}
                              disabled={saving === i}
                              className="text-xs text-primary-600 hover:text-primary-800 font-medium shrink-0"
                            >
                              {saving === i ? '…' : '저장'}
                            </button>
                            <button onClick={() => setEditingPh(null)} className="text-xs text-slate-400">취소</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditPh(i, s.placeholder)}
                            className="text-xs text-left w-full text-slate-600 hover:text-primary-600 group"
                          >
                            {s.placeholder
                              ? <span className="line-clamp-2">{s.placeholder}</span>
                              : <span className="text-slate-300 group-hover:text-primary-400">+ 안내 문구 추가</span>
                            }
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>

                    {/* 토글 */}
                    <td className="px-5 py-3 text-center">
                      <ToggleSwitch
                        checked={s.required_input}
                        loading={saving === i}
                        onChange={() => handleToggle(i)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}


// ── 토글 스위치 ───────────────────────────────────────────────────────────────

function ToggleSwitch({ checked, loading, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={loading}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
        checked ? 'bg-amber-400' : 'bg-slate-200'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
      }`} />
    </button>
  )
}
