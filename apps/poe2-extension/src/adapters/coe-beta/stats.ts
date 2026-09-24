// 基于新版公开 DOM；Data 使用分段 .text，制作页使用 .stat。
export const statSelector = '.stat, .modifierTable .row > .label .text'
export function isSupportedStat(element: Element): boolean {
  return (
    element.isConnected &&
    element.matches(statSelector) &&
    !!element.closest('main,dialog') &&
    !element.closest(
      '[data-poe2-l10n], [contenteditable], code, pre, [hidden], .hidden, #inventoryZone .tabs, [id*="_ad"]',
    )
  )
}
