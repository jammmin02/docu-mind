import { useRef, useState } from 'react'
import clsx from 'clsx'
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE_MB } from '../../utils/constants'

/**
 * 파일 업로드 영역
 * @param {Function} onUpload      - 파일 선택 시 호출
 * @param {boolean}  isUploading   - 업로드 진행 중 여부
 * @param {Object}   uploadProgress - { [tempId]: 0~100 }
 */
export function FileUploader({ onUpload, isUploading, uploadProgress = {}, categoryName }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = (files) => {
    Array.from(files).forEach((f) => onUpload(f))
  }

  // 여러 파일이 동시에 업로드 중일 때 평균 진행률 계산
  const progressEntries = Object.entries(uploadProgress)
  const avgProgress = progressEntries.length > 0
    ? Math.round(progressEntries.reduce((sum, [, v]) => sum + v, 0) / progressEntries.length)
    : null

  return (
    <div className="space-y-2">

      {/* 드래그 앤 드롭 영역 */}
      <div
        onClick={() => !isUploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!isUploading) handleFiles(e.dataTransfer.files)
        }}
        className={clsx(
          'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
          dragging
            ? 'border-primary-400 bg-primary-50'
            : 'border-slate-200 hover:border-primary-300 hover:bg-slate-50',
          isUploading
            ? 'opacity-60 cursor-not-allowed'
            : 'cursor-pointer',
        )}
      >
        <div className="text-3xl mb-2">
          {isUploading ? '⏳' : '📁'}
        </div>
        <p className="text-sm font-medium text-slate-700">
          {isUploading
            ? '서버로 업로드하는 중...'
            : '파일을 드래그하거나 클릭하여 업로드'}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {ACCEPTED_FILE_TYPES.join(', ')} · 최대 {MAX_FILE_SIZE_MB}MB
        </p>
        {!isUploading && categoryName && (
          <p className="text-xs text-primary-500 mt-1.5 font-medium">
            📁 {categoryName} 카테고리에 업로드됩니다
          </p>
        )}
        {!isUploading && !categoryName && (
          <p className="text-xs text-slate-400 mt-1.5">
            카테고리를 선택하면 해당 카테고리로 분류됩니다
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={ACCEPTED_FILE_TYPES.join(',')}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* 업로드 진행 바 — 업로드 중일 때만 표시 */}
      {isUploading && avgProgress !== null && (
        <div className="space-y-1 px-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>업로드 중 ({progressEntries.length}개 파일)</span>
            <span>{avgProgress}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary-500 h-1.5 rounded-full transition-all duration-200"
              style={{ width: `${avgProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
