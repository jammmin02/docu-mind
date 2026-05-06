import { API_BASE } from '../utils/constants'
import api from './client'

export const chatApi = {
  /** 세션 목록 */
  listSessions() {
    return api.get('/chat/sessions')
  },

  /** 세션 메시지 전체 */
  getSession(sessionId, limit = 50, offset = 0) {
    return api.get(`/chat/sessions/${sessionId}?limit=${limit}&offset=${offset}`)
  },

  /** 세션 삭제 */
  deleteSession(sessionId) {
    return api.delete(`/chat/sessions/${sessionId}`)
  },

  /**
   * 질문 전송 — SSE 스트리밍
   * @returns EventSource
   */
  sendMessage({ sessionId, query, documentIds = [] }) {
    const url = new URL(`${API_BASE}/chat`)
    const body = JSON.stringify({ session_id: sessionId, query, document_ids: documentIds })

    // SSE는 fetch + ReadableStream으로 처리 (POST body 필요)
    return fetch(url.toString(), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body,
    })
  },
}
