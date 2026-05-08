import { useState, useEffect, useCallback } from 'react'
import { templatesApi } from '../api/templates'

export function useTemplates(activeOnly = true) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  const fetch = useCallback(async () => {
    try {
      setLoading(true); setError(null)
      setTemplates(await templatesApi.list(activeOnly))
    } catch (e) {
      setError(e.message ?? '템플릿 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [activeOnly])

  useEffect(() => { fetch() }, [fetch])

  const createTemplate = useCallback(async (data) => {
    const t = await templatesApi.create(data)
    setTemplates((p) => [...p, t])
    return t
  }, [])

  const updateTemplate = useCallback(async (id, data) => {
    const t = await templatesApi.update(id, data)
    setTemplates((p) => p.map((x) => (x.id === id ? t : x)))
    return t
  }, [])

  const deleteTemplate = useCallback(async (id) => {
    await templatesApi.delete(id)
    setTemplates((p) => p.filter((x) => x.id !== id))
  }, [])

  return { templates, loading, error, createTemplate, updateTemplate, deleteTemplate, refresh: fetch }
}
