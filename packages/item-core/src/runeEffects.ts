import type { CatalogAugment } from './catalog'

export type RuneEffectKey = 'Fire' | 'Cold' | 'Lightning' | 'Defences'
export type RuneEffectTotals = Record<RuneEffectKey, number>

const RESISTANCE = /^\+([1-9]\d*)% to (Fire|Cold|Lightning) Resistance$/
const DEFENCES = /^([1-9]\d*)% increased Armour, Evasion and Energy Shield$/
const TIERS = ['Lesser ', '', 'Greater ', 'Perfect '] as const
const FAMILIES = {
  'Desert Rune': { key: 'Fire', localMod: false },
  'Glacial Rune': { key: 'Cold', localMod: false },
  'Storm Rune': { key: 'Lightning', localMod: false },
  'Iron Rune': { key: 'Defences', localMod: true },
} as const

/** 解析普通防具符文的完整效果；任一未知行都会拒绝，Bonded 不在输入范围内。 */
export function parseRuneEffectTotals(lines: readonly string[]): RuneEffectTotals | null {
  const totals: RuneEffectTotals = { Fire: 0, Cold: 0, Lightning: 0, Defences: 0 }
  for (const line of lines) {
    const resistance = RESISTANCE.exec(line)
    const defences = DEFENCES.exec(line)
    const key = resistance?.[2] ?? (defences ? 'Defences' : undefined)
    const raw = resistance?.[1] ?? defences?.[1]
    if (!key || !raw) return null
    const total = totals[key as RuneEffectKey] + Number(raw)
    if (!Number.isSafeInteger(total)) return null
    totals[key as RuneEffectKey] = total
  }
  return totals
}

/** 身份、类别、本地标志和完整效果语义必须一致。 */
export function isSupportedArmourRune(augment: CatalogAugment): boolean {
  const family = Object.entries(FAMILIES).find(([name]) =>
    TIERS.some((tier) => augment.name === `${tier}${name}`),
  )?.[1]
  if (
    !family ||
    augment.category !== 'armour' ||
    augment.type !== 'Rune' ||
    augment.localMod !== family.localMod ||
    augment.limit !== undefined ||
    augment.limitId !== undefined ||
    augment.isSocketBound === true
  )
    return false
  const totals = parseRuneEffectTotals(augment.lines)
  if (totals === null || augment.lines.length === 0) return false
  return (Object.keys(totals) as RuneEffectKey[]).every((key) =>
    key === family.key ? totals[key] > 0 : totals[key] === 0,
  )
}

export function sumRuneEffects(augments: readonly CatalogAugment[]): RuneEffectTotals | null {
  const totals: RuneEffectTotals = { Fire: 0, Cold: 0, Lightning: 0, Defences: 0 }
  for (const augment of augments) {
    if (!isSupportedArmourRune(augment)) return null
    const contribution = parseRuneEffectTotals(augment.lines)
    if (contribution === null) return null
    for (const key of Object.keys(totals) as RuneEffectKey[]) {
      const total = totals[key] + contribution[key]
      if (!Number.isSafeInteger(total)) return null
      totals[key] = total
    }
  }
  return totals
}
