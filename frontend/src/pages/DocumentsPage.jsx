import { useState, useCallback } from 'react'
import { Layout } from '../components/layout/Layout'
import { CategoryPanel } from '../components/documents/CategoryPanel'
import { FileUploader } from '../components/documents/FileUploader'
import { DocumentList } from '../components/documents/DocumentList'
import { useDocuments } from '../hooks/useDocuments'
import { useCategories } from '../hooks/useCategories'
import { DOCUMENT_STATUS } from '../utils/constants'

/**
 * 어드민 문서 관리 페이지
 *
 * 레이아웃:
 *  [CategoryPanel (좌측)] | [문서 업로드 + 목록 (우측)]
 *
 * 기능:
 *  - 카테고리 CRUD
 *  - 카테고리별 문서 필터링
 *  - 카테고리 지정하여 문서 업로드
 */
export default function DocumentsPage() {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)

  // 카테고리 관리
  const {
    categories,
    loading: categoriesLoading,
    createCategory,
    updateCategory,
    deleteCategory,
  } = useCategories()

  // 문서 목록 (선택된 카테고리 기준 필터)
  const {
    documents,
    isUploading,
    uploadProgress,
    upload,
    deleteDocument,
    reprocess,
  } = useDocuments(selectedCategoryId)

  // 에러 배너
  const [errors, setErrors] = useState([])

  const dismissError = useCallback((id) => {
    setErrors((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const addError = useCallback((message) => {
    const id = Date.now()
    setErrors((prev) => [...prev, { id, message }])
    setTimeout(() => dismissError(id), 5000)
  }, [dismissError])

  const handleUpload = async (file) => {
    try {
      // 카테고리가 선택된 상태면 해당 카테고리로 업로드
      await upload(file, selectedCategoryId)
    } catch (e) {
      addError(e.message)
    }
  }

  const processingCount = documents.filter(
    (d) => d.status === DOCUMENT_STATUS.PROCESSING,
  ).length

  // 현재 선택된 카테고리 객체
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? null

  return (
    <Layout>
      <div className="flex h-full overflow-hidden">

        {/* ── 좌측: 카테고리 패널 ─────────────────────────────────── */}
        <CategoryPanel
          categories={categories}
          selectedId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
          onCreate={createCategory}
          onUpdate={updateCategory}
          onDelete={deleteCategory}
          loading={categoriesLoading}
        />

        {/* ── 우측: 문서 영역 ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4">

          {/* 영역 헤더 */}
          <div className="flex items-center gap-3">
            {selectedCategory ? (
              <>
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: selectedCategory.color ?? '#6366f1' }}
                />
                <h2 className="text-base font-semibold text-slate-800">{selectedCategory.name}</h2>
                {selectedCategory.description && (
                  <span className="text-xs text-slate-400 hidden sm:block truncate max-w-xs">
                    {selectedCategory.description}
                  </span>
                )}
              </>
            ) : (
              <h2 className="text-base font-semibold text-slate-800">전체 문서</h2>
            )}
          </div>

          {/* 업로드 영역 */}
          <FileUploader
            onUpload={handleUpload}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            categoryName={selectedCategory?.name}
          />

          {/* 에러 배너 */}
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

              {processingCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  {processingCount}개 처리 중
                </span>
              )}
            </h3>

            {/* 카테고리 미지정 안내 */}
            {selectedCategoryId === null && (
              <span className="text-xs text-slate-400 hidden sm:block">
                카테고리를 선택하면 해당 카테고리로 업로드돼요
              </span>
            )}
          </div>

          {/* 문서 카드 목록 */}
          <DocumentList
            documents={documents}
            categories={categories}
            onDelete={deleteDocument}
            onReprocess={reprocess}
          />
        </div>
      </div>
    </Layout>
  )
}
