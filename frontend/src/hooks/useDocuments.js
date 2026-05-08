import { useState, useEffect, useCallback, useRef } from 'react'
import { documentsApi } from '../api/documents'
import useDocumentStore from '../store/documentStore'
import { DOCUMENT_STATUS, POLL_INTERVALS, MAX_FILE_SIZE_MB } from '../utils/constants'

/**
 * 문서 목록 + 업로드 + 폴링 훅
 *
 * 폴링 전략:
 *   - setTimeout 기반 (setInterval은 이전 tick이 끝나기 전에 다음이 실행될 수 있어 부적합)
 *   - elapsed를 Date.now() 기준으로 측정 (이전 코드는 interval 누적이라 부정확했음)
 *   - 0~15초: 2초마다, 15~60초: 5초마다, 60초~: 10초마다 (적응형)
 *   - TIMEOUT_MS(5분) 초과 → status='timeout'으로 변경
 *   - 연속 3회 네트워크 오류 → status='failed'로 변경
 *   - 언마운트 시 모든 타이머 정리
 */
export function useDocuments(categoryId = null) {
  const {
    documents, isUploading, uploadProgress,
    setDocuments, addDocument, updateDocument, removeDocument,
    setUploading, setUploadProgress, clearUploadProgress,
  } = useDocumentStore()

  const [loadError, setLoadError] = useState(null)

  // { [docId]: { timer: TimeoutId | null, startTime: number, errorCount: number } }
  const pollState = useRef({})

  // ── 최초 목록 로드 (categoryId 변경 시 재로드) ──────────────────────────────
  useEffect(() => {
    setLoadError(null)
    documentsApi.list(categoryId)
      .then(setDocuments)
      .catch((e) => setLoadError(e.message ?? '문서 목록을 불러오지 못했습니다'))
  }, [setDocuments, categoryId])

  // ── 언마운트 시 모든 타이머 정리 ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      Object.values(pollState.current).forEach(({ timer }) => {
        if (timer != null) clearTimeout(timer)
      })
      pollState.current = {}
    }
  }, [])

  // ── 폴링 중단 ──────────────────────────────────────────────────────────────
  const stopPolling = useCallback((docId) => {
    const state = pollState.current[docId]
    if (state) {
      if (state.timer != null) clearTimeout(state.timer)
      delete pollState.current[docId]
    }
  }, [])

  // ── 폴링 시작 ──────────────────────────────────────────────────────────────
  const startPolling = useCallback((docId) => {
    if (pollState.current[docId]) return  // 이미 폴링 중

    pollState.current[docId] = {
      timer:      null,
      startTime:  Date.now(),
      errorCount: 0,
    }

    const tick = async () => {
      const state = pollState.current[docId]
      if (!state) return  // 언마운트 또는 수동 중단

      const elapsed = Date.now() - state.startTime

      // 전체 타임아웃 — 서버가 status='timeout'으로 바꿔줬을 수도 있지만
      // 백엔드가 못 바꾼 경우를 대비해 프론트에서도 로컬로 표시
      if (elapsed >= POLL_INTERVALS.TIMEOUT_MS) {
        stopPolling(docId)
        updateDocument(docId, {
          status: 'timeout',
          error_message: `처리 시간이 ${POLL_INTERVALS.TIMEOUT_MS / 60000}분을 초과했습니다. 재시도해 주세요.`,
        })
        return
      }

      try {
        const updated = await documentsApi.get(docId)
        state.errorCount = 0  // 성공하면 연속 에러 카운트 초기화

        updateDocument(docId, updated)

        if (updated.status !== DOCUMENT_STATUS.PROCESSING) {
          stopPolling(docId)  // 완료/실패/타임아웃 — 폴링 종료
          return
        }

        // 다음 폴링 예약 (적응형 간격)
        state.timer = setTimeout(tick, getInterval(elapsed))

      } catch (err) {
        const s = pollState.current[docId]
        if (!s) return
        s.errorCount++

        // 연속 3회 네트워크 오류 → 폴링 중단, 에러 표시
        if (s.errorCount >= 3) {
          stopPolling(docId)
          updateDocument(docId, {
            status: 'failed',
            error_message: '서버와 연결할 수 없습니다. 페이지를 새로고침해 주세요.',
          })
          return
        }

        // 일시적 오류 → 간격을 좀 더 길게 잡고 재시도
        s.timer = setTimeout(tick, POLL_INTERVALS.SLOW)
      }
    }

    // 첫 폴링은 바로 시작하지 않고 FAST 간격 후 시작 (업로드 직후 너무 빠른 요청 방지)
    pollState.current[docId].timer = setTimeout(tick, POLL_INTERVALS.FAST)
  }, [updateDocument, stopPolling])

  // ── processing 문서는 자동으로 폴링 시작 ────────────────────────────────────
  useEffect(() => {
    documents.forEach((doc) => {
      if (doc.status === DOCUMENT_STATUS.PROCESSING && !pollState.current[doc.id]) {
        startPolling(doc.id)
      }
    })
  }, [documents, startPolling])

  // ── 업로드 ─────────────────────────────────────────────────────────────────
  const upload = useCallback(async (file, uploadCategoryId) => {
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new Error(`파일 크기는 ${MAX_FILE_SIZE_MB}MB 이하여야 합니다.`)
    }

    const tempId = `temp_${Date.now()}`
    setUploading(true)
    setUploadProgress(tempId, 0)

    try {
      const doc = await documentsApi.upload(file, (pct) => setUploadProgress(tempId, pct), uploadCategoryId)
      addDocument(doc)
      if (doc.status === DOCUMENT_STATUS.PROCESSING) startPolling(doc.id)
      return doc
    } finally {
      setUploading(false)
      clearUploadProgress(tempId)
    }
  }, [setUploading, setUploadProgress, addDocument, clearUploadProgress, startPolling])

  // ── 삭제 ──────────────────────────────────────────────────────────────────
  const deleteDocument = useCallback(async (id) => {
    await documentsApi.delete(id)
    stopPolling(id)
    removeDocument(id)
  }, [removeDocument, stopPolling])

  // ── 재처리 ────────────────────────────────────────────────────────────────
  const reprocess = useCallback(async (id) => {
    await documentsApi.reprocess(id)
    updateDocument(id, { status: DOCUMENT_STATUS.PROCESSING, error_message: null })
    startPolling(id)
  }, [updateDocument, startPolling])

  return { documents, isUploading, uploadProgress, loadError, upload, deleteDocument, reprocess }
}

/** 경과 시간(ms)에 따른 적응형 폴링 간격 */
function getInterval(elapsedMs) {
  if (elapsedMs < 15_000) return POLL_INTERVALS.FAST    // 0~15초: 2초마다
  if (elapsedMs < 60_000) return POLL_INTERVALS.MEDIUM  // 15~60초: 5초마다
  return POLL_INTERVALS.SLOW                             // 60초~: 10초마다
}
