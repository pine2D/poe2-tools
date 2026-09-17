import { isSovereignAffix } from './alloyEffects'
import { armourIdolFits, isArmourIdolId } from './armourIdols'
import { isAstridRune } from './astridRune'
import { bodyIdolBondedActive, bodyIdolBondedLines } from './bodyIdols'
import type { CatalogAugment, CraftCatalog } from './catalog'
import { astridFitsBase } from './craftedCapacity'
import { influenceRuneFitsBase, influenceRuneTags, isInfluenceRune } from './influenceRunes'
import type { CraftState } from './rehearsal'
import { isSupportedArmourRune } from './runeEffects'
import { isRuneforgedArmourBase } from './runeforgedArmour'
import { isSceptreAugmentId, isSupportedSceptreBase, sceptreAugmentFits } from './sceptreAugments'
import { isSerleRune, serleFitsBase } from './serleRune'
import {
  effectiveSocketAugment,
  isHorrorSocketAffix,
  socketEffectIncrease,
} from './socketAmplification'
import { armourSoulCoreFitsBase, isSupportedSoulCore } from './soulCoreEffects'
import { isSpecialMartialRuneId, specialMartialRuneFits } from './specialMartialRunes'
import { isSupportedWeaponRune, weaponSocketKind } from './weaponRuneEffects'

/** 只列已占用孔；augment.lines 是当前效果，bonded 保留来源，激活效果显式分列。 */
export interface SocketEffect {
  socketIndex: number
  bondedActive: boolean
  activeBondedLines: string[]
  augment: CatalogAugment
}

const SPECIAL_SOCKET_RULE = /\b(?:sockets?|socketed|augments?|runes?|soul cores?|bonded|chakra)\b/i

export function hasSpecialSocketRules(catalog: CraftCatalog, state: CraftState): boolean {
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (base === undefined) return true
  const lines = [
    ...(base.implicit?.split('\n') ?? []),
    ...(state.implicitLines ?? []),
    ...state.affixes
      .filter(
        (affix) =>
          !isHorrorSocketAffix(catalog, state, affix) &&
          !isSovereignAffix(catalog, state, affix, 'socket'),
      )
      .flatMap((affix) => [
        ...affix.lines,
        ...(catalog.modifiers.find((mod) => mod.id === affix.modId)?.lines ?? []),
      ]),
  ]
  return lines.some((line) => SPECIAL_SOCKET_RULE.test(line))
}

function supportedSocketBase(catalog: CraftCatalog, state: CraftState) {
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (
    base === undefined ||
    base.hidden ||
    (base.runeforged && !isRuneforgedArmourBase(base)) ||
    base.variantList !== undefined ||
    hasSpecialSocketRules(catalog, state)
  )
    return undefined
  return base
}

function isSupportedOffhand(type: string): boolean {
  return type === 'Focus' || type === 'Shield' || type === 'Buckler'
}

/** 普通巧匠石上限，独立于额外掉落孔及来源 socketLimit。 */
export function artificerSocketLimit(catalog: CraftCatalog, state: CraftState): number {
  if (state.corrupted) return 0
  const base = supportedSocketBase(catalog, state)
  if (base === undefined) return 0
  const weapon = weaponSocketKind(base)
  if (isSupportedSceptreBase(base)) return 1
  if (weapon) return weapon.limit
  if (base.type === 'Body Armour') return 2
  return ['Helmet', 'Gloves', 'Boots'].includes(base.type) || isSupportedOffhand(base.type) ? 1 : 0
}

/** 已有孔范围包含额外掉落孔及一次腐化额外孔；不是巧匠石打孔上限。 */
export function socketCapacity(catalog: CraftCatalog, state: CraftState): number {
  const base = supportedSocketBase(catalog, state)
  if (base === undefined) return 0
  const weapon = weaponSocketKind(base)
  const extra = state.corrupted ? 1 : 0
  if (isSupportedSceptreBase(base)) return 2 + extra
  if (weapon) return weapon.limit + 1 + extra
  if (base.type === 'Body Armour') return 3 + extra
  return ['Helmet', 'Gloves', 'Boots'].includes(base.type) || isSupportedOffhand(base.type)
    ? 2 + extra
    : 0
}

function supportedAugment(
  catalog: CraftCatalog,
  state: CraftState,
  augment: CatalogAugment,
): boolean {
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  const weapon = base && weaponSocketKind(base)
  if (isArmourIdolId(augment.id)) return armourIdolFits(catalog, state, augment)
  if (isSceptreAugmentId(augment.id)) return sceptreAugmentFits(catalog, state, augment)
  if (base?.type === 'Sceptre') return false
  if (isSpecialMartialRuneId(augment.id)) return specialMartialRuneFits(catalog, state, augment)
  if (isInfluenceRune(augment)) return influenceRuneFitsBase(catalog, state, augment)
  if (isAstridRune(augment)) return astridFitsBase(catalog, state, augment)
  if (isSerleRune(augment)) return serleFitsBase(catalog, state, augment)
  if (isSupportedSoulCore(augment))
    return weapon
      ? weapon.category === 'weapon' && augment.category === 'weapon'
      : !!base && armourSoulCoreFitsBase(augment, base)
  return weapon ? isSupportedWeaponRune(augment, weapon.category) : isSupportedArmourRune(augment)
}

/** 缺省未建模；空数组明确零孔；null 仅表示已知空孔。 */
export function socketStateError(catalog: CraftCatalog, state: CraftState): string | null {
  const influence = influenceRuneTags(catalog, state)
  if (!influence.ok) return influence.error
  if (state.sockets === undefined) return null
  if (!Array.isArray(state.sockets)) return '孔位列表无效。'
  for (const socket of state.sockets) {
    if (socket !== null && (typeof socket !== 'string' || socket.length === 0))
      return '孔位必须是明确空孔 null 或已知符文 ID。'
  }
  if (state.sockets.length === 0) return null
  if (hasSpecialSocketRules(catalog, state))
    return '当前装备带有特殊孔、绑定或镶嵌效果规则，暂不支持镶嵌演练。'
  const capacity = socketCapacity(catalog, state)
  if (capacity === 0) return '该基底暂不支持普通符文镶嵌。'
  if (state.sockets.length > capacity)
    return `该基底最多支持 ${capacity} 个已核对的${state.corrupted ? '腐化' : '非腐化'}已有孔。`
  for (const id of state.sockets) {
    if (id === null) continue
    const augment = catalog.augments?.find((entry) => entry.id === id)
    if (augment === undefined) return `孔内物 ${id} 不在镶嵌目录中。`
    if (
      !supportedAugment(catalog, state, augment) ||
      effectiveSocketAugment(catalog, state, augment) === null
    )
      return `孔内物 ${augment.name} 暂不支持镶嵌演练。`
  }
  return null
}

export function socketCandidates(catalog: CraftCatalog, state: CraftState): CatalogAugment[] {
  if (Object.hasOwn(state, 'destroyed')) return []
  if (Object.hasOwn(state, 'pendingDesecration')) return []
  if (socketStateError(catalog, state) !== null || !state.sockets?.length) return []
  // levelReq 为符文贡献的穿戴需求，不是物品等级门槛。
  return (catalog.augments ?? []).flatMap((augment) => {
    if (!supportedAugment(catalog, state, augment)) return []
    const effective = effectiveSocketAugment(catalog, state, augment)
    return effective === null ? [] : [effective]
  })
}

export function socketEffects(catalog: CraftCatalog, state: CraftState): SocketEffect[] {
  if (Object.hasOwn(state, 'destroyed')) return []
  if (socketStateError(catalog, state) !== null) return []
  return (state.sockets ?? []).flatMap((id, socketIndex) => {
    const augment = catalog.augments?.find((entry) => entry.id === id)
    const effective = augment && effectiveSocketAugment(catalog, state, augment)
    if (!effective || !augment) return []
    const bondedActive = bodyIdolBondedActive(catalog, state, augment)
    const activeBondedLines = bondedActive
      ? bodyIdolBondedLines(catalog, augment, socketEffectIncrease(catalog, state) ?? 0)
      : []
    return activeBondedLines
      ? [{ socketIndex, augment: effective, bondedActive, activeBondedLines }]
      : []
  })
}
