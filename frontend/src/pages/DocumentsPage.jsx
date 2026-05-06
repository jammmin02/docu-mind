import { useState } from 'react'
import { Layout } from '../components/layout/Layout'
import { FileUploader } from '../components/documents/FileUploader'
import { DocumentList } from '../components/documents/DocumentList'
import { useDocuments } from '../hooks/useDocuments'

export default function DocumentsPage() {
  const { documents, isUploading, upload, deleteDocument, reprocess } = useDocuments()
  const [error, setError] = useState(null)

  const handleUpload = async (file) => {
    setError(null)
    try {
      await upload(file)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <Layout>
      <div className="h-full overflow-y-auto scrollbar-thin p-6 space-y-5">
        <FileUploader onUpload={handleUpload} isUploading={isUploading} />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            문서 목록
            <span className="ml-2 text-slate-400 font-normal">{documents.length}개</span>
          </h3>
        </div>

        <DocumentList
          documents={documents}
          onDelete={deleteDocument}
          onReprocess={reprocess}
        />
      </div>
    </Layout>
  )
}
