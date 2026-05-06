import { NavLink, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import useChatStore from '../../store/chatStore'
import { useAuth } from '../../hooks/useAuth'
import { formatRelativeTime } from '../../utils/formatters'
import { USER_ROLE } from '../../utils/constants'

const ALL_NAV = [
  { to: '/',        icon: '📄', label: 'Documents', adminOnly: true  },
  { to: '/chat',    icon: '💬', label: 'Chat',      adminOnly: false },
  { to: '/reports', icon: '📊', label: 'Reports',   adminOnly: false },
]

export function Sidebar() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { sessions, currentSession, setCurrentSession } = useChatStore()

  const isAdmin = user?.role === USER_ROLE.ADMIN
  const navItems = ALL_NAV.filter((item) => !item.adminOnly || isAdmin)

  return (
    <aside className="w-56 bg-slate-800 flex flex-col h-screen shrink-0">
      {/* 로고 */}
      <div className="px-5 py-5 border-b border-slate-700">
        <h1 className="text-white font-bold text-base leading-tight">
          RAG 문서 Q&A
        </h1>
        <div className="flex items-center gap-1.5 mt-1">
          <p className="text-slate-400 text-xs">AI 기반 문서 분석</p>
          {isAdmin && (
            <span className="text-[10px] bg-primary-700 text-primary-200 px-1.5 py-0.5 rounded font-medium">
              ADMIN
            </span>
          )}
        </div>
      </div>

      {/* 메인 내비게이션 */}
      <nav className="px-3 py-4 space-y-1">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary-600 text-white'
                : 'text-slate-300 hover:bg-slate-700 hover:text-white',
            )}
          >
            <span>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* 최근 대화 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-4">
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider px-2 mb-2">
          최근 대화
        </p>
        <div className="space-y-0.5">
          {sessions.slice(0, 15).map((s) => (
            <button
              key={s.session_id}
              onClick={() => {
                setCurrentSession(s.session_id)
                navigate('/chat')
              }}
              className={clsx(
                'w-full text-left px-3 py-2 rounded-lg text-xs transition-colors',
                currentSession === s.session_id
                  ? 'bg-slate-600 text-white'
                  : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200',
              )}
            >
              <p className="font-medium truncate">{s.title ?? '새 대화'}</p>
              <p className="text-slate-500 text-[11px] mt-0.5">
                {formatRelativeTime(s.updated_at)}
              </p>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
