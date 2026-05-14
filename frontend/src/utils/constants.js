export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export const USER_ROLE = {
  ADMIN: 'admin',
  USER:  'user',
}

export const DOCUMENT_STATUS = {
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
}

export const REPORT_TYPE = {
  SUMMARY: 'summary',
  ANALYSIS: 'analysis',
  MINUTES: 'minutes',
}

export const REPORT_TYPE_LABEL = {
  summary: '요약',
  analysis: '분석',
  minutes: '회의록',
}

export const ACCEPTED_FILE_TYPES = [
  '.pdf', '.docx', '.txt', '.xlsx', '.csv', '.pptx',
]

export const MAX_FILE_SIZE_MB = 50

export const POLL_INTERVALS = {
  FAST: 2000,
  MEDIUM: 5000,
  SLOW: 10000,
  TIMEOUT_MS: 5 * 60 * 1000,
}
