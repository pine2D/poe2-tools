import type { Lexicon, Term } from '@poe2-tools/l10n-core'
import type { SearchArea } from '../../protocol'

const controls: readonly [string, Term['domain']][] = [
  // 价格页复用词缀框ID，必须先按公开父容器识别材料用途。
  ['#customPriceSearchHolder #searchInput input[type="text"]', 'item'],
  ['#searchItemInput input[type="text"], #searchItemInput input:not([type])', 'base'],
  ['#searchInput input[type="text"], #searchInput input:not([type])', 'stat'],
  ['#dataItemSearchInput input[type="text"], #dataItemSearchInput input:not([type])', 'base'],
  ['#dataModSearchInput input[type="text"], #dataModSearchInput input:not([type])', 'stat'],
]
export function isConditionSearch(input: HTMLInputElement): boolean {
  return (
    input.matches(
      '#simulatorConditionRequirements .dropdown .editing input[type="text"], #calculatorZone .requirements .dropdown .editing input[type="text"]',
    ) && !input.closest('.dropdown')?.classList.contains('hidden')
  )
}
export function searchCandidates(input: HTMLInputElement, lexicon: Lexicon) {
  const domain = searchDomain(input)
  if (!domain) return []
  if (input.closest('#dataItemSearchInput')) {
    // Data 物品列表包含通货；制作页的基底选择器仍只查询 base。
    return lexicon.search(input.value, [domain, 'item'])
  }
  if (!isConditionSearch(input)) return lexicon.search(input.value, domain)
  // 只使用原站保留的英文搜索属性，不读取已经叠加中文的可见文本。
  const options = [...(input.closest('.dropdown')?.querySelectorAll('li[search]') ?? [])].map(
    (option) => option.getAttribute('search')?.toLowerCase() ?? '',
  )
  const accept = (term: Term) => options.some((option) => option.includes(term.en.toLowerCase()))
  return [
    ...lexicon.search(input.value, domain, accept),
    ...lexicon.search(input.value, 'ui', accept),
  ]
}
export function searchDomain(input: HTMLInputElement): Term['domain'] | null {
  if (input.readOnly || input.matches(':disabled')) return null
  if (isConditionSearch(input)) return 'stat'
  return controls.find(([selector]) => input.matches(selector))?.[1] ?? null
}
// 仅为适配器已识别的搜索用途补可访问名称，不写入输入值或原生检索属性。
export function searchLabel(input: HTMLInputElement): readonly [string, string] | null {
  const domain = searchDomain(input)
  if (!domain) return null
  if (isConditionSearch(input)) return ['搜索条件', 'Search conditions']
  if (input.closest('#dataItemSearchInput')) return ['搜索物品', 'Search items']
  if (domain === 'item') return ['搜索制作材料价格', 'Search crafting prices']
  if (domain === 'base') return ['搜索制作基底', 'Search crafting bases']
  return ['搜索词缀', 'Search modifiers']
}
export function submitSearch(input: HTMLInputElement, english: string) {
  input.value = english
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Unidentified', bubbles: true }))
}
// 认得的搜索容器与其用途，域与 controls 一致；价格页复用 #searchInput，须先按父容器认成材料价格。
const containers: readonly [string, SearchArea][] = [
  ['#customPriceSearchHolder #searchInput', 'item'],
  ['#searchItemInput', 'base'],
  ['#searchInput', 'stat'],
  ['#dataItemSearchInput', 'base'],
  ['#dataModSearchInput', 'stat'],
]
const AREA_ORDER: readonly SearchArea[] = ['base', 'stat', 'item']
/**
 * 弹窗“部分生效”判据（第三期裁定 6）：认得的容器在页上、其中却没有 controls 认得的输入框 → missing。
 * 不用 searchDomain：它对只读或禁用的输入框返回 null，原站临时禁用会被误报。条件下拉搜索不纳入。
 * 原站把容器 ID 一起改掉时测不出（会报 none），compatibility.md 照实写明。
 */
export function searchPresence(doc: Document): {
  search: 'ok' | 'missing' | 'none'
  missing: SearchArea[]
} {
  const seen = new Set<Element>()
  const missing = new Set<SearchArea>()
  for (const [selector, area] of containers)
    for (const container of doc.querySelectorAll(selector)) {
      if (seen.has(container)) continue
      seen.add(container)
      const wired = [...container.querySelectorAll('input')].some((input) =>
        controls.some(([control]) => input.matches(control)),
      )
      if (!wired) missing.add(area)
    }
  if (seen.size === 0) return { search: 'none', missing: [] }
  const list = AREA_ORDER.filter((area) => missing.has(area))
  return { search: list.length > 0 ? 'missing' : 'ok', missing: list }
}
