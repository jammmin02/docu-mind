import { API_BASE } from '../utils/constants'
import api from './client'

export const reportsApi = {
  /** 보고서 목록 */
  list() {
    return api.get('/reports')
  },

  /** 보고서 상세 */
  get(id) {
    return api.get(`/reports/${id}`)
  },

  /**
   * 보고서 생성 — SSE 스트리밍
   */
  create({ documentId, reportType }) {
    return fetch(`${API_BASE}/reports`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ document_id: documentId, report_type: reportType }),
    })
  },

  /** 보고서 다운로드 URL */
  downloadUrl(id, format = 'pdf') {
    return `${API_BASE}/reports/${id}/download?format=${format}`
  },
}
