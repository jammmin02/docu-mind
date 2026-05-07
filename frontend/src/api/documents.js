import { API_BASE } from '../utils/constants'
import api from './client'

export const documentsApi = {
  /** 문서 목록 (category_id 필터 옵션) */
  list(categoryId) {
    const params = categoryId != null ? `?category_id=${categoryId}` : ''
    return api.get(`/documents${params}`)
  },

  /** 문서 상세 */
  get(id) {
    return api.get(`/documents/${id}`)
  },

  /** 파일 업로드 (categoryId 옵션) */
  async upload(file, onProgress, categoryId) {
    const formData = new FormData()
    formData.append('file', file)
    if (categoryId != null) formData.append('category_id', categoryId)

    const xhr = new XMLHttpRequest()
    return new Promise((resolve, reject) => {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          const err = JSON.parse(xhr.responseText || '{}')
          reject(new Error(err?.error?.message ?? '업로드 실패'))
        }
      }
      xhr.onerror = () => reject(new Error('네트워크 오류'))
      xhr.open('POST', `${API_BASE}/documents/upload`)
      xhr.withCredentials = true
      xhr.send(formData)
    })
  },

  /** 문서 삭제 */
  delete(id) {
    return api.delete(`/documents/${id}`)
  },

  /** 실패 문서 재처리 */
  reprocess(id) {
    return api.post(`/documents/${id}/reprocess`, {})
  },
}
