import { statHeaderSelector, statSelector } from './stats'
import { userContent } from './user-content'

export const regions = 'header, footer, main, dialog, [role="tooltip"], #mainMenu, #settingsZone'
export const excluded =
  'script, style, #inventoryZone .tabs, input, textarea, select, option, code, pre, [contenteditable], [data-poe2-l10n], [hidden], .hidden, [id*="_ad"]'
export function translatable(node: Text): boolean {
  const parent = node.parentElement
  return (
    !!parent?.closest(regions) &&
    !parent.closest(excluded) &&
    (!parent.closest(statSelector) || !!parent.closest(statHeaderSelector)) &&
    !parent.closest(userContent)
  )
}

// #instructions 来自新版首页公开 DOM；连词不能套用条件组标签。
export function textContext(node: Text): 'instructions' | 'default' {
  return node.parentElement?.closest('#instructions') ? 'instructions' : 'default'
}
export function contextualText(
  original: string,
  context: ReturnType<typeof textContext>,
): string | null {
  if (context !== 'instructions') return null
  const word = original.trim().toLowerCase()
  const translated = word === 'and' ? '与' : word === 'or' ? '或' : null
  return translated === null ? null : original.replace(/\S[\s\S]*\S|\S/, translated)
}
