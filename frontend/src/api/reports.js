import { API_BASE } from '../utils/constants'
import api from './client'

export const reportsApi = {
  list() {
    return api.get('/reports')
  },

  get(id) {
    return api.get(`/reports/${id}`)
  },

  create({ documentId, reportType, templateId }) {
    const body = { document_ids: [documentId] }
    if (templateId) body.template_id = templateId
    if (reportType) body.report_type = reportType
    return fetch(`${API_BASE}/reports`, {
      method:      'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept':        'text/event-stream',
      },
      body: JSON.stringify(body),
    })
  },

  async download(id, format = 'pdf') {
    const res = await fetch(`${API_BASE}/reports/${id}/download?format=${format}`, {
      credentials: 'include',
    })

    if (!res.ok) {
      let message = `다운로드 실패 (HTTP ${res.status})`
      try {
        const json = await res.json()
        message = json?.detail?.error?.message ?? json?.detail ?? message
      } catch (_) {}
      throw new Error(message)
    }

    const disposition = res.headers.get('Content-Disposition') ?? ''
    const nameMatch   = disposition.match(/filename="?([^"]+)"?/)
    const filename    = nameMatch?.[1] ?? `report_${id}.${format}`

    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },
}
