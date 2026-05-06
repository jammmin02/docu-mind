import { useEffect, useRef } from 'react'
import { MessageBubble, StreamingBubble } from './MessageBubble'

export function ChatWindow({ messages, isStreaming, streamingText }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  if (!messages.length && !isStreaming) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="text-5xl">💬</div>
        <p className="text-sm font-medium">문서에 대해 질문해보세요</p>
        <p className="text-xs">업로드된 문서를 기반으로 AI가 답변해드려요</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}
      {isStreaming && streamingText && (
        <StreamingBubble text={streamingText} />
      )}
      {isStreaming && !streamingText && (
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-sm">🤖</div>
          <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
            <div className="flex gap-1 items-center h-4">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
