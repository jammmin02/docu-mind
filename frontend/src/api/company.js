import api from './client'

export const companyApi = {
  /** 회사 기본 정보 조회 */
  get() {
    return api.get('/company')
  },

  /** 회사 기본 정보 저장 (PUT) */
  update(data) {
    return api.put('/company', data)
  },

  /** 보고서 생성용 컨텍스트 문자열 조회 */
  getContext() {
    return api.get('/company/context')
  },
}
