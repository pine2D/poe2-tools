import type { Lexicon, Term } from '@poe2-tools/l10n-core'

const controls: readonly [string, Term['domain']][] = [
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
  const candidates = lexicon.search(input.value, domain)
  if (!isConditionSearch(input)) return candidates
  // 只使用原站保留的英文搜索属性，不读取已经叠加中文的可见文本。
  const options = [...(input.closest('.dropdown')?.querySelectorAll('li[search]') ?? [])].map(
    (option) => option.getAttribute('search')?.toLowerCase() ?? '',
  )
  return [...candidates, ...lexicon.search(input.value, 'ui')].filter((candidate) =>
    options.some((option) => option.includes(candidate.term.en.toLowerCase())),
  )
}
export function searchDomain(input: HTMLInputElement): Term['domain'] | null {
  if (isConditionSearch(input)) return 'stat'
  return controls.find(([selector]) => input.matches(selector))?.[1] ?? null
}
export function submitSearch(input: HTMLInputElement, english: string) {
  input.value = english
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Unidentified', bubbles: true }))
}
