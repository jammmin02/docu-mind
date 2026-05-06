export function useAuth() {
  const user = { id: 'dev', name: '개발자', email: 'dev@local', role: 'admin' }
  const loading = false

  const logout = async () => {}

  return { user, loading, logout }
}
