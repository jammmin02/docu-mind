import { useState } from 'react'
import { Button } from '../ui/Button'
import { REPORT_TYPE_LABEL, DOCUMENT_STATUS } from '../../utils/constants'

export function ReportForm({ documents, onGenerate, isGenerating }) {
  const [docId,  setDocId]  = useState('')
  const [type,   setType]   = useState('summary')

  const readyDocs = documents.filter((d) => d.status === DOCUMENT_STATUS.READY)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!docId) return
    onGenerate({ documentId: Number(docId), reportType: type })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-slate-800 text-sm">보고서 생성</h3>

      {/* 문서 선택 */}
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
          <p className="text-xs text-slate-400 mt-1">처리 완료된 문서가 없어요. 먼저 문서를 업로드해주세요.</p>
        )}
      </div>

      {/* 보고서 종류 */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-2">보고서 종류</label>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(REPORT_TYPE_LABEL).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                type === value
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-primary-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Button type="submit" className="w-full" loading={isGenerating} disabled={!docId}>
        {isGenerating ? '생성 중...' : '보고서 생성'}
      </Button>
    </form>
  )
}
