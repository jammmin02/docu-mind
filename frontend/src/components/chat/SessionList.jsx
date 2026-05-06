import clsx from 'clsx'
import { Button } from '../ui/Button'
import { formatRelativeTime } from '../../utils/formatters'

export function SessionList({ sessions, currentSession, onSelect, onNew, onDelete }) {
  return (
    <div className="w-52 border-r border-slate-200 bg-white flex flex-col h-full shrink-0">
      <div className="p-3 border-b border-slate-100">
        <Button variant="secondary" size="sm" className="w-full" onClick={onNew}>
          + 새 대화
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-0.5">
        {sessions.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">대화 내역이 없어요</p>
        )}
        {sessions.map((s) => (
          <div
            key={s.session_id}
            onClick={() => onSelect(s.session_id)}
            className={clsx(
              'group relative px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
              currentSession === s.session_id
                ? 'bg-primary-50 border border-primary-200'
                : 'hover:bg-slate-50',
            )}
          >
            <p className={clsx(
              'text-xs font-medium truncate pr-5',
              currentSession === s.session_id ? 'text-primary-700' : 'text-slate-700',
            )}>
              {s.title ?? '새 대화'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {formatRelativeTime(s.updated_at)}
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(s.session_id) }}
              className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 text-xs transition-opacity"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
