import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { formatFileSize, formatRelativeTime, fileExtension } from '../../utils/formatters'

const STATUS_VARIANT = {
  processing: 'processing',
  ready:      'success',
  failed:     'danger',
  timeout:    'warning',
}

const STATUS_LABEL = {
  processing: '처리 중',
  ready:      '완료',
  failed:     '실패',
  timeout:    '시간 초과',
}

const EXT_COLOR = {
  pdf: 'bg-red-100 text-red-600',
  docx: 'bg-blue-100 text-blue-600',
  xlsx: 'bg-green-100 text-green-600',
  pptx: 'bg-orange-100 text-orange-600',
  csv: 'bg-teal-100 text-teal-600',
  txt: 'bg-slate-100 text-slate-600',
}

export function DocumentCard({ doc, onDelete, onReprocess }) {
  const ext = fileExtension(doc.filename)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3 hover:shadow-sm transition-shadow">
      {/* 파일 아이콘 */}
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold uppercase shrink-0 ${EXT_COLOR[ext] ?? 'bg-slate-100 text-slate-600'}`}>
        {ext}
      </div>

      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate" title={doc.filename}>
          {doc.filename}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant={STATUS_VARIANT[doc.status] ?? 'default'}>
            {STATUS_LABEL[doc.status] ?? doc.status}
          </Badge>
          {doc.chunk_count != null && doc.status === 'ready' && (
            <span className="text-xs text-slate-400">{doc.chunk_count}개 청크</span>
          )}
          {doc.file_size && (
            <span className="text-xs text-slate-400">{formatFileSize(doc.file_size)}</span>
          )}
          <span className="text-xs text-slate-400">{formatRelativeTime(doc.uploaded_at)}</span>
        </div>
        {doc.error_message && (
          <p className="text-xs text-red-500 mt-1 truncate" title={doc.error_message}>
            {doc.error_message}
          </p>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex items-center gap-1 shrink-0">
        {(doc.status === 'failed' || doc.status === 'timeout') && (
          <Button variant="ghost" size="sm" onClick={() => onReprocess(doc.id)}>
            재시도
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => onDelete(doc.id)}
          className="text-red-400 hover:text-red-600 hover:bg-red-50">
          삭제
        </Button>
      </div>
    </div>
  )
}
