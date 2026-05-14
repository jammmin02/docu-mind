import { useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Layout } from '../components/layout/Layout'
import { ReportForm } from '../components/reports/ReportForm'
import { ReportViewer } from '../components/reports/ReportViewer'
import { Modal } from '../components/ui/Modal'
import { useReports } from '../hooks/useReports'
import { useDocuments } from '../hooks/useDocuments'

export default function ReportsPage() {
  const [searchParams] = useSearchParams()
  const fromSession = searchParams.get('from_session')

  // [Fix 1] useDocumentStore 직접 구독 → useDocuments 호출로 변경
  // DocumentsPage를 방문하지 않아도 문서가 로드되도록 보장
  const { documents } = useDocuments()
  const { currentReport, isGenerating, streamingText, generateReport, downloadReport } = useReports()

  // 에러 모달
  const [errorModal, setErrorModal] = useState({ open: false, message: '' })
  const closeError = useCallback(() => setErrorModal({ open: false, message: '' }), [])

  const handleDownload = useCallback(async (id, format) => {
    try {
      await downloadReport(id, format)
    } catch (e) {
      setErrorModal({ open: true, message: e.message })
    }
  }, [downloadReport])

  return (
    <Layout>
      {/* 채팅에서 넘어온 경우 안내 배너 */}
      {fromSession && (
        <div className="bg-indigo-50 border-b border-indigo-200 px-6 py-2.5 flex items-center gap-2 text-sm text-indigo-700">
          <span>💬</span>
          <span>채팅 세션 기반으로 보고서를 작성합니다. 문서와 템플릿을 선택 후 생성하세요.</span>
          <Link
            to={`/chat`}
            className="ml-auto text-xs text-indigo-500 hover:text-indigo-700 underline shrink-0"
          >
            ← 채팅으로 돌아가기
          </Link>
        </div>
      )}

      <div className="h-full overflow-hidden flex gap-5 p-6">
        {/* 좌측: 폼 */}
        <div className="w-72 shrink-0">
          <ReportForm
            documents={documents}
            onGenerate={generateReport}
            isGenerating={isGenerating}
          />
        </div>

        {/* 우측: 뷰어 */}
        <ReportViewer
          report={currentReport}
          streamingText={streamingText}
          isGenerating={isGenerating}
          onDownload={handleDownload}
        />
      </div>

      {/* 다운로드 에러 모달 */}
      <Modal
        isOpen={errorModal.open}
        onClose={closeError}
        title="다운로드 실패"
        variant="error"
      >
        <p>{errorModal.message}</p>
        <p className="mt-3 text-xs text-slate-400">
          문제가 지속되면 관리자에게 문의하거나 다른 형식으로 다운로드해 보세요.
        </p>
      </Modal>
    </Layout>
  )
}
