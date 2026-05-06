import { useState, useRef } from 'react'
import { Button } from '../ui/Button'

export function MessageInput({ onSend, isStreaming, onAbort }) {
  const [value, setValue] = useState('')
  const textareaRef = useRef(null)

  const submit = () => {
    if (!value.trim() || isStreaming) return
    onSend(value.trim())
    setValue('')
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="p-4 border-t border-slate-200 bg-white">
      <div className="flex gap-2 items-end bg-slate-50 rounded-xl border border-slate-200 p-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="질문을 입력하세요... (Shift+Enter: 줄바꿈)"
          rows={1}
          className="flex-1 bg-transparent resize-none text-sm text-slate-800 placeholder-slate-400 outline-none max-h-32 py-1 px-2 leading-relaxed"
          style={{ height: 'auto' }}
          onInput={(e) => {
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
          }}
        />
        {isStreaming ? (
          <Button variant="danger" size="sm" onClick={onAbort} className="shrink-0">
            ■ 중지
          </Button>
        ) : (
          <Button size="sm" onClick={submit} disabled={!value.trim()} className="shrink-0">
            전송 ↑
          </Button>
        )}
      </div>
      <p className="text-[11px] text-slate-400 mt-1 text-center">
        Enter 전송 · Shift+Enter 줄바꿈
      </p>
    </div>
  )
}
