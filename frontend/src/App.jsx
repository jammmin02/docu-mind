import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PrivateRoute, AdminRoute } from './components/PrivateRoute'
import { useAuth } from './hooks/useAuth'
import { USER_ROLE } from './utils/constants'
import LoginPage from './pages/LoginPage'
import DocumentsPage from './pages/DocumentsPage'
import ChatPage from './pages/ChatPage'
import ReportsPage from './pages/ReportsPage'

/** 로그인 후 역할에 따라 기본 페이지 분기 */
function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === USER_ROLE.ADMIN ? '/' : '/chat'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 공개 */}
        <Route path="/login" element={<LoginPage />} />

        {/* admin 전용 */}
        <Route
          path="/"
          element={
            <AdminRoute>
              <DocumentsPage />
            </AdminRoute>
          }
        />

        {/* 로그인 사용자 공통 */}
        <Route
          path="/chat"
          element={
            <PrivateRoute>
              <ChatPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <PrivateRoute>
              <ReportsPage />
            </PrivateRoute>
          }
        />

        {/* 그 외 — 역할에 따라 분기 */}
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  )
}
