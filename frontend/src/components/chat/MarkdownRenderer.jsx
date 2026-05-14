/**
 * 경량 Markdown 렌더러 (외부 라이브러리 없이 순수 React)
 *
 * 지원 문법:
 *   - 코드 블록: ```lang\n...\n```
 *   - 인라인 코드: `code`
 *   - 헤더: # H1 / ## H2 / ### H3
 *   - 굵게: **text**
 *   - 기울임: *text*
 *   - 글머리 목록: - item  /  * item
 *   - 번호 목록: 1. item
 *   - 수평선: ---
 *   - 단락: 빈 줄 구분
 */

/** 인라인 요소 파싱: 굵게, 기울임, 인라인 코드 */
function renderInline(text, keyBase = '') {
  // 매칭 순서: 인라인 코드 → 굵게 → 기울임
  const pattern = /(`[^`]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g
  const parts = []
  let lastIndex = 0
  let match
  let idx = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    if (token.startsWith('`')) {
      parts.push(
        <code
          key={`${keyBase}-c${idx++}`}
          className="bg-slate-100 text-rose-600 px-1 py-0.5 rounded text-[0.85em] font-mono"
        >
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith('**')) {
      parts.push(
        <strong key={`${keyBase}-b${idx++}`} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      )
    } else {
      parts.push(
        <em key={`${keyBase}-i${idx++}`}>
          {token.slice(1, -1)}
        </em>
      )
    }
    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  // 단순 문자열이면 그대로 반환
  if (parts.length === 0) return text
  if (parts.length === 1 && typeof parts[0] === 'string') return parts[0]
  return parts
}

/** 블록 파싱: 코드블록, 헤더, 리스트, 단락 */
function parseBlocks(text) {
  const lines = text.split('\n')
  const blocks = []
  let i = 0
  let key = 0

  const HEADING_CLASSES = [
    '',                                              // index 0 unused
    'text-base font-bold text-slate-900 mt-3 mb-1', // h1
    'text-sm font-bold text-slate-900 mt-2.5 mb-1', // h2
    'text-sm font-semibold text-slate-800 mt-2 mb-0.5', // h3
    'text-sm font-medium text-slate-700 mt-1.5',    // h4
  ]

  while (i < lines.length) {
    const line = lines[i]

    // ── 코드 블록 ──────────────────────────────────────────────────────────
    if (line.trimStart().startsWith('```')) {
      const codeLines = []
      const langMatch = line.match(/^```(\w*)/)
      const lang = langMatch ? langMatch[1] : ''
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // 닫는 ```
      blocks.push(
        <pre
          key={key++}
          className="bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto text-xs font-mono my-1 leading-relaxed"
        >
          {lang && (
            <span className="block text-slate-400 text-[10px] mb-1 uppercase tracking-wider">
              {lang}
            </span>
          )}
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      continue
    }

    // ── 수평선 ─────────────────────────────────────────────────────────────
    if (line.match(/^---+\s*$/) || line.match(/^\*\*\*+\s*$/)) {
      blocks.push(<hr key={key++} className="border-slate-200 my-2" />)
      i++
      continue
    }

    // ── 헤더 ──────────────────────────────────────────────────────────────
    const headerMatch = line.match(/^(#{1,4})\s+(.+)$/)
    if (headerMatch) {
      const level = Math.min(headerMatch[1].length, 4)
      const content = headerMatch[2]
      const cls = HEADING_CLASSES[level]
      blocks.push(
        <p key={key++} className={cls}>
          {renderInline(content, `h${key}`)}
        </p>
      )
      i++
      continue
    }

    // ── 글머리 목록 ────────────────────────────────────────────────────────
    if (line.match(/^[\-\*\+]\s+.+/)) {
      const items = []
      while (i < lines.length && lines[i].match(/^[\-\*\+]\s+.+/)) {
        items.push(lines[i].replace(/^[\-\*\+]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={key++} className="list-disc list-outside ml-4 space-y-0.5 my-1">
          {items.map((item, j) => (
            <li key={j} className="text-sm text-slate-800 leading-relaxed">
              {renderInline(item, `ul${key}-${j}`)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    // ── 번호 목록 ──────────────────────────────────────────────────────────
    if (line.match(/^\d+\.\s+.+/)) {
      const items = []
      while (i < lines.length && lines[i].match(/^\d+\.\s+.+/)) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={key++} className="list-decimal list-outside ml-4 space-y-0.5 my-1">
          {items.map((item, j) => (
            <li key={j} className="text-sm text-slate-800 leading-relaxed">
              {renderInline(item, `ol${key}-${j}`)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    // ── 빈 줄 ─────────────────────────────────────────────────────────────
    if (line.trim() === '') {
      i++
      continue
    }

    // ── 단락 — 연속된 일반 줄 수집 ────────────────────────────────────────
    const paraLines = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].match(/^#{1,4}\s/) &&
      !lines[i].match(/^[\-\*\+]\s+/) &&
      !lines[i].match(/^\d+\.\s+/) &&
      !lines[i].match(/^---+\s*$/)
    ) {
      paraLines.push(lines[i])
      i++
    }

    if (paraLines.length > 0) {
      blocks.push(
        <p key={key++} className="text-sm text-slate-800 leading-relaxed">
          {renderInline(paraLines.join(' '), `p${key}`)}
        </p>
      )
    }
  }

  return blocks
}

/**
 * MarkdownRenderer
 * @param {string} text - Markdown 텍스트
 * @param {string} [className] - 추가 CSS 클래스
 */
export function MarkdownRenderer({ text, className = '' }) {
  if (!text) return null

  const blocks = parseBlocks(text)

  return (
    <div className={`space-y-1.5 ${className}`}>
      {blocks}
    </div>
  )
}
