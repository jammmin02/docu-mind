import { API_BASE } from '../utils/constants'

async function request(path, options = {}) {
  // GET / DELETE 처럼 바디 없는 요청에 Content-Type을 붙이면
  // 브라우저가 불필요한 CORS preflight(OPTIONS)를 발송함 → 바디가 있을 때만 추가
  const hasBody = options.body !== undefined
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',          // httpOnly cookie 자동 전송
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...options,
  })

  // ── 401: 세션 만료 / 미로그인 → 로그인 페이지로 자동 이동 ──────────────────
  // /auth/me 는 초기 인증 확인용이므로 리다이렉트에서 제외
  if (res.status === 401 && path !== '/auth/me') {
    window.location.href = '/login'
    return null
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err?.error?.message ?? '요청 실패'), {
      status: res.status,
      code:   err?.error?.code,
    })
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get:    (path)        => request(path),
  post:   (path, body)  => request(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (path, body)  => request(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  (path, body)  => request(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: (path)        => request(path, { method: 'DELETE' }),
}

export default api
