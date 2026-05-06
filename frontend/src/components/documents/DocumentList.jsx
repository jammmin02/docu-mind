import { DocumentCard } from './DocumentCard'

export function DocumentList({ documents, onDelete, onReprocess }) {
  if (!documents.length) {
    return (
      <div className="text-center py-16 text-slate-400">
        <div className="text-4xl mb-3">📂</div>
        <p className="text-sm">업로드된 문서가 없어요</p>
        <p className="text-xs mt-1">위에서 파일을 업로드해 보세요</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id}
          doc={doc}
          onDelete={onDelete}
          onReprocess={onReprocess}
        />
      ))}
    </div>
  )
}
