import { Layout } from '../components/layout/Layout'
import { ReportForm } from '../components/reports/ReportForm'
import { ReportViewer } from '../components/reports/ReportViewer'
import { useReports } from '../hooks/useReports'
import useDocumentStore from '../store/documentStore'

export default function ReportsPage() {
  const documents = useDocumentStore((s) => s.documents)
  const { currentReport, isGenerating, streamingText, generateReport, downloadReport } = useReports()

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
          onDownload={downloadReport}
        />
      </div>
    </Layout>
  )
}
