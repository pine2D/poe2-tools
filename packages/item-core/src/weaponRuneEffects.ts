import { ASTRID_LINE, isAstridRune } from './astridRune'
import type { CatalogAugment, CatalogBase } from './catalog'
import { isInfluenceRune } from './influenceRunes'
import { isSerleRune, SERLE_LINE } from './serleRune'
import { isSupportedSoulCore, readSoulCoreLine, WEAPON_SOUL_TOTALS } from './soulCoreEffects'

export type WeaponRuneCategory = 'weapon' | 'wand' | 'staff'

/** 类别和明确手数共同决定分支；Staff 不能单凭显示类别推断。 */
export function weaponSocketKind(
  base: CatalogBase,
): { category: WeaponRuneCategory; limit: number } | null {
  const has = (tag: string) => base.tags.includes(tag)
  if (has('onehand') === has('twohand')) return null
  const limit = has('onehand') ? 1 : 2
  if ((has('one_hand_weapon') && limit !== 1) || (has('two_hand_weapon') && limit !== 2))
    return null
  if (base.type === 'Wand')
    return limit === 1 && has('wand') && !has('staff') && !has('warstaff')
      ? { category: 'wand', limit }
      : null
  if (base.type === 'Staff') {
    if (limit !== 2 || has('staff') === has('warstaff') || has('wand')) return null
    if (has('staff')) return !has('weapon') ? { category: 'staff', limit } : null
    return has('weapon') ? { category: 'weapon', limit } : null
  }
  if (!has('weapon') || has('wand') || has('staff') || has('warstaff')) return null
  const types =
    limit === 1
      ? ['Claw', 'Dagger', 'Flail', 'One Hand Axe', 'One Hand Mace', 'One Hand Sword', 'Spear']
      : ['Two Hand Axe', 'Two Hand Mace', 'Two Hand Sword', 'Bow', 'Crossbow']
  return types.includes(base.type) ? { category: 'weapon', limit } : null
}

const emptyTotals = () => ({
  ...WEAPON_SOUL_TOTALS,
  PhysicalMin: 0,
  PhysicalMax: 0,
  LifeLeech: 0,
  ManaLeech: 0,
  LifeOnKill: 0,
  ManaOnKill: 0,
  StunBuildup: 0,
  Accuracy: 0,
  Strength: 0,
  Dexterity: 0,
  Intelligence: 0,
  EnergyShield: 0,
  Mana: 0,
  EnergyShieldRecharge: 0,
  ManaRegeneration: 0,
  EnergyShieldStunThreshold: 0,
  SpellCritical: 0,
  FireMin: 0,
  FireMax: 0,
  ColdMin: 0,
  ColdMax: 0,
  LightningMin: 0,
  LightningMax: 0,
  ExtraFire: 0,
  ExtraCold: 0,
  ExtraLightning: 0,
  Physical: 0,
  Spell: 0,
})
export type WeaponRuneEffectTotals = ReturnType<typeof emptyTotals>
type Key = keyof WeaponRuneEffectTotals

type Branch = 'weapon' | 'caster'
const METRIC_PATTERNS: readonly (readonly [RegExp, Key, Branch])[] = [
  [/^Leeches ([1-9]\d*)% of Physical Damage as Life$/, 'LifeLeech', 'weapon'],
  [/^Leeches ([1-9]\d*)% of Physical Damage as Mana$/, 'ManaLeech', 'weapon'],
  [/^Gain ([1-9]\d*) Life per enemy killed$/, 'LifeOnKill', 'weapon'],
  [/^Gain ([1-9]\d*) Mana per enemy killed$/, 'ManaOnKill', 'weapon'],
  [/^Causes ([1-9]\d*)% increased Stun Buildup$/, 'StunBuildup', 'weapon'],
  [/^\+([1-9]\d*) to Accuracy Rating$/, 'Accuracy', 'weapon'],
  [/^\+([1-9]\d*) to Strength$/, 'Strength', 'weapon'],
  [/^\+([1-9]\d*) to Dexterity$/, 'Dexterity', 'weapon'],
  [/^\+([1-9]\d*) to Intelligence$/, 'Intelligence', 'weapon'],
  [/^\+([1-9]\d*) to maximum Energy Shield$/, 'EnergyShield', 'caster'],
  [/^\+([1-9]\d*) to maximum Mana$/, 'Mana', 'caster'],
  [/^([1-9]\d*)% increased Energy Shield Recharge Rate$/, 'EnergyShieldRecharge', 'caster'],
  [/^([1-9]\d*)% increased Mana Regeneration Rate$/, 'ManaRegeneration', 'caster'],
  [
    /^Gain additional Stun Threshold equal to ([1-9]\d*)% of maximum Energy Shield$/,
    'EnergyShieldStunThreshold',
    'caster',
  ],
  [/^([1-9]\d*)% increased Critical Hit Chance for Spells$/, 'SpellCritical', 'caster'],
]

/** 固定附加伤害两端独立累加；不把端点视作随机数值区间。 */
export function parseWeaponRuneEffectTotals(
  lines: readonly string[],
  category?: WeaponRuneCategory,
): WeaponRuneEffectTotals | null {
  const totals = emptyTotals()
  let branch: Branch | undefined
  for (const line of lines) {
    if (line === ASTRID_LINE || line === SERLE_LINE || line === 'Can roll Destruction modifiers')
      continue
    const soul = readSoulCoreLine(line, 'weapon')
    const added = /^Adds ([1-9]\d*) to ([1-9]\d*) (Physical|Fire|Cold|Lightning) Damage$/.exec(line)
    const extra = /^Gain ([1-9]\d*)% of Damage as Extra (Fire|Cold|Lightning) Damage$/.exec(line)
    const increased = /^([1-9]\d*)% increased (Physical|Spell) Damage$/.exec(line)
    let metric: { key: Key; value: number; branch: Branch } | undefined = soul
      ? { key: soul.key as Key, value: soul.value, branch: 'weapon' }
      : undefined
    for (const [pattern, key, kind] of METRIC_PATTERNS) {
      const match = pattern.exec(line)
      if (match) {
        metric = { key, value: Number(match[1]), branch: kind }
        break
      }
    }
    if (!added && !extra && !increased && !metric) return null
    const nextBranch =
      metric?.branch ?? (added || increased?.[2] === 'Physical' ? 'weapon' : 'caster')
    if (
      (branch && branch !== nextBranch) ||
      (category && (category === 'weapon') !== (nextBranch === 'weapon'))
    )
      return null
    branch = nextBranch
    const contributions: [Key, number][] = added
      ? [
          [`${added[3]}Min` as Key, Number(added[1])],
          [`${added[3]}Max` as Key, Number(added[2])],
        ]
      : extra
        ? [[`Extra${extra[2]}` as Key, Number(extra[1])]]
        : metric
          ? [[metric.key, metric.value]]
          : [[increased?.[2] as Key, Number(increased?.[1])]]
    if (added && Number(added[1]) > Number(added[2])) return null
    for (const [key, value] of contributions) {
      if (!Number.isSafeInteger(value) || !Number.isSafeInteger(totals[key] + value)) return null
      totals[key] += value
    }
  }
  return totals
}

interface FamilyEffect {
  keys: readonly Key[]
  localMod: boolean
}
const ATTACK_FAMILIES: Record<string, FamilyEffect> = {
  Body: { keys: ['LifeLeech'], localMod: true },
  Mind: { keys: ['ManaLeech'], localMod: true },
  Rebirth: { keys: ['LifeOnKill'], localMod: false },
  Inspiration: { keys: ['ManaOnKill'], localMod: false },
  Stone: { keys: ['StunBuildup'], localMod: true },
  Vision: { keys: ['Accuracy'], localMod: true },
  Robust: { keys: ['Strength'], localMod: false },
  Adept: { keys: ['Dexterity'], localMod: false },
  Resolve: { keys: ['Intelligence'], localMod: false },
  Tempered: { keys: ['PhysicalMin', 'PhysicalMax'], localMod: true },
}
const CASTER_FAMILIES: Record<string, FamilyEffect> = {
  Body: { keys: ['EnergyShield'], localMod: false },
  Mind: { keys: ['Mana'], localMod: false },
  Rebirth: { keys: ['EnergyShieldRecharge'], localMod: false },
  Inspiration: { keys: ['ManaRegeneration'], localMod: false },
  Stone: { keys: ['EnergyShieldStunThreshold'], localMod: false },
  Vision: { keys: ['SpellCritical'], localMod: false },
}

/** 精确家族、类别、本地标志及完整单行效果一致；不启用 Bonded。 */
export function isSupportedWeaponRune(
  augment: CatalogAugment,
  category: WeaponRuneCategory,
): boolean {
  if (
    isAstridRune(augment) ||
    isSerleRune(augment) ||
    (isInfluenceRune(augment) && augment.name === "Thrud's Might")
  )
    return augment.category === (category === 'weapon' ? 'weapon' : 'caster')
  const family =
    /^(?:Lesser |Greater |Perfect )?(Desert|Glacial|Storm|Iron|Body|Mind|Rebirth|Inspiration|Stone|Vision|Robust|Adept|Resolve|Tempered) Rune$/.exec(
      augment.name,
    )?.[1]
  if (!family) return false
  const special = (category === 'weapon' ? ATTACK_FAMILIES : CASTER_FAMILIES)[family]
  const element = { Desert: 'Fire', Glacial: 'Cold', Storm: 'Lightning' }[family]
  if (!special && !element && family !== 'Iron') return false
  if (family === 'Tempered' && augment.name === 'Perfect Tempered Rune') return false
  if (
    augment.category !== category ||
    augment.type !== 'Rune' ||
    augment.localMod !== (special?.localMod ?? category === 'weapon') ||
    augment.limit !== undefined ||
    augment.limitId !== undefined ||
    augment.isSocketBound === true ||
    augment.lines.length !== 1
  )
    return false
  const totals = parseWeaponRuneEffectTotals(augment.lines, category)
  if (!totals) return false
  const keys: readonly string[] =
    special?.keys ??
    (family === 'Iron'
      ? [category === 'weapon' ? 'Physical' : 'Spell']
      : category === 'weapon'
        ? [`${element}Min`, `${element}Max`]
        : [`Extra${element}`])
  return Object.entries(totals).every(([key, value]) =>
    keys.includes(key) ? value > 0 : value === 0,
  )
}

/** v57 新接通的武器效果，用于完整旧项目门禁。 */
export function isExtendedWeaponRune(augment: CatalogAugment): boolean {
  return (
    ['weapon', 'wand', 'staff'].includes(augment.category) &&
    isSupportedWeaponRune(augment, augment.category as WeaponRuneCategory) &&
    !/^(?:Lesser |Greater |Perfect )?(Desert|Glacial|Storm|Iron) Rune$/.test(augment.name)
  )
}

export function sumWeaponRuneEffects(
  augments: readonly CatalogAugment[],
  category: WeaponRuneCategory,
): WeaponRuneEffectTotals | null {
  if (
    !augments.every(
      (augment) =>
        isSupportedWeaponRune(augment, category) ||
        (category === 'weapon' && augment.category === 'weapon' && isSupportedSoulCore(augment)),
    )
  )
    return null
  return parseWeaponRuneEffectTotals(
    augments.flatMap((augment) => augment.lines),
    category,
  )
}
