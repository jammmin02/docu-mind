import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { chatApi } from '../api/chat'
import useChatStore from '../store/chatStore'
import { useSSE } from './useSSE'

export function useChat() {
  const {
    sessions, currentSession, messages, isStreaming, streamingText, selectedCategoryId,
    setSessions, addSession, updateSession, removeSession,
    setCurrentSession, setMessages, addMessage,
    setStreaming, appendStreamingText, commitStreamingText, resetStreaming,
    setSelectedCategoryId,
  } = useChatStore()

  const navigate = useNavigate()

  // 세션 목록 로드
  useEffect(() => {
    chatApi.listSessions().then(setSessions).catch(console.error)
  }, [setSessions])

  // 세션 변경 시 메시지 로드
  useEffect(() => {
    if (!currentSession) { setMessages([]); return }
    chatApi.getSession(currentSession).then(setMessages).catch(console.error)
  }, [currentSession, setMessages])

  const { start: startSSE, abort: abortSSE } = useSSE({
    onToken: (chunk) => appendStreamingText(chunk),
    onDone:  (payload) => commitStreamingText(payload.sources ?? []),
    onError: (err) => { console.error('SSE error', err); resetStreaming() },
  })

  const sendMessage = useCallback(async (query) => {
    if (!query.trim() || isStreaming) return

    // 세션 없으면 새로 생성
    let sessionId = currentSession
    if (!sessionId) {
      sessionId = `sess_${Date.now()}`
      const newSession = { session_id: sessionId, title: query.slice(0, 20), updated_at: new Date().toISOString() }
      addSession(newSession)
      setCurrentSession(sessionId)
    }

    addMessage({ role: 'user', content: query, created_at: new Date().toISOString() })
    setStreaming(true)

    await startSSE(() =>
      chatApi.sendMessage({ sessionId, query, categoryId: selectedCategoryId })
    )
  }, [currentSession, isStreaming, selectedCategoryId, addSession, setCurrentSession, addMessage, setStreaming, startSSE])

  const newSession = useCallback(() => {
    setCurrentSession(null)
    setMessages([])
  }, [setCurrentSession, setMessages])

  const deleteSession = useCallback(async (sessionId) => {
    await chatApi.deleteSession(sessionId)
    removeSession(sessionId)
  }, [removeSession])

  /** 현재 채팅 세션을 기반으로 보고서 작성 페이지로 이동 */
  const goToReport = useCallback(() => {
    const params = new URLSearchParams()
    if (currentSession) params.set('from_session', currentSession)
    navigate(`/reports?${params.toString()}`)
  }, [currentSession, navigate])

  return {
    sessions, currentSession, messages, isStreaming, streamingText, selectedCategoryId,
    setCurrentSession, setSelectedCategoryId,
    sendMessage, newSession, deleteSession, abortSSE,
    goToReport,
  }
}
