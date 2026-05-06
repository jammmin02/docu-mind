import { Button } from '../ui/Button'
import { Spinner } from '../ui/Spinner'
import { REPORT_TYPE_LABEL } from '../../utils/constants'

export function ReportViewer({ report, streamingText, isGenerating, onDownload }) {
  const content = isGenerating ? streamingText : report?.content

  if (!content && !isGenerating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3 bg-white border border-slate-200 rounded-xl">
        <div className="text-4xl">📝</div>
        <p className="text-sm">보고서를 생성하면 여기에 표시됩니다</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">
            {report ? REPORT_TYPE_LABEL[report.report_type] : '보고서'} 결과
          </span>
          {isGenerating && <Spinner size="sm" />}
        </div>
        {report?.id && (
          <div className="flex gap-2">
            <Button
              variant="secondary" size="sm"
              disabled={!report.file_path}
              onClick={() => onDownload(report.id, 'pdf')}
            >
              PDF {!report.file_path && '(변환 중...)'}
            </Button>
            <Button
              variant="secondary" size="sm"
              disabled={!report.file_path}
              onClick={() => onDownload(report.id, 'docx')}
            >
              DOCX
            </Button>
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
        <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed whitespace-pre-wrap text-sm">
          {content}
          {isGenerating && (
            <span className="inline-block w-1.5 h-4 bg-primary-400 rounded ml-0.5 animate-pulse align-middle" />
          )}
        </div>
      </div>
    </div>
  )
}
