import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Layout } from '../../components/layout/Layout'
import { ChunkList } from '../../components/admin/ChunkList'
import { ChunkDetailPanel } from '../../components/admin/ChunkDetailPanel'
import { SearchDebugPanel } from '../../components/admin/SearchDebugPanel'
import { ChunkConfigEditor } from '../../components/admin/ChunkConfigEditor'
import { ParsedPagesViewer } from '../../components/admin/ParsedPagesViewer'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { Button } from '../../components/ui/Button'
import { adminApi } from '../../api/admin'
import { documentsApi } from '../../api/documents'
import { formatFileSize, formatRelativeTime, fileExtension } from '../../utils/formatters'

const TABS = [
  { id: 'info',   label: '기본 정보' },
  { id: 'pages',  label: '페이지 뷰어' },
  { id: 'chunks', label: '청크 뷰어' },
  { id: 'search', label: '검색 테스트' },
]

const STATUS_VARIANT = {
  processing:  'processing',
  reparsing:   'processing',
  rechunking:  'processing',
  reembedding: 'processing',
  ready:       'success',
  failed:      'danger',
  timeout:     'warning',
}
const STATUS_LABEL = {
  processing:  '처리 중',
  reparsing:   '재파싱 중',
  rechunking:  '재청킹 중',
  reembedding: '재임베딩 중',
  ready:       '완료',
  failed:      '실패',
  timeout:     '시간 초과',
}

const BUSY_STATUSES = new Set(['processing', 'reparsing', 'rechunking', 'reembedding'])

export default function DocumentDetailPage() {
  const { docId } = useParams()
  const navigate  = useNavigate()
  const [activeTab, setActiveTab] = useState('info')

  // -- 문서 정보 --
  const [doc,        setDoc]        = useState(null)
  const [docLoading, setDocLoading] = useState(true)
  const [docError,   setDocError]   = useState(null)

  const loadDoc = useCallback(() => {
    setDocLoading(true)
    documentsApi.getById(Number(docId))
      .then(setDoc)
      .catch((e) => setDocError(e.message))
      .finally(() => setDocLoading(false))
  }, [docId])

  useEffect(() => { loadDoc() }, [loadDoc])

  // -- 재처리 후 상태 폴링 --
  const pollRef = useRef(null)

  // 언마운트 시 폴링 타이머 정리
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  /** 재처리 작업 시작 직후 호출 — busy 상태가 끝날 때까지 doc을 주기적으로 재로드 */
  const startStatusPolling = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current)

    const poll = () => {
      documentsApi.getById(Number(docId))
        .then((updated) => {
          setDoc(updated)
          if (BUSY_STATUSES.has(updated.status)) {
            // 경과 시간에 따라 간격 조정 (2초 고정)
            pollRef.current = setTimeout(poll, 2000)
          } else {
            pollRef.current = null
          }
        })
        .catch(() => { pollRef.current = null }) // 오류 시 폴링 중단
    }

    // 첫 폴링은 1.5초 후 (백엔드가 status를 바꿀 시간을 줌)
    pollRef.current = setTimeout(poll, 1500)
  }, [docId])

  // -- 세분화 재처리 --
  const [reprocessing, setReprocessing] = useState(null) // 'reparse'|'rechunk'|'reembed'
  const [reprocessMsg, setReprocessMsg] = useState(null)
  const [rechunkConfig, setRechunkConfig] = useState(null)
  const [showRechunkForm, setShowRechunkForm] = useState(false)

  async function handleReparse() {
    setReprocessing('reparse')
    setReprocessMsg(null)
    try {
      const res = await adminApi.reparse(Number(docId))
      setReprocessMsg({ type: 'ok', text: res.message || '재파싱이 시작되었습니다' })
      startStatusPolling()
    } catch (e) {
      setReprocessMsg({ type: 'err', text: e.message || '재파싱 실패' })
    } finally {
      setReprocessing(null)
    }
  }

  async function handleRechunk() {
    setReprocessing('rechunk')
    setReprocessMsg(null)
    try {
      const res = await adminApi.rechunk(Number(docId), rechunkConfig ?? {})
      setReprocessMsg({ type: 'ok', text: res.message || '재청킹이 시작되었습니다' })
      setShowRechunkForm(false)
      startStatusPolling()
    } catch (e) {
      setReprocessMsg({ type: 'err', text: e.message || '재청킹 실패' })
    } finally {
      setReprocessing(null)
    }
  }

  async function handleReembed() {
    setReprocessing('reembed')
    setReprocessMsg(null)
    try {
      const res = await adminApi.reembed(Number(docId))
      setReprocessMsg({ type: 'ok', text: res.message || '재임베딩이 시작되었습니다' })
      startStatusPolling()
    } catch (e) {
      setReprocessMsg({ type: 'err', text: e.message || '재임베딩 실패' })
    } finally {
      setReprocessing(null)
    }
  }

  // -- 청크 목록 --
  const [chunks,         setChunks]         = useState([])
  const [chunkTotal,     setChunkTotal]     = useState(0)
  const [chunkPage,      setChunkPage]      = useState(1)
  const [chunkSort,      setChunkSort]      = useState('index')
  const [chunkLoading,   setChunkLoading]   = useState(false)
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

  useEffect(() => {
    if (activeTab === 'chunks') loadChunks(1, chunkSort)
  }, [activeTab]) // eslint-disable-line

  const ext     = doc ? fileExtension(doc.filename) : ''
  const isBusy  = doc && BUSY_STATUSES.has(doc.status)

  return (
    <Layout>
      <div className="flex flex-col h-full overflow-hidden">

        {/* -- 상단 바 -- */}
        <div className="shrink-0 px-6 pt-5 pb-0 border-b border-slate-200 bg-white">
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

          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={'px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ' + (
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* -- 탭 콘텐츠 -- */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6">

          {/* 기본 정보 탭 */}
          {activeTab === 'info' && (
            <div className="max-w-2xl space-y-5">
              {docLoading && <Spinner />}
              {docError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                  {docError}
                </div>
              )}
              {doc && (
                <>
                  {/* 문서 메타 카드 */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                      <div className={'w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold uppercase ' + (
                        ext === 'pdf'  ? 'bg-red-100 text-red-600'
                        : ext === 'docx' ? 'bg-blue-100 text-blue-600'
                        : ext === 'xlsx' ? 'bg-green-100 text-green-600'
                        : ext === 'pptx' ? 'bg-orange-100 text-orange-600'
                        : 'bg-slate-100 text-slate-600'
                      )}>
                        {ext}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{doc.filename}</p>
                        <p className="text-xs text-slate-400">ID: {doc.id}</p>
                      </div>
                    </div>
                    <dl className="divide-y divide-slate-100">
                      {[
                        ['상태',        <Badge variant={STATUS_VARIANT[doc.status] ?? 'default'}>{STATUS_LABEL[doc.status] ?? doc.status}</Badge>],
                        ['파일 형식',   doc.file_type?.toUpperCase()],
                        ['파일 크기',   doc.file_size ? formatFileSize(doc.file_size) : '—'],
                        ['청크 수',     doc.chunk_count != null ? doc.chunk_count + '개' : '—'],
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

                  {/* 세분화 재처리 섹션 */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                      <h3 className="text-sm font-semibold text-slate-700">재처리 작업</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        각 단계를 개별 실행할 수 있습니다. 순서: 재파싱 → 재청킹 → 재임베딩
                      </p>
                    </div>

                    <div className="px-5 py-4 space-y-4">
                      {/* 피드백 메시지 */}
                      {reprocessMsg && (
                        <div className={'text-xs rounded-lg px-3 py-2 ' + (
                          reprocessMsg.type === 'ok'
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-red-50 text-red-600 border border-red-200'
                        )}>
                          {reprocessMsg.text}
                        </div>
                      )}

                      {/* 재파싱 */}
                      <div className="flex items-start gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-700">재파싱</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            원본 파일을 다시 텍스트로 추출하여 parsed_pages를 갱신합니다. chunks는 변경되지 않습니다.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isBusy || reprocessing !== null}
                          onClick={handleReparse}
                        >
                          {reprocessing === 'reparse' ? <Spinner size="xs" /> : '재파싱'}
                        </Button>
                      </div>

                      <hr className="border-slate-100" />

                      {/* 재청킹 */}
                      <div className="space-y-3">
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-700">재청킹</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              저장된 parsed_pages를 기반으로 청킹과 임베딩을 다시 실행합니다.
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowRechunkForm((v) => !v)}
                              className="text-slate-500"
                            >
                              파라미터
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isBusy || reprocessing !== null}
                              onClick={handleRechunk}
                            >
                              {reprocessing === 'rechunk' ? <Spinner size="xs" /> : '재청킹'}
                            </Button>
                          </div>
                        </div>
                        {showRechunkForm && (
                          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                            <p className="text-xs text-slate-500 mb-3">
                              아래 설정은 이번 재청킹에만 적용됩니다.
                              비워두면 카테고리 설정값(없으면 전역 기본값)을 사용합니다.
                            </p>
                            <ChunkConfigEditor
                              value={rechunkConfig}
                              onChange={setRechunkConfig}
                              disabled={reprocessing !== null}
                            />
                          </div>
                        )}
                      </div>

                      <hr className="border-slate-100" />

                      {/* 재임베딩 */}
                      <div className="flex items-start gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-700">재임베딩</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            기존 chunks의 텍스트는 그대로 유지하고 벡터 임베딩만 재생성합니다.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isBusy || reprocessing !== null}
                          onClick={handleReembed}
                        >
                          {reprocessing === 'reembed' ? <Spinner size="xs" /> : '재임베딩'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 페이지 뷰어 탭 */}
          {activeTab === 'pages' && (
            <div className="max-w-3xl">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-700">페이지별 파싱 결과</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  원본 파일에서 페이지 단위로 추출된 텍스트입니다. 재파싱 실행 시 갱신됩니다.
                </p>
              </div>
              <ParsedPagesViewer documentId={Number(docId)} />
            </div>
          )}

          {/* 청크 뷰어 탭 */}
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

          {/* 검색 테스트 탭 */}
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
