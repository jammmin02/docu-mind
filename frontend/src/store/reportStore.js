import { create } from 'zustand'

const useReportStore = create((set) => ({
  reports: [],
  currentReport: null,
  isGenerating: false,
  streamingText: '',

  setReports: (reports) => set({ reports }),

  addReport: (report) =>
    set((s) => ({ reports: [report, ...s.reports] })),

  updateReport: (id, patch) =>
    set((s) => ({
      reports: s.reports.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })),

  setCurrentReport: (report) => set({ currentReport: report }),

  setGenerating: (v) => set({ isGenerating: v }),

  appendStreamingText: (chunk) =>
    set((s) => ({ streamingText: s.streamingText + chunk })),

  commitStreamingText: (reportId) =>
    set((s) => ({
      currentReport: { ...(s.currentReport ?? {}), id: reportId, content: s.streamingText },
      streamingText: '',
      isGenerating: false,
    })),

  resetStreaming: () => set({ streamingText: '', isGenerating: false }),
}))

export default useReportStore
