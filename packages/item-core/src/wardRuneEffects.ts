import type { CatalogAugment } from './catalog'

type WardRuneKey = 'Ward' | 'WardRegeneration'
const TIERS = ['Lesser ', '', 'Greater ', 'Perfect '] as const
const RULES = [
  {
    name: 'Ward Rune',
    key: 'Ward',
    localMod: true,
    pattern: /^\+([1-9]\d*) to maximum Runic Ward$/,
  },
  {
    name: 'Charging Rune',
    key: 'WardRegeneration',
    localMod: false,
    pattern: /^([1-9]\d*)% increased Runic Ward Regeneration Rate$/,
  },
] as const

/** 最大结界平值与再生提高分别读取，只接受完整的正整数效果。 */
export function readWardRuneLine(line: string): Partial<Record<WardRuneKey, number>> | null {
  for (const rule of RULES) {
    const match = rule.pattern.exec(line)
    if (!match) continue
    const value = Number(match[1])
    return Number.isSafeInteger(value) ? { [rule.key]: value } : null
  }
  return null
}

/** 仅授权八种普通防具符文；绑定分支与限制不能混入普通效果。 */
export function isWardArmourRune(augment: CatalogAugment): boolean {
  if (
    augment.type !== 'Rune' ||
    augment.category !== 'armour' ||
    augment.limit !== undefined ||
    augment.limitId !== undefined ||
    augment.isSocketBound === true ||
    augment.lines.length !== 1
  )
    return false
  const line = augment.lines[0] as string
  return RULES.some(
    (rule) =>
      TIERS.some((tier) => augment.name === `${tier}${rule.name}`) &&
      augment.localMod === rule.localMod &&
      rule.pattern.test(line) &&
      readWardRuneLine(line) !== null,
  )
}
