import { Layout } from '../components/layout/Layout'
import { SessionList } from '../components/chat/SessionList'
import { ChatWindow } from '../components/chat/ChatWindow'
import { MessageInput } from '../components/chat/MessageInput'
import { useChat } from '../hooks/useChat'
import { useCategories } from '../hooks/useCategories'

// 카테고리별 색상 클래스 (tailwind safelist 없어도 되는 inline style 방식)
const FALLBACK_COLOR = '#6366f1'

export default function ChatPage() {
  const {
    sessions, currentSession, messages, isStreaming, streamingText, selectedCategoryId,
    setCurrentSession, setSelectedCategoryId,
    sendMessage, newSession, deleteSession, abortSSE,
    goToReport,
  } = useChat()

  const { categories, loading: catLoading } = useCategories()

  return (
    <Layout>
      <div className="flex h-full overflow-hidden">
        {/* 세션 목록 */}
        <SessionList
          sessions={sessions}
          currentSession={currentSession}
          onSelect={setCurrentSession}
          onNew={newSession}
          onDelete={deleteSession}
        />

        {/* 채팅 영역 */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* 카테고리 필터 바 */}
          <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center gap-2 flex-wrap min-h-[44px]">
            <span className="text-xs text-slate-500 font-medium shrink-0">문서 범위:</span>

            {/* 전체 버튼 */}
            <button
              onClick={() => setSelectedCategoryId(null)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors font-medium ${
                selectedCategoryId === null
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              전체
            </button>

            {/* 카테고리 버튼들 */}
            {!catLoading && categories.map((cat) => {
              const isActive = selectedCategoryId === cat.id
              const color = cat.color || FALLBACK_COLOR
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(isActive ? null : cat.id)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors font-medium ${
                    isActive ? 'text-white' : 'text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                  style={isActive ? { backgroundColor: color, borderColor: color } : {}}
                  title={cat.description || cat.name}
                >
                  {cat.name}
                  {cat.doc_count > 0 && (
                    <span className={`ml-1 text-[10px] ${isActive ? 'opacity-80' : 'text-slate-400'}`}>
                      {cat.doc_count}
                    </span>
                  )}
                </button>
              )
            })}

            {/* 보고서 생성 버튼 — 우측 정렬 */}
            {messages.length > 0 && (
              <button
                onClick={goToReport}
                className="ml-auto text-xs px-3 py-1 rounded-full border border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors font-medium flex items-center gap-1"
                title="현재 대화를 기반으로 보고서 작성"
              >
                <span>📄</span>
                <span>보고서 작성</span>
              </button>
            )}
          </div>

          <ChatWindow
            messages={messages}
            isStreaming={isStreaming}
            streamingText={streamingText}
          />

          <MessageInput
            onSend={sendMessage}
            isStreaming={isStreaming}
            onAbort={abortSSE}
          />
        </div>
      </div>
    </Layout>
  )
}
