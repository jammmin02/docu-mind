import { useState, useEffect, useCallback } from 'react'
import { companyApi } from '../api/company'

const EMPTY = {
  company_name:        '',
  description:         '',
  business_fields:     [],
  main_services:       [],
  vision_goals:        '',
  default_report_info: '',
  report_tone:         '',
  chat_tone:           '',
}

/**
 * 회사 기본 정보 관리 훅
 *
 * 반환값:
 *  info          - 현재 저장된 회사 정보 객체
 *  loading       - 로딩 중 여부
 *  saving        - 저장 중 여부
 *  error         - 에러 메시지
 *  saveInfo(data) - 저장 (async)
 *  refresh()      - 재로드
 */
export function useCompanyInfo() {
  const [info, setInfo]     = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await companyApi.get()
      setInfo({
        company_name:        data.company_name        ?? '',
        description:         data.description         ?? '',
        business_fields:     data.business_fields     ?? [],
        main_services:       data.main_services       ?? [],
        vision_goals:        data.vision_goals        ?? '',
        default_report_info: data.default_report_info ?? '',
        report_tone:         data.report_tone         ?? '',
        chat_tone:           data.chat_tone           ?? '',
      })
    } catch (e) {
      setError(e.message ?? '회사 정보 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const saveInfo = useCallback(async (data) => {
    try {
      setSaving(true)
      setError(null)
      const updated = await companyApi.update(data)
      setInfo({
        company_name:        updated.company_name        ?? '',
        description:         updated.description         ?? '',
        business_fields:     updated.business_fields     ?? [],
        main_services:       updated.main_services       ?? [],
        vision_goals:        updated.vision_goals        ?? '',
        default_report_info: updated.default_report_info ?? '',
        report_tone:         updated.report_tone         ?? '',
        chat_tone:           updated.chat_tone           ?? '',
      })
      return updated
    } catch (e) {
      setError(e.message ?? '저장 실패')
      throw e
    } finally {
      setSaving(false)
    }
  }, [])

  return { info, loading, saving, error, saveInfo, refresh: fetch }
}
