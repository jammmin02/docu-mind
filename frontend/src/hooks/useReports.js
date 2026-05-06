import { useEffect, useCallback } from 'react'
import { reportsApi } from '../api/reports'
import useReportStore from '../store/reportStore'
import { useSSE } from './useSSE'

export function useReports() {
  const {
    reports, currentReport, isGenerating, streamingText,
    setReports, addReport, updateReport, setCurrentReport,
    setGenerating, appendStreamingText, commitStreamingText, resetStreaming,
  } = useReportStore()

  useEffect(() => {
    reportsApi.list().then(setReports).catch(console.error)
  }, [setReports])

  const { start: startSSE } = useSSE({
    onToken: (chunk) => appendStreamingText(chunk),
    onDone:  (payload) => {
      commitStreamingText(payload.report_id)
      // 파일 변환 완료 폴링
      pollFilePath(payload.report_id)
    },
    onError: (err) => { console.error('Report SSE error', err); resetStreaming() },
  })

  const pollFilePath = useCallback((reportId) => {
    const timer = setInterval(async () => {
      try {
        const report = await reportsApi.get(reportId)
        if (report.file_path) {
          updateReport(reportId, report)
          setCurrentReport(report)
          clearInterval(timer)
        }
      } catch {
        clearInterval(timer)
      }
    }, 3000)
  }, [updateReport, setCurrentReport])

  const generateReport = useCallback(async ({ documentId, reportType }) => {
    if (isGenerating) return
    setGenerating(true)
    setCurrentReport(null)

    await startSSE(() => reportsApi.create({ documentId, reportType }))
  }, [isGenerating, setGenerating, setCurrentReport, startSSE])

  const downloadReport = useCallback((id, format = 'pdf') => {
    window.open(reportsApi.downloadUrl(id, format), '_blank')
  }, [])

  return {
    reports, currentReport, isGenerating, streamingText,
    generateReport, downloadReport,
  }
}
