import type { CatalogBase, CraftCatalog } from './catalog'
import { flaskSourceHash } from './flaskSource'
import type { CraftOmen } from './omens'
import type { CraftCurrency, CraftState } from './rehearsal'

// 固定来源的18种普通回复药剂；属性是目录身份，不是用户装备的品质或当前充能。
const BASES = [
  ['Lesser', 0, 50, 3, 50, 2, 60],
  ['Medium', 4, 90, 5, 70, 3, 65],
  ['Greater', 10, 150, 4, 90, 2.5, 70],
  ['Grand', 16, 260, 5, 110, 2.5, 75],
  ['Giant', 23, 340, 4, 165, 3.5, 75],
  ['Colossal', 30, 450, 4, 165, 2.5, 75],
  ['Gargantuan', 40, 710, 5, 185, 2, 75],
  ['Transcendent', 50, 840, 4, 285, 3.5, 75],
  ['Ultimate', 60, 920, 3, 310, 3, 75],
] as const

/** 无目录的旧项目出口也须识别药剂起点，名称与严格基底表共源。 */
export function isBasicFlaskBaseId(id: unknown): boolean {
  return BASES.some(([name]) => id === `${name} Life Flask` || id === `${name} Mana Flask`)
}

export function isBasicFlaskBase(base: CatalogBase): boolean {
  if (
    base.type !== 'Flask' ||
    !['Life', 'Mana'].includes(base.subType ?? '') ||
    base.id !== base.name ||
    base.hidden ||
    base.runeforged ||
    base.sourceQuality !== 20 ||
    base.socketLimit !== null ||
    base.implicit !== null ||
    base.implicitTags.length !== 0 ||
    Object.keys(base.properties).length !== 0 ||
    base.variantList !== undefined ||
    base.variant !== undefined ||
    base.charm !== undefined ||
    base.charmLimit !== undefined ||
    base.spirit !== undefined ||
    base.grantedSkillsHaveNoReservation !== undefined ||
    !base.flask
  )
    return false
  const row = BASES.find(([name]) => base.id === `${name} ${base.subType} Flask`)
  if (!row) return false
  const life = base.subType === 'Life'
  const key = life ? 'life' : 'mana'
  return (
    base.tags.length === 3 &&
    ['default', 'flask', `${key}_flask`].every((tag) => base.tags.includes(tag)) &&
    Object.keys(base.requirements).length === (row[1] === 0 ? 0 : 1) &&
    (base.requirements.level ?? 0) === row[1] &&
    Object.keys(base.flask).length === 4 &&
    base.flask[key] === row[life ? 2 : 4] &&
    base.flask.duration === row[life ? 3 : 5] &&
    base.flask.chargesUsed === 10 &&
    base.flask.chargesMax === row[6]
  )
}

/** 所有状态入口共用；腐化等机制尚未接入，不代表游戏禁止该机制。 */
export function flaskStateError(
  catalog: CraftCatalog,
  base: CatalogBase,
  state: CraftState,
): string | null {
  if (base.type !== 'Flask') return null
  if (!isBasicFlaskBase(base)) return '仅支持已核对的18种普通生命或魔力药剂基底。'
  if (flaskSourceHash(catalog) === null) return '药剂制作缺少可信词缀来源指纹。'
  if (!['normal', 'magic'].includes(state.rarity)) return '普通药剂制作只支持普通或魔法稀有度。'
  if (
    state.quality !== undefined &&
    (!Number.isInteger(state.quality) || state.quality < 0 || state.quality > 20)
  )
    return '药剂已核对品质必须是0–20的整数；缺失时保持未知。'
  if (
    [
      'corrupted',
      'twiceCorrupted',
      'corruption',
      'secondCorruption',
      'pendingDesecration',
      'sockets',
      'runeSourceLines',
      'catalyst',
      'declaredSkillLevel',
      'grantedSkillLevel',
      'declaredSkillSockets',
      'grantedSkillSockets',
    ].some((key) => key in state) ||
    (Array.isArray(state.affixes) &&
      state.affixes.some((a) => a && (a.crafted || a.fractured || a.desecrated))) ||
    (typeof state.sourceText === 'string' &&
      state.sourceText.split(/\r?\n/).some((line) => line.trim() === 'Sanctified'))
  )
    return '药剂的腐化、插槽、工艺等特殊状态尚未支持。'
  return null
}

/** 候选、准备和执行共用材料边界，不改变通用材料的物等及同族回退规则。 */
export function flaskOperationError(
  base: CatalogBase,
  currency?: CraftCurrency,
  omen?: CraftOmen,
): string | null {
  if (base.type !== 'Flask') return null
  if (
    currency !== undefined &&
    ![
      'transmutation',
      'greater_transmutation',
      'perfect_transmutation',
      'augmentation',
      'greater_augmentation',
      'perfect_augmentation',
      'annulment',
      'divine',
    ].includes(currency)
  )
    return '药剂只支持三档蜕变、三档增幅、剥离与神圣石。'
  if (
    omen !== undefined &&
    !(currency === 'annulment' && ['sinistral_annulment', 'dextral_annulment'].includes(omen))
  )
    return '此药剂预兆组合尚未支持。'
  return null
}
