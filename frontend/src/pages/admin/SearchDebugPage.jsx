import { Layout } from '../../components/layout/Layout'
import { SearchDebugPanel } from '../../components/admin/SearchDebugPanel'

/**
 * 전체 문서 대상 검색 디버그 페이지 (사이드바 메뉴에서 진입)
 */
export default function SearchDebugPage() {
  return (
    <Layout>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
          <div className="max-w-4xl">
            <SearchDebugPanel />
          </div>
        </div>
      </div>
    </Layout>
  )
}
