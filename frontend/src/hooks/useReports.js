import { useState, useEffect, useCallback, useRef } from 'react'
import { reportsApi } from '../api/reports'
import useReportStore from '../store/reportStore'
import { useSSE } from './useSSE'

export function useReports() {
  const {
    reports, currentReport, isGenerating, streamingText,
    setReports, addReport, updateReport, setCurrentReport,
    setGenerating, appendStreamingText, commitStreamingText, resetStreaming,
  } = useReportStore()

  const [loadError,   setLoadError]   = useState(null)
  const [streamError, setStreamError] = useState(null)

  // [Fix 4] 언마운트 시 interval 정리를 위한 ref
  const pollTimerRef = useRef(null)
  useEffect(() => {
    return () => {
      if (pollTimerRef.current != null) clearInterval(pollTimerRef.current)
    }
  }, [])

  useEffect(() => {
    setLoadError(null)
    reportsApi.list()
      .then(setReports)
      .catch((e) => setLoadError(e.message ?? '보고서 목록을 불러오지 못했습니다'))
  }, [setReports])

  const { start: startSSE } = useSSE({
    onToken: (chunk) => appendStreamingText(chunk),
    onDone:  (payload) => {
      commitStreamingText(payload.report_id)
      pollFilePath(payload.report_id)
    },
    onError: (err) => {
      setStreamError(err?.message ?? '보고서 생성 중 오류가 발생했습니다')
      resetStreaming()
    },
  })

  const pollFilePath = useCallback((reportId) => {
    // [Fix 4] timer ID를 ref에 저장하여 언마운트 시 clearInterval 가능하게
    const timer = setInterval(async () => {
      try {
        const report = await reportsApi.get(reportId)
        if (report.file_path) {
          updateReport(reportId, report)
          setCurrentReport(report)
          clearInterval(timer)
          pollTimerRef.current = null
        }
      } catch {
        clearInterval(timer)
        pollTimerRef.current = null
      }
    }, 3000)
    pollTimerRef.current = timer
  }, [updateReport, setCurrentReport])

  const generateReport = useCallback(async ({ documentId, reportType, templateId }) => {
    if (isGenerating) return
    setGenerating(true)
    setCurrentReport(null)

    try {
      await startSSE(() => reportsApi.create({ documentId, reportType, templateId }))
    } finally {
      setGenerating(false)
    }
  }, [isGenerating, setGenerating, setCurrentReport, startSSE])

  /** 다운로드 — 성공 시 브라우저 저장 다이얼로그, 실패 시 Error throw */
  const downloadReport = useCallback(async (id, format = 'pdf') => {
    await reportsApi.download(id, format)
  }, [])

  return {
    reports, currentReport, isGenerating, streamingText,
    loadError, streamError,
    generateReport, downloadReport,
  }
}
