import { useState } from 'react'
import { Button } from '../ui/Button'
import { DOCUMENT_STATUS } from '../../utils/constants'
import { useTemplates } from '../../hooks/useTemplates'

export function ReportForm({ documents, onGenerate, isGenerating }) {
  const { templates, loading: templatesLoading } = useTemplates(true)

  const [docId,      setDocId]      = useState('')
  const [templateId, setTemplateId] = useState('')

  const readyDocs = documents.filter((d) => d.status === DOCUMENT_STATUS.READY)

  const selectedTemplate = templates.find((t) => String(t.id) === String(templateId)) ?? null
  const requiredSections = selectedTemplate?.sections?.filter((s) => s.required_input) ?? []

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!docId || !templateId) return
    onGenerate({ documentId: Number(docId), templateId: Number(templateId) })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-slate-800 text-sm">보고서 생성</h3>

      {/* 기반 문서 선택 */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">기반 문서</label>
        <select
          value={docId}
          onChange={(e) => setDocId(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-primary-300"
        >
          <option value="">문서를 선택하세요</option>
          {readyDocs.map((d) => (
            <option key={d.id} value={d.id}>{d.filename}</option>
          ))}
        </select>
        {readyDocs.length === 0 && (
          <p className="text-xs text-slate-400 mt-1">처리 완료된 문서가 없어요.</p>
        )}
      </div>

      {/* 템플릿(보고서 종류) 선택 */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-2">보고서 종류</label>

        {templatesLoading ? (
          <p className="text-xs text-slate-400">템플릿 불러오는 중...</p>
        ) : templates.length === 0 ? (
          <p className="text-xs text-slate-400">등록된 템플릿이 없어요. 관리자에게 문의하세요.</p>
        ) : (
          <div className="space-y-1.5">
            {templates.map((t) => {
              const isActive = String(templateId) === String(t.id)
              const reqCount = t.sections?.filter((s) => s.required_input).length ?? 0
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    isActive
                      ? 'bg-primary-50 border-primary-300 text-primary-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-primary-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{t.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-slate-400">{t.sections?.length ?? 0}섹션</span>
                      {reqCount > 0 && (
                        <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">
                          입력 {reqCount}
                        </span>
                      )}
                    </div>
                  </div>
                  {t.description && (
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{t.description}</p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 필수 입력 섹션 안내 */}
      {requiredSections.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-1">
          <p className="text-xs font-medium text-amber-700">⚠ 아래 항목은 직접 입력이 필요해요</p>
          {requiredSections.map((s, i) => (
            <p key={i} className="text-xs text-amber-600">· {s.title}{s.placeholder ? ` — ${s.placeholder}` : ''}</p>
          ))}
          <p className="text-xs text-amber-500 mt-1">보고서 생성 후 해당 섹션을 직접 채워 주세요.</p>
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        loading={isGenerating}
        disabled={!docId || !templateId || isGenerating}
      >
        {isGenerating ? '생성 중...' : '보고서 생성'}
      </Button>
    </form>
  )
}
