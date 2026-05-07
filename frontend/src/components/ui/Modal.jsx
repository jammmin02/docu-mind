import { useEffect } from 'react'

/**
 * 공통 모달 컴포넌트
 * @param {boolean}  isOpen   - 표시 여부
 * @param {Function} onClose  - 닫기 콜백
 * @param {string}   title    - 모달 제목
 * @param {string}   [variant] - 'error' | 'info' (기본: 'info')
 * @param {ReactNode} children - 본문
 */
export function Modal({ isOpen, onClose, title, variant = 'info', children }) {
  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const iconMap = {
    error: { emoji: '⚠️', titleColor: 'text-red-700',   border: 'border-red-100',  bg: 'bg-red-50'   },
    info:  { emoji: 'ℹ️', titleColor: 'text-slate-800',  border: 'border-slate-100', bg: 'bg-white'    },
  }
  const style = iconMap[variant] ?? iconMap.info

  return (
    /* 오버레이 */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.45)' }}
      onClick={onClose}
    >
      {/* 모달 박스 — 클릭 이벤트 전파 막기 */}
      <div
        className={`
          relative w-full max-w-md rounded-2xl shadow-2xl border
          ${style.bg} ${style.border}
          animate-[fadeInScale_0.15s_ease-out]
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{style.emoji}</span>
            <h3 className={`text-base font-semibold ${style.titleColor}`}>
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors leading-none mt-0.5"
            aria-label="닫기"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed">
          {children}
        </div>

        {/* 푸터 */}
        <div className="px-6 pb-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
