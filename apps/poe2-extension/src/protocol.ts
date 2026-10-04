// 弹窗 ↔ 内容脚本的当前页状态协议（第三期裁定 1）：内容脚本只回事实，状态由弹窗推导。
// 不含网址、页面文字与原始报错；弹窗遇到不认识的版本或取值一律按无应答处理。
export const PAGE_STATE_TYPE = 'poe2-l10n/page-state'
export type SearchArea = 'base' | 'stat' | 'item'
export interface PageStateRequest {
  type: typeof PAGE_STATE_TYPE
  v: 1
}
export interface PageStateReply {
  v: 1
  phase: 'starting' | 'ready' | 'failed'
  error: 'dictionary' | 'settings' | 'other' | null
  page: 'supported' | 'english-required' | 'unsupported' | 'unknown'
  enabled: boolean
  translated: number
  search: 'ok' | 'missing' | 'none'
  searchMissing: readonly SearchArea[]
}
const PHASES = ['starting', 'ready', 'failed'] as const
const ERRORS = ['dictionary', 'settings', 'other'] as const
const PAGES = ['supported', 'english-required', 'unsupported', 'unknown'] as const
const SEARCHES = ['ok', 'missing', 'none'] as const
const AREAS = ['base', 'stat', 'item'] as const
function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
}
/** 逐字段校验应答；缺字段、取值越界或 v≠1 返回 null，多余字段丢弃 */
export function parseReply(value: unknown): PageStateReply | null {
  if (!value || typeof value !== 'object') return null
  const { v, phase, error, page, enabled, translated, search, searchMissing } = value as Record<
    string,
    unknown
  >
  if (
    v !== 1 ||
    !oneOf(PHASES, phase) ||
    !(error === null || oneOf(ERRORS, error)) ||
    !oneOf(PAGES, page) ||
    typeof enabled !== 'boolean' ||
    typeof translated !== 'number' ||
    !Number.isSafeInteger(translated) ||
    translated < 0 ||
    !oneOf(SEARCHES, search) ||
    !Array.isArray(searchMissing) ||
    !searchMissing.every((area): area is SearchArea => oneOf(AREAS, area))
  )
    return null
  return {
    v: 1,
    phase,
    error,
    page,
    enabled,
    translated,
    search,
    searchMissing: [...searchMissing],
  }
}
