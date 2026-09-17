// 只分类三语药剂观察，不用原文面板逆推词缀、品质或当前制作结果。
export function flaskTextType(itemClass: string): 'Life' | 'Mana' | null {
  if (/^(?:Life Flasks?|生命药剂|生命藥劑)$/i.test(itemClass)) return 'Life'
  if (/^(?:Mana Flasks?|魔力药剂|魔力藥劑)$/i.test(itemClass)) return 'Mana'
  return null
}
const NUMBER = String.raw`\d+(?:\.\d+)?(?:\(\d+(?:\.\d+)?[-–—]\d+(?:\.\d+)?\))?(?:\s+\(augmented\))?`
const PROPERTIES = [
  new RegExp(
    String.raw`^Recovers ${NUMBER} (?:Life|Mana) over ${NUMBER} Seconds?(?:\s+\(augmented\))?$`,
    'i',
  ),
  new RegExp(String.raw`^Recovers ${NUMBER} (?:Life|Mana) instantly(?:\s+\(augmented\))?$`, 'i'),
  new RegExp(
    String.raw`^Consumes ${NUMBER} of ${NUMBER} Charges on use(?:\s+\(augmented\))?$`,
    'i',
  ),
  new RegExp(`^Currently has ${NUMBER} Charges$`, 'i'),
  new RegExp(
    String.raw`^(?:在\s*)?${NUMBER}\s*秒[内內](?:回复|恢复|回復|恢復)\s*${NUMBER}\s*(?:点|點)?(?:生命|魔力)(?:\s+\(augmented\))?$`,
  ),
  new RegExp(
    String.raw`^(?:立即|立即回复|立即恢复|立即回復|立即恢復)\s*${NUMBER}\s*(?:点|點)?(?:生命|魔力)$`,
  ),
  new RegExp(String.raw`^每次使用[会會][从從]\s*${NUMBER}\s*充能次[数數]中消耗\s*${NUMBER}\s*次$`),
  new RegExp(String.raw`^目前有\s*${NUMBER}\s*充能次[数數]$`),
]
// 中文为工具支持的精确合成语法，客户端原生措辞仍待真机核对。
const USAGE = new Set([
  'Right click to drink. Can only hold charges while in belt. Refills as you kill monsters.',
  '右键点击饮用。只能在腰带中持有充能。击败怪物时会补充充能。',
  '右鍵點擊飲用。只能在腰帶中持有充能。擊敗怪物時會補充充能。',
])
export function isFlaskProperty(text: string, itemClass: string): boolean {
  return (
    (itemClass === '' || flaskTextType(itemClass) !== null) &&
    PROPERTIES.some((pattern) => pattern.test(text))
  )
}
export function isFlaskUsage(text: string, itemClass: string): boolean {
  return flaskTextType(itemClass) !== null && USAGE.has(text)
}
