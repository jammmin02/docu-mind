import clsx from 'clsx'
import { SourceBadge } from './SourceBadge'

export function MessageBubble({ message }) {
  const isUser = message.role === 'user'

  return (
    <div className={clsx('flex gap-3', isUser && 'justify-end')}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-sm shrink-0 mt-1">
          🤖
        </div>
      )}

      <div className={clsx('max-w-[75%] space-y-1', isUser && 'items-end flex flex-col')}>
        <div className={clsx(
          'px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-primary-600 text-white rounded-tr-sm'
            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm',
        )}>
          {message.content}
        </div>

        {/* 출처 뱃지 */}
        {message.sources?.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {message.sources.map((src, i) => (
              <SourceBadge key={i} source={src} />
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm shrink-0 mt-1">
          👤
        </div>
      )}
    </div>
  )
}

export function StreamingBubble({ text }) {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-sm shrink-0 mt-1">
        🤖
      </div>
      <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-tl-sm bg-white border border-slate-200 text-slate-800 text-sm leading-relaxed shadow-sm">
        {text}
        <span className="inline-block w-1.5 h-4 bg-primary-400 rounded ml-0.5 animate-pulse align-middle" />
      </div>
    </div>
  )
}
