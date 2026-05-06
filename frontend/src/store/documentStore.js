import { create } from 'zustand'

const useDocumentStore = create((set, get) => ({
  documents: [],
  isUploading: false,
  uploadProgress: {},   // { [tempId]: 0~100 }

  setDocuments: (docs) => set({ documents: docs }),

  addDocument: (doc) =>
    set((s) => ({ documents: [doc, ...s.documents] })),

  updateDocument: (id, patch) =>
    set((s) => ({
      documents: s.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),

  removeDocument: (id) =>
    set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),

  setUploading: (v) => set({ isUploading: v }),

  setUploadProgress: (tempId, pct) =>
    set((s) => ({ uploadProgress: { ...s.uploadProgress, [tempId]: pct } })),

  clearUploadProgress: (tempId) =>
    set((s) => {
      const next = { ...s.uploadProgress }
      delete next[tempId]
      return { uploadProgress: next }
    }),
}))

export default useDocumentStore
