import { useState, useEffect, useCallback } from 'react'
import { authApi } from '../api/auth'

/**
 * 인증 상태 훅
 * - 마운트 시 /auth/me 호출로 로그인 여부 확인
 * - user: { id, email, name, role } | null
 * - loading: 초기 확인 중 true
 * - logout: 로그아웃 후 user를 null로 초기화
 */
export function useAuth() {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
    }
  }, [])

  return { user, loading, logout }
}
