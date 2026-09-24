import type { Term } from '@poe2-tools/l10n-core'

const controls: readonly [string, Term['domain']][] = [
  ['#searchItemInput input[type="text"], #searchItemInput input:not([type])', 'base'],
  ['#searchInput input[type="text"], #searchInput input:not([type])', 'stat'],
  ['#dataItemSearchInput input[type="text"], #dataItemSearchInput input:not([type])', 'base'],
  ['#dataModSearchInput input[type="text"], #dataModSearchInput input:not([type])', 'stat'],
]
export function searchDomain(input: HTMLInputElement): Term['domain'] | null {
  return controls.find(([selector]) => input.matches(selector))?.[1] ?? null
}
export function submitSearch(input: HTMLInputElement, english: string) {
  input.value = english
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Unidentified', bubbles: true }))
}
