import api from './client'

export const categoriesApi = {
  /** 카테고리 목록 (doc_count 포함) */
  list() {
    return api.get('/categories')
  },

  /** 카테고리 생성 */
  create(data) {
    return api.post('/categories', data)
  },

  /** 카테고리 수정 */
  update(id, data) {
    return api.patch(`/categories/${id}`, data)
  },

  /** 카테고리 삭제 */
  delete(id) {
    return api.delete(`/categories/${id}`)
  },
}
