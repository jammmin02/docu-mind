import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useDocuments } from '../../hooks/useDocuments'

/**
 * 전역 데이터 부트스트랩
 * — 어느 페이지로 진입하더라도 documentStore에 전체 문서 목록이 채워지도록 보장합니다.
 * — 실제 UI를 렌더링하지 않는 순수 데이터 초기화 컴포넌트입니다.
 */
function GlobalDataBootstrap() {
  useDocuments()
  return null
}

export function Layout({ children, headerAction }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <GlobalDataBootstrap />
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header action={headerAction} />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
