// 仅这些属性与区域选择器有关；普通 hover/selected 样式不触发重扫。
export const boundaryAttributes = [
  'class',
  'id',
  'hidden',
  'contenteditable',
  'role',
  'type',
  'simulationid',
]
const boundaryClasses = [
  'hidden',
  'tag',
  'item',
  'property',
  'filterFeedback',
  'messageBox',
  'message',
  'stat',
  'modifierTable',
  'row',
  'label',
  'text',
  'tabs',
  'title',
  'header',
  'simulationsList',
  'simulatorStep',
  'simulatorResultsTable',
]
export function boundaryChanged(record: MutationRecord): boolean {
  if (record.type !== 'attributes' || !boundaryAttributes.includes(record.attributeName ?? ''))
    return false
  if (record.attributeName !== 'class') return true
  const before = new Set((record.oldValue ?? '').split(/\s+/))
  const after = (record.target as Element).classList
  return boundaryClasses.some((name) => before.has(name) !== after.contains(name))
}
