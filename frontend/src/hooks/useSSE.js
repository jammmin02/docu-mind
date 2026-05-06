import { useCallback, useRef } from 'react'

/**
 * SSE(Server-Sent Events) 스트리밍 훅
 * fetchFn: () => Promise<Response>  (fetch 응답을 반환하는 함수)
 */
export function useSSE({ onToken, onDone, onError }) {
  const readerRef = useRef(null)

  const start = useCallback(async (fetchFn) => {
    try {
      const res = await fetchFn()
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      readerRef.current = reader

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()  // 마지막 불완전한 줄 보존

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (!raw) continue

          try {
            const payload = JSON.parse(raw)
            if (payload.type === 'token') onToken?.(payload.content)
            if (payload.type === 'done')  onDone?.(payload)
            if (payload.type === 'error') onError?.(new Error(payload.message))
          } catch {
            // JSON 파싱 실패 무시
          }
        }
      }
    } catch (err) {
      onError?.(err)
    }
  }, [onToken, onDone, onError])

  const abort = useCallback(() => {
    readerRef.current?.cancel()
  }, [])

  return { start, abort }
}
