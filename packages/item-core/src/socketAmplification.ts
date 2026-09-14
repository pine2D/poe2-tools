import { sovereignEffect } from './alloyEffects'
import type { CatalogAugment, CraftCatalog } from './catalog'
import { essenceSourceHash } from './essences'
import type { CraftAffix, CraftState } from './rehearsal'
import { isSupportedArmourRune } from './runeEffects'
import { armourSoulCoreFitsBase, isSupportedSoulCore } from './soulCoreEffects'
import { isSupportedWeaponRune, weaponSocketKind } from './weaponRuneEffects'

const HORROR_MOD = 'EssenceLocalRuneAndSoulCoreEffect1'
const HORROR_ESSENCE = 'Metadata/Items/Currency/CurrencyCorruptedEssenceHorror'
const HORROR_LINE = '60% increased effect of Socketed Augment Items'

/** 仅授权固定目录已核对的恐惧工艺，不按关键词放行其他镶嵌规则。 */
export function isHorrorSocketAffix(
  catalog: CraftCatalog,
  state: CraftState,
  affix: CraftAffix,
): boolean {
  if (affix.modId !== HORROR_MOD || affix.crafted !== true) return false
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base || !['Gloves', 'Boots'].includes(base.type)) return false
  const mod = catalog.modifiers.find((entry) => entry.id === HORROR_MOD)
  const essence = catalog.essences?.find((entry) => entry.id === HORROR_ESSENCE)
  return (
    essenceSourceHash(catalog) !== null &&
    essence?.mods[base.type] === HORROR_MOD &&
    mod?.lines.length === 1 &&
    mod.lines[0] === HORROR_LINE &&
    affix.lines.length === 1 &&
    affix.lines[0] === HORROR_LINE
  )
}

/** 当前已核对的镶嵌物增效；不把未知效果当作已支持倍率。 */
export function socketEffectIncrease(catalog: CraftCatalog, state: CraftState): number | null {
  const sovereign = sovereignEffect(catalog, state, 'socket')
  if (!sovereign.ok) return null
  return state.affixes.some((affix) => isHorrorSocketAffix(catalog, state, affix))
    ? 60
    : sovereign.value
}

/** 返回当前装备上的效果副本；目录、孔内身份与绑定来源保持不变。 */
export function effectiveSocketAugment(
  catalog: CraftCatalog,
  state: CraftState,
  augment: CatalogAugment,
): CatalogAugment | null {
  const increase = socketEffectIncrease(catalog, state)
  if (increase === null) return null
  if (increase === 0) return augment
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  const weapon = base && weaponSocketKind(base)
  if (
    !(weapon
      ? isSupportedWeaponRune(augment, weapon.category) ||
        (weapon.category === 'weapon' &&
          augment.category === 'weapon' &&
          isSupportedSoulCore(augment))
      : isSupportedArmourRune(augment) || (base && armourSoulCoreFitsBase(augment, base)))
  )
    return null
  let valid = true
  // 已完整核对为正整数效果，逐枚逐值增效后向下取整，再由调用方合计。
  const lines = augment.lines.map((line) =>
    line.replace(/\d+/g, (raw) => {
      const scaled = Number(raw) * (100 + increase)
      if (!Number.isSafeInteger(scaled)) valid = false
      return String(Math.floor(scaled / 100))
    }),
  )
  return valid ? { ...augment, lines } : null
}
