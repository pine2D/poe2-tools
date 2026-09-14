import type { CatalogAugment, CatalogBase } from './catalog'

export const ARMOUR_SOUL_TOTALS = {
  Chaos: 0,
  GoldQuantity: 0,
  SlowReduction: 0,
  ConvertStrength: 0,
  ConvertDexterity: 0,
  ConvertIntelligence: 0,
}
export const WEAPON_SOUL_TOTALS = {
  PoisonMagnitude: 0,
  ElementalAttackDamage: 0,
  Spirit: 0,
  AttackSpeed: 0,
  ConvertStrength: 0,
  ConvertDexterity: 0,
  ConvertIntelligence: 0,
}
type SoulKey = keyof typeof ARMOUR_SOUL_TOTALS | keyof typeof WEAPON_SOUL_TOTALS | 'AllElemental'
interface SoulRule {
  name: string
  category: string
  localMod: boolean
  key: SoulKey
  pattern: RegExp
}
const RULES: readonly SoulRule[] = [
  {
    name: 'Tacati',
    category: 'weapon',
    localMod: false,
    key: 'PoisonMagnitude',
    pattern: /^([1-9]\d*)% increased Magnitude of Poison you inflict$/,
  },
  {
    name: 'Tacati',
    category: 'armour',
    localMod: false,
    key: 'Chaos',
    pattern: /^\+([1-9]\d*)% to Chaos Resistance$/,
  },
  {
    name: 'Citaqualotl',
    category: 'weapon',
    localMod: false,
    key: 'ElementalAttackDamage',
    pattern: /^([1-9]\d*)% increased Elemental Damage with Attacks$/,
  },
  {
    name: 'Citaqualotl',
    category: 'armour',
    localMod: false,
    key: 'AllElemental',
    pattern: /^\+([1-9]\d*)% to all Elemental Resistances$/,
  },
  {
    name: 'Azcapa',
    category: 'weapon',
    localMod: false,
    key: 'Spirit',
    pattern: /^\+([1-9]\d*) to Spirit$/,
  },
  {
    name: 'Azcapa',
    category: 'gloves',
    localMod: false,
    key: 'GoldQuantity',
    pattern: /^([1-9]\d*)% increased Quantity of Gold Dropped by Slain Enemies$/,
  },
  {
    name: 'Quipolatl',
    category: 'weapon',
    localMod: true,
    key: 'AttackSpeed',
    pattern: /^([1-9]\d*)% increased Attack Speed$/,
  },
  {
    name: 'Quipolatl',
    category: 'boots',
    localMod: false,
    key: 'SlowReduction',
    pattern: /^([1-9]\d*)% reduced Slowing Potency of Debuffs on You$/,
  },
  ...(['weapon', 'armour'] as const).flatMap((category) => [
    {
      name: 'Atmohua',
      category,
      localMod: true,
      key: 'ConvertStrength' as const,
      pattern: /^Convert ([1-9]\d*)% of Requirements to Strength$/,
    },
    {
      name: 'Cholotl',
      category,
      localMod: true,
      key: 'ConvertDexterity' as const,
      pattern: /^Convert ([1-9]\d*)% of Requirements to Dexterity$/,
    },
    {
      name: 'Zantipi',
      category,
      localMod: true,
      key: 'ConvertIntelligence' as const,
      pattern: /^Convert ([1-9]\d*)% of Requirements to Intelligence$/,
    },
  ]),
]

/** 同一行的完整语义与正整数值；不猜测限制、绑定或未知多行效果。 */
export function readSoulCoreLine(
  line: string,
  branch: 'weapon' | 'armour',
): { key: SoulKey; value: number } | null {
  for (const rule of RULES) {
    if ((rule.category === 'weapon') !== (branch === 'weapon')) continue
    const match = rule.pattern.exec(line)
    if (match && Number.isSafeInteger(Number(match[1])))
      return { key: rule.key, value: Number(match[1]) }
  }
  return null
}

export function isSupportedSoulCore(augment: CatalogAugment): boolean {
  if (
    augment.type !== 'SoulCore' ||
    augment.limit !== undefined ||
    augment.limitId !== undefined ||
    augment.isSocketBound === true ||
    augment.lines.length !== 1
  )
    return false
  const rule = RULES.find(
    (r) =>
      augment.name === `Soul Core of ${r.name}` &&
      augment.category === r.category &&
      augment.localMod === r.localMod,
  )
  const match = rule?.pattern.exec(augment.lines[0] ?? '')
  return match !== undefined && match !== null && Number.isSafeInteger(Number(match[1]))
}

/** 防具通用效果和手套／鞋专属效果分开，施法武器不借用攻击武器分支。 */
export function armourSoulCoreFitsBase(augment: CatalogAugment, base: CatalogBase): boolean {
  return (
    isSupportedSoulCore(augment) &&
    ['Body Armour', 'Helmet', 'Gloves', 'Boots', 'Focus', 'Shield', 'Buckler'].includes(
      base.type,
    ) &&
    (augment.category === 'armour' || augment.category === base.type.toLowerCase())
  )
}
