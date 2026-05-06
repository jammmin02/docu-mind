import { useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../ui/Button'

const PAGE_META = {
  '/':        { title: 'Documents', desc: '문서 업로드 및 관리' },
  '/chat':    { title: 'Chat',      desc: 'AI와 문서 기반 대화' },
  '/reports': { title: 'Reports',   desc: '보고서 자동 생성'   },
}

export function Header({ action }) {
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const meta = PAGE_META[pathname] ?? PAGE_META['/']

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
      <div>
        <h2 className="font-semibold text-slate-800 text-base leading-none">{meta.title}</h2>
        <p className="text-slate-400 text-xs mt-0.5">{meta.desc}</p>
      </div>

      <div className="flex items-center gap-3">
        {action}
        {user && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={logout}>로그아웃</Button>
          </div>
        )}
      </div>
    </header>
  )
}
