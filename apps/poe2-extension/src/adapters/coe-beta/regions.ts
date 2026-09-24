export const regions = 'header, footer, main, dialog, [role="tooltip"], #mainMenu, #settingsZone'
export const excluded =
  'script, style, .stat, #inventoryZone .tabs, input, textarea, select, option, code, pre, [contenteditable], [data-poe2-l10n], [hidden], .hidden, [id*="_ad"]'
export function translatable(node: Text): boolean {
  const parent = node.parentElement
  return !!parent?.closest(regions) && !parent.closest(excluded)
}
