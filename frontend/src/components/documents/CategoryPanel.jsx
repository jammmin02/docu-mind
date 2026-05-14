import { useState } from 'react'
import clsx from 'clsx'
import { Button } from '../ui/Button'
import { CategoryModal } from './CategoryModal'

/**
 * 카테고리 목록 패널 (어드민 DocumentsPage 좌측)
 *
 * Props:
 *  categories        - 카테고리 배열
 *  selectedId        - 현재 선택된 카테고리 id (null = 전체)
 *  onSelect(id)      - 카테고리 선택 콜백
 *  onCreate(data)    - 생성 콜백 (async)
 *  onUpdate(id,data) - 수정 콜백 (async)
 *  onDelete(id)      - 삭제 콜백 (async)
 *  loading           - 로딩 중 여부
 */
export function CategoryPanel({
  categories,
  selectedId,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  loading,
}) {
  const [modal, setModal] = useState(null) // null | { mode: 'create'|'edit', initial?: object }
  const [deletingId, setDeletingId] = useState(null)

  const totalDocs = categories.reduce((sum, c) => sum + (c.doc_count ?? 0), 0)

  const handleDelete = async (cat) => {
    if (!window.confirm(`'${cat.name}' 카테고리를 삭제할까요?\n소속 문서는 미분류 상태로 변경됩니다.`)) return
    setDeletingId(cat.id)
    try {
      await onDelete(cat.id)
      if (selectedId === cat.id) onSelect(null)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-slate-100 bg-slate-50 h-full">

      {/* 패널 헤더 */}
      <div className="px-4 pt-5 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">카테고리</h2>
          <button
            onClick={() => setModal({ mode: 'create' })}
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors text-lg leading-none"
            title="카테고리 추가"
          >
            +
          </button>
        </div>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-2">

        {/* 전체 보기 */}
        <button
          onClick={() => onSelect(null)}
          className={clsx(
            'w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors',
            selectedId === null
              ? 'bg-primary-50 text-primary-700 font-medium'
              : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0" />
          <span className="flex-1 text-left truncate">전체 문서</span>
          <span className="text-xs text-slate-400">{totalDocs}</span>
        </button>

        {/* 로딩 */}
        {loading && (
          <div className="px-4 py-3 text-xs text-slate-400">불러오는 중...</div>
        )}

        {/* 카테고리 아이템 */}
        {!loading && categories.map((cat) => (
          <CategoryItem
            key={cat.id}
            cat={cat}
            isSelected={selectedId === cat.id}
            isDeleting={deletingId === cat.id}
            onSelect={() => onSelect(cat.id)}
            onEdit={() => setModal({ mode: 'edit', initial: cat })}
            onDelete={() => handleDelete(cat)}
          />
        ))}

        {/* 비어있음 */}
        {!loading && categories.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-slate-400">카테고리가 없어요</p>
            <button
              onClick={() => setModal({ mode: 'create' })}
              className="mt-2 text-xs text-primary-500 hover:text-primary-700 underline underline-offset-2"
            >
              첫 카테고리 만들기
            </button>
          </div>
        )}
      </div>

      {/* 모달 */}
      {modal && (
        <CategoryModal
          mode={modal.mode}
          initial={modal.initial}
          onConfirm={async (data) => {
            if (modal.mode === 'create') await onCreate(data)
            else await onUpdate(modal.initial.id, data)
          }}
          onClose={() => setModal(null)}
        />
      )}
    </aside>
  )
}


/** 카테고리 개별 아이템 */
function CategoryItem({ cat, isSelected, isDeleting, onSelect, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false)

  // chunk_config가 설정된 경우 툴팁 텍스트 생성
  const chunkConfigTooltip = cat.chunk_config
    ? Object.entries(cat.chunk_config)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
    : null

  return (
    <div
      className={clsx(
        'group flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-colors',
        isSelected ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-100',
      )}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 색상 도트 */}
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: cat.color ?? '#6366f1' }}
      />

      {/* 이름 */}
      <span className={clsx(
        'flex-1 text-sm truncate',
        isSelected ? 'font-medium' : '',
      )}>
        {cat.name}
      </span>

      {/* chunk_config 설정 아이콘 (호버 전에도 표시) */}
      {chunkConfigTooltip && !hovered && !isSelected && (
        <span
          className="text-xs text-indigo-400 shrink-0"
          title={'커스텀 청크 설정\n' + chunkConfigTooltip}
        >
          ⚙
        </span>
      )}

      {/* 문서 수 / 액션 버튼 */}
      {hovered || isSelected ? (
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* chunk_config 설정 아이콘 (호버 시) */}
          {chunkConfigTooltip && (
            <span
              className="w-5 h-5 flex items-center justify-center text-xs text-indigo-400 cursor-default"
              title={'커스텀 청크 설정\n' + chunkConfigTooltip}
            >
              ⚙
            </span>
          )}
          <button
            onClick={onEdit}
            className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 text-xs transition-colors"
            title="수정"
          >
            ✎
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 text-xs transition-colors disabled:opacity-40"
            title="삭제"
          >
            {isDeleting ? '…' : '✕'}
          </button>
        </div>
      ) : (
        <span className="text-xs text-slate-400 shrink-0">{cat.doc_count ?? 0}</span>
      )}
    </div>
  )
}
