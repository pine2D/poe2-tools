import type { CatalogAugment, CatalogBase } from './catalog'

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

/** 固定附加伤害两端独立累加；不把端点视作随机数值区间。 */
export function parseWeaponRuneEffectTotals(
  lines: readonly string[],
  category?: WeaponRuneCategory,
): WeaponRuneEffectTotals | null {
  const totals = emptyTotals()
  let branch: 'weapon' | 'caster' | undefined
  for (const line of lines) {
    const added = /^Adds ([1-9]\d*) to ([1-9]\d*) (Fire|Cold|Lightning) Damage$/.exec(line)
    const extra = /^Gain ([1-9]\d*)% of Damage as Extra (Fire|Cold|Lightning) Damage$/.exec(line)
    const increased = /^([1-9]\d*)% increased (Physical|Spell) Damage$/.exec(line)
    if (!added && !extra && !increased) return null
    const nextBranch = added || increased?.[2] === 'Physical' ? 'weapon' : 'caster'
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
        : [[increased?.[2] as Key, Number(increased?.[1])]]
    if (added && Number(added[1]) > Number(added[2])) return null
    for (const [key, value] of contributions) {
      if (!Number.isSafeInteger(value) || !Number.isSafeInteger(totals[key] + value)) return null
      totals[key] += value
    }
  }
  return totals
}

/** 只接收四族四档的对应完整普通效果，不启用 Bonded。 */
export function isSupportedWeaponRune(
  augment: CatalogAugment,
  category: WeaponRuneCategory,
): boolean {
  const family = /^(?:Lesser |Greater |Perfect )?(Desert|Glacial|Storm|Iron) Rune$/.exec(
    augment.name,
  )?.[1]
  if (
    !family ||
    augment.category !== category ||
    augment.type !== 'Rune' ||
    augment.localMod !== (category === 'weapon') ||
    augment.limit !== undefined ||
    augment.limitId !== undefined ||
    augment.isSocketBound === true ||
    augment.lines.length !== 1
  )
    return false
  const totals = parseWeaponRuneEffectTotals(augment.lines, category)
  if (!totals) return false
  const element = { Desert: 'Fire', Glacial: 'Cold', Storm: 'Lightning' }[family]
  const keys =
    family === 'Iron'
      ? [category === 'weapon' ? 'Physical' : 'Spell']
      : category === 'weapon'
        ? [`${element}Min`, `${element}Max`]
        : [`Extra${element}`]
  return Object.entries(totals).every(([key, value]) =>
    keys.includes(key) ? value > 0 : value === 0,
  )
}

export function sumWeaponRuneEffects(
  augments: readonly CatalogAugment[],
  category: WeaponRuneCategory,
): WeaponRuneEffectTotals | null {
  if (!augments.every((augment) => isSupportedWeaponRune(augment, category))) return null
  return parseWeaponRuneEffectTotals(
    augments.flatMap((augment) => augment.lines),
    category,
  )
}
