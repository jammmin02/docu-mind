import api from './client'

export const adminApi = {
  // ── 청크 ──────────────────────────────────────────────────────────────────
  getChunks: (docId, params = {}) => {
    const qs = new URLSearchParams()
    if (params.page)    qs.set('page',    params.page)
    if (params.size)    qs.set('size',    params.size)
    if (params.sort)    qs.set('sort',    params.sort)
    if (params.section) qs.set('section', params.section)
    const query = qs.toString() ? `?${qs}` : ''
    return api.get(`/admin/documents/${docId}/chunks${query}`)
  },
  getChunk: (chunkId) => api.get(`/admin/chunks/${chunkId}`),

  // ── 검색 디버그 ────────────────────────────────────────────────────────────
  debugSearch: (body) => api.post('/admin/debug/search', body),
}
