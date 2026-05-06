import { API_BASE } from '../utils/constants'
import api from './client'

export const authApi = {
  /** Google OAuth 로그인 URL로 리다이렉트 */
  login() {
    window.location.href = `${API_BASE}/auth/login`
  },

  /** 현재 로그인 사용자 정보 */
  me() {
    return api.get('/auth/me')
  },

  /** 로그아웃 */
  logout() {
    return api.post('/auth/logout', {})
  },
}
