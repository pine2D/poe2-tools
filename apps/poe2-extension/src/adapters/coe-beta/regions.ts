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

// 来自新版公开 DOM；说明连词和介绍片段只在各自区域使用。
export function textContext(node: Text): 'instructions' | 'introduction' | 'default' {
  if (node.parentElement?.closest('#instructions')) return 'instructions'
  if (
    node.ownerDocument.location.pathname === '/whats-new' &&
    node.parentElement?.closest('main .messageBox')
  )
    return 'introduction'
  return 'default'
}
const introduction = new Map([
  ['is a complete refactor of', '是对'],
  [
    'aiming to fix the lingering issues of the old site as well as adding every possible crafting methods that were missing.',
    '的全面重构，旨在解决旧站长期存在的问题，并尽可能补齐此前缺少的制作方式。',
  ],
  ['The following is a shortlist of what is', '以下简要介绍'],
  ['new', '新增功能'],
  ['. Please consult the', '。如需了解我正在开发的内容，请查看'],
  ['page to see what I am working on.', '页面。'],
])
export function contextualText(
  original: string,
  context: ReturnType<typeof textContext>,
): string | null {
  const normalized = original.trim().replace(/\s+/g, ' ')
  const word = normalized.toLowerCase()
  const translated =
    context === 'introduction'
      ? (introduction.get(normalized) ?? null)
      : context === 'instructions'
        ? word === 'and'
          ? '与'
          : word === 'or'
            ? '或'
            : null
        : null
  return translated === null ? null : original.replace(/\S[\s\S]*\S|\S/, translated)
}
