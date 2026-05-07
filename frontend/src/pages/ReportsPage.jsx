import { useState, useCallback } from 'react'
import { Layout } from '../components/layout/Layout'
import { ReportForm } from '../components/reports/ReportForm'
import { ReportViewer } from '../components/reports/ReportViewer'
import { Modal } from '../components/ui/Modal'
import { useReports } from '../hooks/useReports'
import useDocumentStore from '../store/documentStore'

export default function ReportsPage() {
  const documents = useDocumentStore((s) => s.documents)
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
