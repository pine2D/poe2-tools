import type { CatalogAugment } from './catalog'

export const COMBAT_ARMOUR_TOTALS = {
  PhysicalThornsMin: 0,
  PhysicalThornsMax: 0,
  LightningThornsMin: 0,
  LightningThornsMax: 0,
  MinionPhysicalAsLightning: 0,
  DebuffExpiry: 0,
  ShockReduction: 0,
}
type CombatKey = keyof typeof COMBAT_ARMOUR_TOTALS
const RULES: readonly { names: readonly string[]; pattern: RegExp; keys: readonly CombatKey[] }[] =
  [
    {
      names: ['Lesser Tempered Rune', 'Tempered Rune', 'Greater Tempered Rune'],
      pattern: /^([1-9]\d*) to ([1-9]\d*) Physical Thorns damage$/,
      keys: ['PhysicalThornsMin', 'PhysicalThornsMax'],
    },
    {
      names: ['Greater Rune of Tithing'],
      pattern: /^([1-9]\d*) to ([1-9]\d*) Lightning Thorns damage$/,
      keys: ['LightningThornsMin', 'LightningThornsMax'],
    },
    {
      names: ['Greater Rune of Leadership'],
      pattern: /^Minions take ([1-9]\d*)% of Physical Damage as Lightning Damage$/,
      keys: ['MinionPhysicalAsLightning'],
    },
    {
      names: ['Greater Rune of Alacrity'],
      pattern: /^Debuffs on you expire ([1-9]\d*)% faster$/,
      keys: ['DebuffExpiry'],
    },
    {
      names: ['Greater Rune of Nobility'],
      pattern: /^([1-9]\d*)% reduced effect of Shock on you$/,
      keys: ['ShockReduction'],
    },
  ]

/** 完整语义匹配；伤害两端分别记录，不解释成制作范围或武器点伤。 */
export function readCombatArmourRuneLine(line: string): Partial<Record<CombatKey, number>> | null {
  for (const rule of RULES) {
    const match = rule.pattern.exec(line)
    if (!match) continue
    const values = match.slice(1).map(Number)
    if (values.some((value) => !Number.isSafeInteger(value))) return null
    if (values.length === 2 && (values[0] as number) > (values[1] as number)) return null
    return Object.fromEntries(rule.keys.map((key, index) => [key, values[index]]))
  }
  return null
}

/** 名称、普通防具分支及完整效果同时授权；绑定附加效果不参与。 */
export function isCombatArmourRune(augment: CatalogAugment): boolean {
  if (
    augment.type !== 'Rune' ||
    augment.category !== 'armour' ||
    augment.localMod !== false ||
    augment.limit !== undefined ||
    augment.limitId !== undefined ||
    augment.isSocketBound === true ||
    augment.lines.length !== 1
  )
    return false
  const line = augment.lines[0] as string
  return (
    RULES.some((rule) => rule.names.includes(augment.name) && rule.pattern.test(line)) &&
    readCombatArmourRuneLine(line) !== null
  )
}
