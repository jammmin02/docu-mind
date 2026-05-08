import { useState, useRef, useEffect } from 'react'
import { Layout } from '../components/layout/Layout'
import { Button } from '../components/ui/Button'
import { useCompanyInfo } from '../hooks/useCompanyInfo'

// ── 공통 스타일 ────────────────────────────────────────────────────────────────
const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent bg-white'
const textareaCls = `${inputCls} resize-none`

// ── 태그 입력 ──────────────────────────────────────────────────────────────────
function TagInput({ value = [], onChange, placeholder }) {
  const [input, setInput] = useState('')
  const ref = useRef(null)

  const add = () => {
    const tag = input.trim()
    if (!tag || value.includes(tag)) { setInput(''); return }
    onChange([...value, tag]); setInput('')
  }
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i))
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add() }
    if (e.key === 'Backspace' && !input && value.length) remove(value.length - 1)
  }

  return (
    <div
      className="min-h-[42px] flex flex-wrap gap-1.5 items-center border border-slate-200 rounded-lg px-3 py-2 cursor-text bg-white focus-within:ring-2 focus-within:ring-primary-400 focus-within:border-transparent"
      onClick={() => ref.current?.focus()}
    >
      {value.map((tag, i) => (
        <span key={i} className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 text-xs px-2 py-0.5 rounded-full border border-primary-100">
          {tag}
          <button type="button" onClick={(e) => { e.stopPropagation(); remove(i) }} className="text-primary-400 hover:text-primary-700 leading-none">×</button>
        </span>
      ))}
      <input ref={ref} value={input} onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKey} onBlur={add}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[100px] outline-none bg-transparent text-sm text-slate-700 placeholder:text-slate-400"
      />
    </div>
  )
}

// ── 필드 래퍼 ─────────────────────────────────────────────────────────────────
function Field({ label, hint, required, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
        {label}
        {required && <span className="text-red-400">*</span>}
        {hint && <span className="text-slate-400 font-normal">· {hint}</span>}
      </label>
      {children}
    </div>
  )
}

// ── 프리셋 칩 선택 (톤 설정용) ────────────────────────────────────────────────
function TonePresets({ presets, value, onSelect }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {presets.map((p) => {
        const active = value?.includes(p)
        return (
          <button
            key={p} type="button"
            onClick={() => {
              if (active) {
                // 이미 포함된 경우 제거
                onSelect(value.replace(p, '').replace(/,\s*,/, ',').replace(/^,\s*|,\s*$/g, '').trim())
              } else {
                onSelect(value ? `${value.trimEnd()}, ${p}` : p)
              }
            }}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              active
                ? 'bg-violet-100 text-violet-700 border-violet-200'
                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}

// ── 섹션 카드 ─────────────────────────────────────────────────────────────────
function Card({ icon, title, desc, accent, children }) {
  return (
    <section className={`rounded-2xl border p-5 shadow-sm space-y-4 ${accent ?? 'bg-white border-slate-100'}`}>
      <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
        {icon && <span className="text-base">{icon}</span>}
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

// ── 2열 그리드 ────────────────────────────────────────────────────────────────
function Grid({ children }) {
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{children}</div>
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
export default function CompanyInfoPage() {
  const { info, loading, saving, error, saveInfo } = useCompanyInfo()

  const [form, setForm] = useState({
    company_name: '', description: '', business_fields: [], main_services: [],
    vision_goals: '', default_report_info: '', report_tone: '', chat_tone: '',
  })
  const [saved, setSaved]       = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => { if (!loading) setForm({ ...info }) }, [loading]) // eslint-disable-line

  const isDirty = JSON.stringify(form) !== JSON.stringify(info)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.company_name?.trim()) { setFormError('회사명은 필수 항목입니다.'); return }
    setFormError(null)
    try {
      await saveInfo(form)
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (err) { setFormError(err.message ?? '저장 중 오류가 발생했습니다.') }
  }

  const REPORT_PRESETS = ['전문적·격식체', '간결·요약형', '학술·논문체', '경영진 대상', '친근한 설명체']
  const CHAT_PRESETS   = ['친절·상냥하게', '간결하게', '전문적으로', '단계별 설명', '예시 위주로']

  return (
    <Layout>
      <div className="h-full overflow-y-auto scrollbar-thin">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">

          {/* 페이지 설명 */}
          <p className="text-xs text-slate-400">
            저장된 정보는 보고서 생성과 AI 채팅 시 자동으로 참고됩니다.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-slate-400 text-sm">불러오는 중...</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* ── 기본 정보 ── */}
              <Card icon="🏢" title="기본 정보" desc="회사를 소개하는 핵심 정보입니다.">
                <Grid>
                  <Field label="회사명" required>
                    <input type="text" value={form.company_name}
                      onChange={(e) => set('company_name', e.target.value)}
                      placeholder="예: (주)에이스솔루션"
                      className={inputCls} />
                  </Field>
                  <Field label="회사 소개">
                    <textarea value={form.description}
                      onChange={(e) => set('description', e.target.value)}
                      placeholder="예: AI 기반 문서 자동화 솔루션을 개발하는 스타트업입니다."
                      rows={3} className={textareaCls} />
                  </Field>
                  <Field label="사업 분야" hint="Enter로 추가">
                    <TagInput value={form.business_fields}
                      onChange={(v) => set('business_fields', v)}
                      placeholder="예: SaaS, AI, 핀테크" />
                  </Field>
                  <Field label="주요 서비스" hint="Enter로 추가">
                    <TagInput value={form.main_services}
                      onChange={(v) => set('main_services', v)}
                      placeholder="예: RAG 문서 분석, 보고서 자동화" />
                  </Field>
                  <div className="lg:col-span-2">
                    <Field label="비전 및 목표">
                      <textarea value={form.vision_goals}
                        onChange={(e) => set('vision_goals', e.target.value)}
                        placeholder="예: 2027년까지 국내 문서 자동화 1위 솔루션으로 성장"
                        rows={2} className={textareaCls} />
                    </Field>
                  </div>
                </Grid>
              </Card>

              {/* ── AI 프롬프트 설정 ── */}
              <Card
                icon="🤖"
                title="AI 프롬프트 설정"
                desc="보고서 작성과 채팅 응답에 적용될 AI의 톤과 지시사항을 설정합니다."
                accent="bg-gradient-to-br from-violet-50 to-slate-50 border-violet-100"
              >
                <Grid>
                  {/* 보고서 톤 */}
                  <Field label="보고서 작성 톤" hint="프리셋 선택 또는 직접 입력">
                    <TonePresets presets={REPORT_PRESETS} value={form.report_tone}
                      onSelect={(v) => set('report_tone', v)} />
                    <textarea value={form.report_tone}
                      onChange={(e) => set('report_tone', e.target.value)}
                      placeholder={'예: 경영진을 대상으로 전문적이고 간결하게 작성하세요.\n수치 데이터는 반드시 출처를 명시하세요.'}
                      rows={4} className={textareaCls} />
                  </Field>

                  {/* 채팅 톤 */}
                  <Field label="채팅 응답 톤" hint="프리셋 선택 또는 직접 입력">
                    <TonePresets presets={CHAT_PRESETS} value={form.chat_tone}
                      onSelect={(v) => set('chat_tone', v)} />
                    <textarea value={form.chat_tone}
                      onChange={(e) => set('chat_tone', e.target.value)}
                      placeholder={'예: 친절하고 이해하기 쉽게 답변하세요.\n전문 용어는 쉬운 말로 풀어서 설명하세요.'}
                      rows={4} className={textareaCls} />
                  </Field>

                  {/* 공통 추가 지시사항 — 전체 너비 */}
                  <div className="lg:col-span-2">
                    <Field label="공통 추가 지시사항" hint="보고서·채팅 모두 적용">
                      <textarea value={form.default_report_info}
                        onChange={(e) => set('default_report_info', e.target.value)}
                        placeholder={'예: 항상 한국어로 답변하세요.\n회사 내부 문서 기반으로만 답변하고, 불확실한 내용은 언급하지 마세요.'}
                        rows={3} className={textareaCls} />
                    </Field>
                  </div>
                </Grid>
              </Card>

              {/* ── 에러 / 저장 완료 ── */}
              {(formError || error) && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                  <span className="shrink-0">⚠️</span><span>{formError || error}</span>
                </div>
              )}
              {saved && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-lg">
                  <span>✓</span><span>저장됐어요. 이후 보고서와 채팅에 반영됩니다.</span>
                </div>
              )}

              {/* ── 저장 버튼 ── */}
              <div className="flex items-center justify-between pb-4">
                <p className="text-xs text-slate-400">
                  {isDirty ? '저장되지 않은 변경 사항이 있어요.' : '모두 최신 상태입니다.'}
                </p>
                <Button type="submit" loading={saving} disabled={!isDirty || saving}>
                  변경 사항 저장
                </Button>
              </div>

            </form>
          )}
        </div>
      </div>
    </Layout>
  )
}
