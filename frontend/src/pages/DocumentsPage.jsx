import { useState, useCallback } from 'react'
import { Layout } from '../components/layout/Layout'
import { FileUploader } from '../components/documents/FileUploader'
import { DocumentList } from '../components/documents/DocumentList'
import { useDocuments } from '../hooks/useDocuments'
import { DOCUMENT_STATUS } from '../utils/constants'

/**
 * 문서 관리 페이지 (관리자 전용)
 *
 * 에러 알림:
 *  - 업로드 실패 등 즉각적인 에러를 알림 배너로 표시
 *  - 5초 후 자동 소멸, X 버튼으로 수동 닫기 가능
 *  - 동시 다발적 에러 모두 표시 (배열 관리)
 */
export default function DocumentsPage() {
  const {
    documents,
    isUploading,
    uploadProgress,
    upload,
    deleteDocument,
    reprocess,
  } = useDocuments()

  // errors: [{ id: number, message: string }]
  const [errors, setErrors] = useState([])

  const dismissError = useCallback((id) => {
    setErrors((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const addError = useCallback((message) => {
    const id = Date.now()
    setErrors((prev) => [...prev, { id, message }])
    // 5초 후 자동 소멸
    setTimeout(() => dismissError(id), 5000)
  }, [dismissError])

  const handleUpload = async (file) => {
    try {
      await upload(file)
    } catch (e) {
      addError(e.message)
    }
  }

  const processingCount = documents.filter(
    (d) => d.status === DOCUMENT_STATUS.PROCESSING,
  ).length

  return (
    <Layout>
      <div className="h-full overflow-y-auto scrollbar-thin p-6 space-y-4">

        {/* 업로드 영역 */}
        <FileUploader
          onUpload={handleUpload}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
        />

        {/* 에러 알림 배너 (복수 지원) */}
        {errors.length > 0 && (
          <div className="space-y-2">
            {errors.map(({ id, message }) => (
              <div
                key={id}
                className="flex items-start justify-between gap-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">⚠️</span>
                  <span>{message}</span>
                </div>
                <button
                  onClick={() => dismissError(id)}
                  className="shrink-0 text-red-400 hover:text-red-600 font-bold leading-none mt-0.5"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 문서 목록 헤더 */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            문서 목록
            <span className="text-slate-400 font-normal">{documents.length}개</span>

            {/* 처리 중 문서 수 배지 */}
            {processingCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                {processingCount}개 처리 중
              </span>
            )}
          </h3>
        </div>

        {/* 문서 카드 목록 */}
        <DocumentList
          documents={documents}
          onDelete={deleteDocument}
          onReprocess={reprocess}
        />
      </div>
    </Layout>
  )
}
