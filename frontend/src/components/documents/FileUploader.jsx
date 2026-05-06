import { useRef, useState } from 'react'
import clsx from 'clsx'
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE_MB } from '../../utils/constants'

export function FileUploader({ onUpload, isUploading }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = (files) => {
    Array.from(files).forEach((f) => onUpload(f))
  }

  return (
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
        'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
        dragging
          ? 'border-primary-400 bg-primary-50'
          : 'border-slate-200 hover:border-primary-300 hover:bg-slate-50',
        isUploading && 'opacity-50 cursor-not-allowed',
      )}
    >
      <div className="text-3xl mb-2">📁</div>
      <p className="text-sm font-medium text-slate-700">
        파일을 드래그하거나 클릭하여 업로드
      </p>
      <p className="text-xs text-slate-400 mt-1">
        {ACCEPTED_FILE_TYPES.join(', ')} · 최대 {MAX_FILE_SIZE_MB}MB
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept={ACCEPTED_FILE_TYPES.join(',')}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}
