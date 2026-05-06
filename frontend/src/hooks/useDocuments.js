import { useEffect, useCallback, useRef } from 'react'
import { documentsApi } from '../api/documents'
import useDocumentStore from '../store/documentStore'
import { DOCUMENT_STATUS, POLL_INTERVALS, MAX_FILE_SIZE_MB } from '../utils/constants'

export function useDocuments() {
  const {
    documents, isUploading, uploadProgress,
    setDocuments, addDocument, updateDocument, removeDocument,
    setUploading, setUploadProgress, clearUploadProgress,
  } = useDocumentStore()

  const pollTimers = useRef({})

  // 최초 로드
  useEffect(() => {
    documentsApi.list().then(setDocuments).catch(console.error)
  }, [setDocuments])

  // 처리 중인 문서 폴링
  useEffect(() => {
    documents.forEach((doc) => {
      if (doc.status === DOCUMENT_STATUS.PROCESSING && !pollTimers.current[doc.id]) {
        startPolling(doc.id)
      }
    })
  }, [documents])

  const startPolling = useCallback((docId) => {
    let elapsed = 0

    const tick = async () => {
      try {
        const updated = await documentsApi.get(docId)
        updateDocument(docId, updated)

        if (updated.status !== DOCUMENT_STATUS.PROCESSING) {
          clearInterval(pollTimers.current[docId])
          delete pollTimers.current[docId]
          return
        }

        elapsed += getInterval(elapsed) / 1000
        if (elapsed >= POLL_INTERVALS.TIMEOUT_MS / 1000) {
          clearInterval(pollTimers.current[docId])
          delete pollTimers.current[docId]
          updateDocument(docId, { status: 'timeout' })
        }
      } catch (e) {
        console.error('poll error', e)
      }
    }

    pollTimers.current[docId] = setInterval(tick, getInterval(0))
  }, [updateDocument])

  const upload = useCallback(async (file) => {
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new Error(`파일 크기는 ${MAX_FILE_SIZE_MB}MB 이하여야 합니다.`)
    }

    const tempId = `temp_${Date.now()}`
    setUploading(true)
    setUploadProgress(tempId, 0)

    try {
      const doc = await documentsApi.upload(file, (pct) => setUploadProgress(tempId, pct))
      addDocument(doc)
      if (doc.status === DOCUMENT_STATUS.PROCESSING) startPolling(doc.id)
      return doc
    } finally {
      setUploading(false)
      clearUploadProgress(tempId)
    }
  }, [setUploading, setUploadProgress, addDocument, clearUploadProgress, startPolling])

  const deleteDocument = useCallback(async (id) => {
    await documentsApi.delete(id)
    clearInterval(pollTimers.current[id])
    delete pollTimers.current[id]
    removeDocument(id)
  }, [removeDocument])

  const reprocess = useCallback(async (id) => {
    await documentsApi.reprocess(id)
    updateDocument(id, { status: DOCUMENT_STATUS.PROCESSING, error_message: null })
    startPolling(id)
  }, [updateDocument, startPolling])

  return { documents, isUploading, uploadProgress, upload, deleteDocument, reprocess }
}

function getInterval(elapsed) {
  if (elapsed < 10) return POLL_INTERVALS.FAST
  if (elapsed < 30) return POLL_INTERVALS.MEDIUM
  return POLL_INTERVALS.SLOW
}
