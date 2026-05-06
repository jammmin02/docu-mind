import { create } from 'zustand'

const useChatStore = create((set) => ({
  sessions: [],
  currentSession: null,
  messages: [],
  isStreaming: false,
  streamingText: '',
  selectedDocIds: [],

  setSessions: (sessions) => set({ sessions }),

  addSession: (session) =>
    set((s) => ({ sessions: [session, ...s.sessions] })),

  updateSession: (sessionId, patch) =>
    set((s) => ({
      sessions: s.sessions.map((s2) =>
        s2.session_id === sessionId ? { ...s2, ...patch } : s2
      ),
    })),

  removeSession: (sessionId) =>
    set((s) => ({
      sessions: s.sessions.filter((s2) => s2.session_id !== sessionId),
      currentSession: s.currentSession === sessionId ? null : s.currentSession,
      messages: s.currentSession === sessionId ? [] : s.messages,
    })),

  setCurrentSession: (sessionId) => set({ currentSession: sessionId }),

  setMessages: (messages) => set({ messages }),

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  setStreaming: (v) => set({ isStreaming: v }),

  appendStreamingText: (chunk) =>
    set((s) => ({ streamingText: s.streamingText + chunk })),

  commitStreamingText: (sources = []) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { role: 'assistant', content: s.streamingText, sources, created_at: new Date().toISOString() },
      ],
      streamingText: '',
      isStreaming: false,
    })),

  resetStreaming: () => set({ streamingText: '', isStreaming: false }),

  setSelectedDocIds: (ids) => set({ selectedDocIds: ids }),
}))

export default useChatStore
