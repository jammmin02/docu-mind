import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from './ui/Spinner'
import { USER_ROLE } from '../utils/constants'

function Loading() {
  return (
    <div className="flex items-center justify-center h-screen">
      <Spinner size="lg" />
    </div>
  )
}

/**
 * 로그인 여부 확인 — UX 목적의 라우트 가드.
 * 실질적인 인증/인가는 백엔드 API에서 처리되며,
 * 세션 만료 시 api/client.js의 401 인터셉터가 /login으로 자동 이동시킨다.
 */
export function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  return children
}

/**
 * 로그인 + admin 역할 확인 — UX 목적의 라우트 가드.
 * 일반 user가 접근 시 /chat으로 리다이렉트.
 * 실질적인 관리자 권한 검증은 백엔드 API에서 처리된다.
 */
export function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== USER_ROLE.ADMIN) return <Navigate to="/chat" replace />
  return children
}
