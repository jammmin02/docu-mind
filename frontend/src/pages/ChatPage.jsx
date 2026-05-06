import { Layout } from '../components/layout/Layout'
import { SessionList } from '../components/chat/SessionList'
import { ChatWindow } from '../components/chat/ChatWindow'
import { MessageInput } from '../components/chat/MessageInput'
import { useChat } from '../hooks/useChat'
import useDocumentStore from '../store/documentStore'
import { DOCUMENT_STATUS } from '../utils/constants'

export default function ChatPage() {
  const {
    sessions, currentSession, messages, isStreaming, streamingText, selectedDocIds,
    setCurrentSession, setSelectedDocIds,
    sendMessage, newSession, deleteSession, abortSSE,
  } = useChat()

  const documents = useDocumentStore((s) => s.documents)
  const readyDocs = documents.filter((d) => d.status === DOCUMENT_STATUS.READY)

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
          {/* 문서 필터 */}
          {readyDocs.length > 0 && (
            <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500 font-medium shrink-0">참고 문서:</span>
              <button
                onClick={() => setSelectedDocIds([])}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  selectedDocIds.length === 0
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'text-slate-600 border-slate-200 hover:border-primary-300'
                }`}
              >
                전체
              </button>
              {readyDocs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDocIds(
                    selectedDocIds.includes(d.id)
                      ? selectedDocIds.filter((id) => id !== d.id)
                      : [...selectedDocIds, d.id]
                  )}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors max-w-[150px] truncate ${
                    selectedDocIds.includes(d.id)
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'text-slate-600 border-slate-200 hover:border-primary-300'
                  }`}
                  title={d.filename}
                >
                  {d.filename}
                </button>
              ))}
            </div>
          )}

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
