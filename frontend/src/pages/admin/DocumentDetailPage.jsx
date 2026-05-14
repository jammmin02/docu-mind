import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Layout } from '../../components/layout/Layout'
import { ChunkList } from '../../components/admin/ChunkList'
import { ChunkDetailPanel } from '../../components/admin/ChunkDetailPanel'
import { SearchDebugPanel } from '../../components/admin/SearchDebugPanel'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { adminApi } from '../../api/admin'
import { documentsApi } from '../../api/documents'
import { formatFileSize, formatRelativeTime, fileExtension } from '../../utils/formatters'

const TABS = [
  { id: 'info',   label: '기본 정보' },
  { id: 'chunks', label: '청크 뷰어' },
  { id: 'search', label: '검색 테스트' },
]

const STATUS_VARIANT = {
  processing: 'processing', ready: 'success', failed: 'danger', timeout: 'warning',
}
const STATUS_LABEL = {
  processing: '처리 중', ready: '완료', failed: '실패', timeout: '시간 초과',
}

export default function DocumentDetailPage() {
  const { docId } = useParams()
  const navigate  = useNavigate()
  const [activeTab, setActiveTab] = useState('info')

  // ── 문서 정보 ──────────────────────────────────────────────────────────────
  const [doc,     setDoc]     = useState(null)
  const [docLoading, setDocLoading] = useState(true)
  const [docError, setDocError]     = useState(null)

  useEffect(() => {
    setDocLoading(true)
    documentsApi.getById(Number(docId))
      .then(setDoc)
      .catch((e) => setDocError(e.message))
      .finally(() => setDocLoading(false))
  }, [docId])

  // ── 청크 목록 ──────────────────────────────────────────────────────────────
  const [chunks,       setChunks]       = useState([])
  const [chunkTotal,   setChunkTotal]   = useState(0)
  const [chunkPage,    setChunkPage]    = useState(1)
  const [chunkSort,    setChunkSort]    = useState('index')
  const [chunkLoading, setChunkLoading] = useState(false)
  const [selectedChunkId, setSelectedChunkId] = useState(null)

  const loadChunks = useCallback((page = 1, sort = 'index') => {
    if (!docId) return
    setChunkLoading(true)
    adminApi.getChunks(Number(docId), { page, size: 50, sort })
      .then((data) => {
        setChunks(data.chunks)
        setChunkTotal(data.total)
        setChunkPage(page)
        setChunkSort(sort)
      })
      .catch((e) => console.error(e))
      .finally(() => setChunkLoading(false))
  }, [docId])

  // 청크 탭 진입 시 자동 로드
  useEffect(() => {
    if (activeTab === 'chunks') loadChunks(1, chunkSort)
  }, [activeTab]) // eslint-disable-line

  const ext = doc ? fileExtension(doc.filename) : ''

  return (
    <Layout>
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── 상단 바 ─────────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 pt-5 pb-0 border-b border-slate-200 bg-white">
          {/* 뒤로가기 + 제목 */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => navigate('/')}
              className="text-slate-400 hover:text-slate-700 transition-colors text-sm flex items-center gap-1"
            >
              ← 목록
            </button>
            {docLoading ? (
              <Spinner size="sm" />
            ) : docError ? (
              <span className="text-red-500 text-sm">{docError}</span>
            ) : doc ? (
              <>
                <span className="text-slate-300">/</span>
                <h2 className="text-base font-semibold text-slate-800 truncate max-w-md" title={doc.filename}>
                  {doc.filename}
                </h2>
                <Badge variant={STATUS_VARIANT[doc.status] ?? 'default'}>
                  {STATUS_LABEL[doc.status] ?? doc.status}
                </Badge>
                {doc.chunk_count != null && (
                  <span className="text-xs text-slate-400">{doc.chunk_count}개 청크</span>
                )}
              </>
            ) : null}
          </div>

          {/* 탭 */}
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── 탭 콘텐츠 ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6">

          {/* ━━ 기본 정보 탭 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {activeTab === 'info' && (
            <div className="max-w-2xl space-y-4">
              {docLoading && <Spinner />}
              {docError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                  {docError}
                </div>
              )}
              {doc && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold uppercase
                      ${ext === 'pdf'  ? 'bg-red-100 text-red-600'
                      : ext === 'docx' ? 'bg-blue-100 text-blue-600'
                      : ext === 'xlsx' ? 'bg-green-100 text-green-600'
                      : ext === 'pptx' ? 'bg-orange-100 text-orange-600'
                      : 'bg-slate-100 text-slate-600'}`}
                    >
                      {ext}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{doc.filename}</p>
                      <p className="text-xs text-slate-400">ID: {doc.id}</p>
                    </div>
                  </div>
                  <dl className="divide-y divide-slate-100">
                    {[
                      ['상태',        <Badge variant={STATUS_VARIANT[doc.status]}>{STATUS_LABEL[doc.status]}</Badge>],
                      ['파일 형식',   doc.file_type?.toUpperCase()],
                      ['파일 크기',   doc.file_size ? formatFileSize(doc.file_size) : '—'],
                      ['청크 수',     doc.chunk_count != null ? `${doc.chunk_count}개` : '—'],
                      ['카테고리 ID', doc.category_id ?? '—'],
                      ['업로드',      formatRelativeTime(doc.uploaded_at)],
                      ['마지막 갱신', doc.updated_at ? formatRelativeTime(doc.updated_at) : '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center px-5 py-3 gap-4">
                        <dt className="text-xs font-medium text-slate-500 w-24 shrink-0">{label}</dt>
                        <dd className="text-sm text-slate-800">{value}</dd>
                      </div>
                    ))}
                    {doc.error_message && (
                      <div className="px-5 py-3">
                        <dt className="text-xs font-medium text-red-500 mb-1">오류 메시지</dt>
                        <dd className="text-xs text-red-600 bg-red-50 rounded-lg p-3 leading-relaxed">
                          {doc.error_message}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </div>
          )}

          {/* ━━ 청크 뷰어 탭 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {activeTab === 'chunks' && (
            <>
              {doc?.status !== 'ready' && (
                <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700">
                  문서가 아직 처리되지 않았습니다. 상태: <strong>{STATUS_LABEL[doc?.status]}</strong>
                </div>
              )}
              <ChunkList
                chunks={chunks}
                total={chunkTotal}
                page={chunkPage}
                size={50}
                sort={chunkSort}
                loading={chunkLoading}
                selectedId={selectedChunkId}
                onSelect={(chunk) => setSelectedChunkId(chunk.id)}
                onSortChange={(s) => loadChunks(1, s)}
                onPageChange={(p) => loadChunks(p, chunkSort)}
              />
              <ChunkDetailPanel
                chunkId={selectedChunkId}
                onClose={() => setSelectedChunkId(null)}
              />
            </>
          )}

          {/* ━━ 검색 테스트 탭 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {activeTab === 'search' && (
            <div className="max-w-4xl">
              <SearchDebugPanel documentId={Number(docId)} />
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
