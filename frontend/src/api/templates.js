import api from './client'

export const templatesApi = {
  list(activeOnly = true) {
    return api.get(`/templates?active_only=${activeOnly}`)
  },
  get(id) {
    return api.get(`/templates/${id}`)
  },
  create(data) {
    return api.post('/templates', data)
  },
  update(id, data) {
    return api.patch(`/templates/${id}`, data)
  },
  delete(id) {
    return api.delete(`/templates/${id}`)
  },
}
