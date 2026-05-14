import { useCallback, useRef } from 'react'

/**
 * SSE(Server-Sent Events) 스트리밍 훅
 * fetchFn: () => Promise<Response>  (fetch 응답을 반환하는 함수)
 */
export function useSSE({ onToken, onDone, onError }) {
  const readerRef = useRef(null)

  const start = useCallback(async (fetchFn) => {
    // [Fix 1] sources 이벤트를 별도로 캡처한 뒤 done 시점에 전달
    let capturedSources = []
    // [Fix 3] done 이벤트 수신 여부 추적
    let doneReceived = false

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
            // [Fix 1] sources 이벤트: 별도 캡처 (done 때 함께 전달)
            if (payload.type === 'sources') capturedSources = payload.sources ?? []
            if (payload.type === 'token')   onToken?.(payload.content)
            if (payload.type === 'done') {
              doneReceived = true
              // sources는 done 페이로드가 아닌 capturedSources에서 주입
              onDone?.({ ...payload, sources: capturedSources })
            }
            if (payload.type === 'error') onError?.(new Error(payload.message))
          } catch {
            // JSON 파싱 실패 무시
          }
        }
      }

      // [Fix 3] done 이벤트 없이 스트림이 닫힌 경우 (네트워크 단절, abort 등)
      // isStreaming이 영구 true로 남는 버그 방지
      if (!doneReceived) {
        onDone?.({ type: 'done', content: '', sources: capturedSources })
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
