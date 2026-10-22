const NUMBER = String.raw`\d+(?:\.\d+)?(?:\(\d+(?:\.\d+)?[-–—]\d+(?:\.\d+)?\))?(?:\s+\(augmented\))?`
const DURATION = new RegExp(String.raw`^(?:持续|持續)\s+(${NUMBER})\s+秒$`)
const CHARGES = new RegExp(
  String.raw`^每次使用[会會][从從]\s+(${NUMBER})\s+充能次[数數]中消耗\s+(${NUMBER})\s+次$`,
)
const CURRENT = new RegExp(String.raw`^目前有\s+(${NUMBER})\s+充能次[数數]$`)
const ENGLISH = [
  new RegExp(`^Lasts ${NUMBER} Seconds?$`, 'i'),
  new RegExp(`^Consumes ${NUMBER} of ${NUMBER} Charges on use$`, 'i'),
  new RegExp(`^Currently has ${NUMBER} Charges$`, 'i'),
  /^Immune to Stun$/i,
]

export function isCharmClass(itemClass: string): boolean {
  return /^(?:咒符|護符|Charms?)$/i.test(itemClass)
}

/** 咒符面板只是原文观察值；消耗与总充能必须按英文位置交换，不计算效果。 */
export function translateCharmProperty(raw: string, itemClass: string): string | null {
  if (!isCharmClass(itemClass)) return null
  const text = raw.trim()
  const duration = DURATION.exec(text)
  if (duration) return `Lasts ${duration[1]} Seconds`
  const charges = CHARGES.exec(text)
  if (charges) return `Consumes ${charges[2]} of ${charges[1]} Charges on use`
  const current = CURRENT.exec(text)
  if (current) return `Currently has ${current[1]} Charges`
  if (/^免疫(?:晕眩|暈眩)$/.test(text)) return 'Immune to Stun'
  return ENGLISH.some((pattern) => pattern.test(text)) ? text : null
}

export function isCharmUsage(text: string, itemClass: string): boolean {
  return (
    isCharmClass(itemClass) &&
    text === '满足条件时自动使用。只有装备于腰带上时才会充能。可通过水井或击败怪物补充。'
  )
}
