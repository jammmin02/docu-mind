import { API_BASE } from '../utils/constants'

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',          // httpOnly cookie 자동 전송
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err?.error?.message ?? '요청 실패'), {
      status: res.status,
      code: err?.error?.code,
    })
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get:    (path)        => request(path),
  post:   (path, body)  => request(path, { method: 'POST',   body: JSON.stringify(body) }),
  delete: (path)        => request(path, { method: 'DELETE' }),
}

export default api
