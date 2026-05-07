import { useState, useEffect, useCallback } from 'react'
import { categoriesApi } from '../api/categories'

/**
 * 카테고리 목록 관리 훅
 *
 * 반환값:
 *  categories    - 카테고리 배열 [{ id, name, description, color, doc_count, ... }]
 *  loading       - 로딩 중 여부
 *  error         - 에러 메시지 (null이면 정상)
 *  createCategory(data)  - 카테고리 생성
 *  updateCategory(id, data) - 카테고리 수정
 *  deleteCategory(id)    - 카테고리 삭제
 *  refresh()     - 목록 새로고침
 */
export function useCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await categoriesApi.list()
      setCategories(data)
    } catch (e) {
      setError(e.message ?? '카테고리 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
  }, [fetch])

  const createCategory = useCallback(async (data) => {
    const created = await categoriesApi.create(data)
    setCategories((prev) => [...prev, { ...created, doc_count: 0 }])
    return created
  }, [])

  const updateCategory = useCallback(async (id, data) => {
    const updated = await categoriesApi.update(id, data)
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updated } : c))
    )
    return updated
  }, [])

  const deleteCategory = useCallback(async (id) => {
    await categoriesApi.delete(id)
    setCategories((prev) => prev.filter((c) => c.id !== id))
  }, [])

  return {
    categories,
    loading,
    error,
    createCategory,
    updateCategory,
    deleteCategory,
    refresh: fetch,
  }
}
