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

/** 로그인 여부만 확인 */
export function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  return children
}

/** 로그인 + admin 역할 확인 — 일반 user는 /chat으로 리다이렉트 */
export function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== USER_ROLE.ADMIN) return <Navigate to="/chat" replace />
  return children
}
