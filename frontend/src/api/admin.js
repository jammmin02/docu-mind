import api from './client'

export const adminApi = {
  // -- 청크 --
  getChunks: (docId, params = {}) => {
    const qs = new URLSearchParams()
    if (params.page)    qs.set('page',    params.page)
    if (params.size)    qs.set('size',    params.size)
    if (params.sort)    qs.set('sort',    params.sort)
    if (params.section) qs.set('section', params.section)
    const query = qs.toString() ? '?' + qs : ''
    return api.get('/admin/documents/' + docId + '/chunks' + query)
  },
  getChunk: (chunkId) => api.get('/admin/chunks/' + chunkId),

  // -- 세분화 재처리 --
  reparse: (docId)       => api.post('/documents/' + docId + '/reparse',  {}),
  rechunk: (docId, body) => api.post('/documents/' + docId + '/rechunk',  body ?? {}),
  reembed: (docId)       => api.post('/documents/' + docId + '/reembed',  {}),

  // -- parsed_pages 뷰어 --
  getParsedPages: (docId) => api.get('/documents/' + docId + '/parsed_pages'),

  // -- 검색 디버그 --
  debugSearch: (body) => api.post('/admin/debug/search', body),
}
