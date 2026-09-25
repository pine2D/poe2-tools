import type { ItemLocale } from './types'

// 国服类别优先采用用户真机样本；台服类别独立核对，不能繁简互转。
const CLASSES: Readonly<Record<string, { en: string; 'zh-CN'?: string; 'zh-TW'?: string }>> = {
  Talisman: { en: 'Talismans' },
  Jewel: { en: 'Jewels' },
  Focus: { en: 'Foci', 'zh-CN': '法器', 'zh-TW': '法器' },
  Sceptre: { en: 'Sceptres', 'zh-CN': '权杖', 'zh-TW': '權杖' },
  Staff: { en: 'Staves', 'zh-CN': '法杖', 'zh-TW': '長杖' },
  Wand: { en: 'Wands', 'zh-TW': '法杖' },
  Belt: { en: 'Belts', 'zh-CN': '腰带', 'zh-TW': '腰帶' },
}
// 保留既有解析别名；同形“法杖”必须由文本语言决定。
const ALIASES: Readonly<Record<string, string>> = {
  魔符: 'Talismans',
  珠宝: 'Jewels',
  珠寶: 'Jewels',
  法器: 'Foci',
  咒符: 'Charms',
  護符: 'Charms',
  权杖: 'Sceptres',
  權杖: 'Sceptres',
  長杖: 'Staves',
  戒指: 'Rings',
  头盔: 'Helmets',
  胸甲: 'Body Armours',
  靴子: 'Boots',
  短杖: 'Wands',
  腰带: 'Belts',
  腰帶: 'Belts',
}
export function itemClassLabel(type: string, locale: ItemLocale): string {
  const entry = Object.hasOwn(CLASSES, type) ? CLASSES[type] : undefined
  return entry?.[locale] ?? entry?.en ?? type
}
export function canonicalItemClass(label: string, locale: ItemLocale): string {
  if (label === '法杖') return locale === 'zh-TW' ? 'Wands' : 'Staves'
  return Object.hasOwn(ALIASES, label) ? (ALIASES[label] as string) : label
}
