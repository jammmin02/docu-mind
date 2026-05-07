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

    try {
      await startSSE(() => reportsApi.create({ documentId, reportType }))
    } finally {
      // done/error 이벤트로 이미 false가 됐을 수 있지만, 스트림이 비정상 종료된 경우 보장
      setGenerating(false)
    }
  }, [isGenerating, setGenerating, setCurrentReport, startSSE])

  /** 다운로드 — 성공 시 브라우저 저장 다이얼로그, 실패 시 Error throw */
  const downloadReport = useCallback(async (id, format = 'pdf') => {
    await reportsApi.download(id, format)
  }, [])

  return {
    reports, currentReport, isGenerating, streamingText,
    generateReport, downloadReport,
  }
}
