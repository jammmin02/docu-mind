import { useState } from 'react'
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
  pdf:  'bg-red-100 text-red-600',
  docx: 'bg-blue-100 text-blue-600',
  xlsx: 'bg-green-100 text-green-600',
  pptx: 'bg-orange-100 text-orange-600',
  csv:  'bg-teal-100 text-teal-600',
  txt:  'bg-slate-100 text-slate-600',
}

/** 에러/타임아웃 상태에서만 메시지 표시 */
const SHOW_ERROR_STATUS = new Set(['failed', 'timeout'])

export function DocumentCard({ doc, onDelete, onReprocess, categories = [] }) {
  const ext = fileExtension(doc.filename)
  const [errorExpanded, setErrorExpanded] = useState(false)
  const category = categories.find((c) => c.id === doc.category_id) ?? null

  const isProcessing = doc.status === 'processing'
  const hasError     = SHOW_ERROR_STATUS.has(doc.status) && doc.error_message
  const isLongError  = hasError && doc.error_message.length > 80

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3 hover:shadow-sm transition-shadow">

      {/* 파일 확장자 아이콘 */}
      <div className={`
        w-10 h-10 rounded-lg flex items-center justify-center
        text-xs font-bold uppercase shrink-0
        ${EXT_COLOR[ext] ?? 'bg-slate-100 text-slate-600'}
      `}>
        {ext}
      </div>

      {/* 메인 정보 */}
      <div className="flex-1 min-w-0">

        {/* 파일명 */}
        <p className="text-sm font-medium text-slate-800 truncate" title={doc.filename}>
          {doc.filename}
        </p>

        {/* 상태 배지 + 메타 */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant={STATUS_VARIANT[doc.status] ?? 'default'}>
            {STATUS_LABEL[doc.status] ?? doc.status}
          </Badge>

          {doc.chunk_count != null && doc.status === 'ready' && (
            <span className="text-xs text-slate-400">{doc.chunk_count}개 청크</span>
          )}
          {doc.file_size != null && (
            <span className="text-xs text-slate-400">{formatFileSize(doc.file_size)}</span>
          )}
          <span className="text-xs text-slate-400">{formatRelativeTime(doc.uploaded_at)}</span>
          {category && (
            <span
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${category.color}18`, color: category.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: category.color }} />
              {category.name}
            </span>
          )}
        </div>

        {/* 처리 중 안내 */}
        {isProcessing && (
          <p className="text-xs text-blue-400 mt-1.5">
            텍스트 추출 및 AI 임베딩 처리 중입니다. 잠시 기다려 주세요...
          </p>
        )}

        {/* 에러 메시지 (펼치기/접기) */}
        {hasError && (
          <div className="mt-2">
            <p className={`text-xs text-red-500 leading-relaxed ${errorExpanded ? '' : 'line-clamp-2'}`}>
              {doc.error_message}
            </p>
            {isLongError && (
              <button
                onClick={() => setErrorExpanded((v) => !v)}
                className="text-xs text-red-400 hover:text-red-600 mt-0.5 underline-offset-2 underline"
              >
                {errorExpanded ? '접기' : '더 보기'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex items-center gap-1 shrink-0">

        {/* 재시도: failed / timeout 상태에서만 */}
        {(doc.status === 'failed' || doc.status === 'timeout') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReprocess(doc.id)}
          >
            재시도
          </Button>
        )}

        {/* 삭제: 처리 중엔 비활성 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(doc.id)}
          disabled={isProcessing}
          title={isProcessing ? '처리가 완료된 후 삭제할 수 있습니다' : '삭제'}
          className={
            isProcessing
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-red-400 hover:text-red-600 hover:bg-red-50'
          }
        >
          삭제
        </Button>
      </div>
    </div>
  )
}
