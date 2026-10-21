import { isUserContent } from './user-content'

// 统计表头复用 stat 样式，但内容是界面标签。
export const statHeaderSelector = '.simulatorResultsTable > .header .stat'

// 基于新版公开 DOM；Data 使用分段 .text，制作页使用 .stat。
export const materialDescriptionSelector = '.item.currency .modifier'
export const propertySelector = '.item .property'
// 高级词缀标题及标签也被原站 PoB 导出读取，沿用独立中文层保护英文。
export const modifierDetailsSelector = '.item .modifierDetails'
// 经典词缀没有 .stat，原站POB复制读取这套节点；有高级子节点时不重复叠加。
export const classicModifierSelector = '.item:not(.currency) .modifier'
export const itemNameSelector = '.item:not(.currency) .header .name'
export const statSelector = `${itemNameSelector}, .stat, .modifierTable .row > .label .text, ${materialDescriptionSelector}, ${propertySelector}, ${modifierDetailsSelector}, ${classicModifierSelector}`
// 文字节点或内部类名变化时，整块词缀仍属于词缀层；独立的标签继续归 UI 层。
export const statRegionSelector = '.modGroup, .modifierTable .row > .label'
export function inStatRegion(element: Element): boolean {
  return !!element.closest(statRegionSelector) && !element.closest('.modTag, .tag')
}
export function isSupportedStat(element: Element): boolean {
  return (
    element.isConnected &&
    element.matches(statSelector) &&
    !(element.matches(classicModifierSelector) && element.querySelector('.stat')) &&
    !element.closest(statHeaderSelector) &&
    !!element.closest('main,dialog') &&
    !isUserContent(element) &&
    !element.closest(
      '[data-poe2-l10n], [contenteditable], code, pre, [hidden], .hidden, #inventoryZone .tabs, [id*="_ad"]',
    )
  )
}
