import { sovereignEffect } from './alloyEffects'
import { armourIdolFits, isArmourIdolId, scaleArmourIdol } from './armourIdols'
import { ASTRID_LINE, isAstridRune } from './astridRune'
import type { CatalogAugment, CraftCatalog } from './catalog'
import { isConditionalArmourRune } from './conditionalArmourRunes'
import { astridFitsBase } from './craftedCapacity'
import { essenceSourceHash } from './essences'
import { isRebirthArmourRune } from './extendedArmourRuneEffects'
import { influenceRuneFitsBase, isInfluenceRune } from './influenceRunes'
import type { CraftAffix, CraftState } from './rehearsal'
import { isSupportedArmourRune } from './runeEffects'
import { isSceptreAugmentId, scaleSceptreAugment, sceptreAugmentFits } from './sceptreAugments'
import { isSerleRune, SERLE_LINE, serleFitsBase } from './serleRune'
import { armourSoulCoreFitsBase, isSupportedSoulCore } from './soulCoreEffects'
import {
  isSpecialMartialRuneId,
  scaleSpecialMartialRune,
  specialMartialRuneFits,
} from './specialMartialRunes'
import { scaleStatLineByEffect, statScalabilitySourceHash } from './statScalability'
import { isWandRuneId, scaleWandRune, wandRuneFits } from './wandRunes'
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
  if (isWandRuneId(augment.id))
    return wandRuneFits(catalog, state, augment) ? scaleWandRune(catalog, augment, increase) : null
  if (isArmourIdolId(augment.id))
    return armourIdolFits(catalog, state, augment)
      ? scaleArmourIdol(catalog, augment, increase)
      : null
  if (isSceptreAugmentId(augment.id))
    return sceptreAugmentFits(catalog, state, augment)
      ? scaleSceptreAugment(catalog, augment, increase)
      : null
  if (isSpecialMartialRuneId(augment.id))
    return specialMartialRuneFits(catalog, state, augment)
      ? scaleSpecialMartialRune(catalog, augment, increase)
      : null
  if (isInfluenceRune(augment)) {
    const line = augment.lines[0] as string
    return influenceRuneFitsBase(catalog, state, augment) &&
      statScalabilitySourceHash(catalog) !== null &&
      catalog.scalability?.[line]?.length === 0
      ? { ...augment, lines: [line] }
      : null
  }
  if (isAstridRune(augment) || isSerleRune(augment)) {
    const serle = isSerleRune(augment)
    const line = serle ? SERLE_LINE : ASTRID_LINE
    if (
      !(serle ? serleFitsBase(catalog, state, augment) : astridFitsBase(catalog, state, augment)) ||
      increase < 0 ||
      increase >= 100 ||
      statScalabilitySourceHash(catalog) === null
    )
      return null
    const metadata = catalog.scalability?.[line]
    if (
      metadata?.length !== 1 ||
      metadata[0]?.scalable !== true ||
      metadata[0].formats.length !== 0
    )
      return null
    const scaled = scaleStatLineByEffect(line, line, metadata, increase)
    return scaled.ok && scaled.value === line ? { ...augment, lines: [scaled.value] } : null
  }
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
  if (isConditionalArmourRune(augment)) {
    if (statScalabilitySourceHash(catalog) === null) return null
    const source = catalog.augments?.find((entry) => entry.id === augment.id)
    if (!source || source.name !== augment.name || !isConditionalArmourRune(source)) return null
    const pattern = source.lines[0] as string
    const metadata = catalog.scalability?.[pattern]
    const expected = augment.name === 'Warding Rune of Protection' ? [false, true, false] : [true]
    if (
      metadata?.length !== expected.length ||
      metadata.some((scalar, i) => scalar.scalable !== expected[i] || scalar.formats.length !== 0)
    )
      return null
    const scaled = scaleStatLineByEffect(pattern, augment.lines[0] as string, metadata, increase)
    return scaled.ok ? { ...augment, lines: [scaled.value] } : null
  }
  if (isRebirthArmourRune(augment)) {
    if (statScalabilitySourceHash(catalog) === null) return null
    const source = catalog.augments?.find((entry) => entry.id === augment.id)
    if (!source || source.name !== augment.name || !isRebirthArmourRune(source)) return null
    const pattern = source.lines[0] as string
    const metadata = catalog.scalability?.[pattern]
    if (
      metadata?.length !== 1 ||
      metadata[0]?.scalable !== true ||
      metadata[0].formats.length !== 1 ||
      metadata[0].formats[0] !== 'per_minute_to_per_second_2dp_if_required'
    )
      return null
    const scaled = scaleStatLineByEffect(pattern, augment.lines[0] as string, metadata, increase)
    return scaled.ok ? { ...augment, lines: [scaled.value] } : null
  }
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
