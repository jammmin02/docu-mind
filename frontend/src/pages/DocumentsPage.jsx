import { useState, useCallback } from 'react'
import { Layout } from '../components/layout/Layout'
import { CategoryPanel } from '../components/documents/CategoryPanel'
import { FileUploader } from '../components/documents/FileUploader'
import { DocumentList } from '../components/documents/DocumentList'
import { useDocuments } from '../hooks/useDocuments'
import { useCategories } from '../hooks/useCategories'
import { documentsApi } from '../api/documents'
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
 *  - dataset/ 폴더 일괄 import
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
    refresh: refreshCategories,
  } = useCategories()

  // 전체 문서 목록 (documentStore에서 로드)
  // 카테고리 필터링은 메모리에서 수행하여 store가 항상 전체 목록을 유지하도록 함
  const {
    documents: allDocuments,
    isUploading,
    uploadProgress,
    loadError,
    upload,
    deleteDocument,
    reprocess,
    refreshDocuments,
  } = useDocuments()

  // 선택된 카테고리로 메모리 필터링
  const documents = selectedCategoryId === null
    ? allDocuments
    : allDocuments.filter((d) => d.category_id === selectedCategoryId)

  // 에러/알림 배너
  const [banners, setBanners] = useState([])   // { id, type: 'error'|'success'|'info', message }

  const addBanner = useCallback((type, message) => {
    const id = Date.now()
    setBanners((prev) => [...prev, { id, type, message }])
    setTimeout(() => setBanners((prev) => prev.filter((b) => b.id !== id)), 6000)
  }, [])

  const dismissBanner = useCallback((id) => {
    setBanners((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const handleUpload = async (file) => {
    try {
      await upload(file, selectedCategoryId)
    } catch (e) {
      addBanner('error', e.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteDocument(id)
    } catch (e) {
      addBanner('error', `삭제 중 오류가 발생했습니다: ${e.message}`)
    }
  }

  // ── 데이터셋 일괄 import ─────────────────────────────────────────────────
  const [isImporting, setIsImporting] = useState(false)

  const handleImportDataset = async () => {
    if (isImporting) return
    setIsImporting(true)
    try {
      const result = await documentsApi.importDataset()
      const { queued, skipped, errors } = result
      if (errors.length > 0) {
        addBanner('error', `Import 완료 (${queued.length}개 처리 중, ${skipped.length}개 스킵, ${errors.length}개 오류)`)
      } else if (queued.length === 0) {
        addBanner('info', `모든 파일이 이미 등록되어 있습니다 (${skipped.length}개 스킵)`)
      } else {
        addBanner('success', `Import 시작: ${queued.length}개 파일 처리 중, ${skipped.length}개 스킵`)
      }
      // 카테고리 목록 + 문서 목록 갱신 (새 카테고리/문서가 생성됐을 수 있음)
      refreshCategories()
      refreshDocuments()
    } catch (e) {
      addBanner('error', `Import 실패: ${e.message}`)
    } finally {
      setIsImporting(false)
    }
  }

  const processingCount = documents.filter(
    (d) => d.status === DOCUMENT_STATUS.PROCESSING,
  ).length

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? null

  const bannerStyles = {
    error:   'bg-red-50 border-red-200 text-red-700',
    success: 'bg-green-50 border-green-200 text-green-700',
    info:    'bg-blue-50 border-blue-200 text-blue-700',
  }
  const bannerIcons = { error: '⚠️', success: '✅', info: 'ℹ️' }

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
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
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

            {/* 데이터셋 일괄 import 버튼 */}
            <button
              onClick={handleImportDataset}
              disabled={isImporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              title="dataset/ 폴더의 파일을 일괄 등록합니다"
            >
              {isImporting ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                  가져오는 중...
                </>
              ) : (
                <>
                  <span>📥</span>
                  데이터셋 가져오기
                </>
              )}
            </button>
          </div>

          {/* 업로드 영역 */}
          <FileUploader
            onUpload={handleUpload}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            categoryName={selectedCategory?.name}
          />

          {/* 배너 (에러 / 성공 / 정보) */}
          {banners.length > 0 && (
            <div className="space-y-2">
              {banners.map(({ id, type, message }) => (
                <div
                  key={id}
                  className={`flex items-start justify-between gap-3 border text-sm px-4 py-3 rounded-lg ${bannerStyles[type]}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">{bannerIcons[type]}</span>
                    <span>{message}</span>
                  </div>
                  <button
                    onClick={() => dismissBanner(id)}
                    className="shrink-0 opacity-60 hover:opacity-100 font-bold leading-none mt-0.5"
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
            onDelete={handleDelete}
            onReprocess={reprocess}
          />
        </div>
      </div>
    </Layout>
  )
}
