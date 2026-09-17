import { astridSourceValid } from './astridRune'
import type { CatalogAugment, CraftCatalog } from './catalog'
import type { CraftResult, CraftState } from './rehearsal'
import { weaponSocketKind } from './weaponRuneEffects'

/** 固定快照的声明身份；同名符文的部位记录不改变单枚限制。 */
export const INFLUENCE_RUNES = [
  ...(['weapon', 'caster'] as const).map(
    (category) =>
      ({
        name: "Thrud's Might",
        category,
        baseType: 'Weapon',
        tag: 'destruction',
        label: 'Destruction',
        stat: 10539,
        hash: '1676950499',
      }) as const,
  ),
  {
    name: "Uhtred's Sidereus",
    category: 'boots',
    baseType: 'Boots',
    tag: 'chronomancy',
    label: 'Chronomancy',
    stat: 10534,
    hash: '3132681620',
  },
  {
    name: "Kolr's Hunt",
    category: 'gloves',
    baseType: 'Gloves',
    tag: 'marksman',
    label: 'Marksman',
    stat: 10537,
    hash: '201332984',
  },
  {
    name: "Vorana's Carnage",
    category: 'helmet',
    baseType: 'Helmet',
    tag: 'berserking',
    label: 'Berserking',
    stat: 10536,
    hash: '1770091046',
  },
  {
    name: "Medved's Tending",
    category: 'body armour',
    baseType: 'Body Armour',
    tag: 'soul',
    label: 'Soul',
    stat: 10535,
    hash: '1927467683',
  },
  {
    name: "Katla's Gloom",
    category: 'gloves',
    baseType: 'Gloves',
    tag: 'decay',
    label: 'Decay',
    stat: 10538,
    hash: '2547063279',
  },
] as const

export function isInfluenceRuneLine(line: string): boolean {
  return INFLUENCE_RUNES.some((rule) => line === `Can roll ${rule.label} modifiers`)
}

export function isInfluenceRune(augment: CatalogAugment): boolean {
  const rule = INFLUENCE_RUNES.find(
    (rule) => rule.name === augment.name && rule.category === augment.category,
  )
  if (!rule) return false
  const line = `Can roll ${rule.label} modifiers`
  return (
    augment.id === `pob2:augment:${JSON.stringify([rule.name, rule.category])}` &&
    augment.category === rule.category &&
    augment.type === 'Rune' &&
    augment.localMod === true &&
    augment.limit === 1 &&
    augment.limitId === undefined &&
    augment.isSocketBound === true &&
    augment.canSocketInJewellery !== true &&
    augment.levelReq === 0 &&
    augment.lines.length === 1 &&
    augment.lines[0] === line &&
    augment.statOrder.length === 1 &&
    augment.statOrder[0] === rule.stat &&
    Object.keys(augment.tradeHashes).length === 1 &&
    augment.tradeHashes[rule.hash]?.length === 1 &&
    augment.tradeHashes[rule.hash]?.[0] === line
  )
}

export function influenceRuneFitsBase(
  catalog: CraftCatalog,
  state: Pick<CraftState, 'baseId'>,
  augment: CatalogAugment,
): boolean {
  const rule = INFLUENCE_RUNES.find(
    (rule) => rule.name === augment.name && rule.category === augment.category,
  )
  const base = catalog.bases.find((base) => base.id === state.baseId)
  const weapon = base && weaponSocketKind(base)
  return (
    !!rule &&
    isInfluenceRune(augment) &&
    astridSourceValid(catalog) &&
    catalog.augments?.filter((a) => a.id === augment.id).length === 1 &&
    (rule.tag === 'destruction'
      ? !!weapon && augment.category === (weapon.category === 'weapon' ? 'weapon' : 'caster')
      : base?.type === rule.baseType)
  )
}

/** 只解析真实孔位，不调用整件校验／镶嵌派生，避免来源与词缀资格相互递归。 */
export function influenceRuneTags(
  catalog: CraftCatalog,
  state: Pick<CraftState, 'baseId' | 'sockets'>,
): CraftResult<string[]> {
  if (state.sockets === undefined) return { ok: true, value: [] }
  if (
    !Array.isArray(state.sockets) ||
    state.sockets.some((id) => id !== null && typeof id !== 'string')
  )
    return { ok: false, error: '孔位列表无效。' }
  const entries = state.sockets.flatMap((id) => {
    // 未命中固定来源身份时不遍历镶嵌目录；非法 ID 仍由完整孔位校验拒绝。
    if (id === null || !INFLUENCE_RUNES.some((rule) => id.includes(rule.name))) return []
    const augment = catalog.augments?.find((a) => a.id === id)
    return [{ augment }]
  })
  if (entries.length === 0) return { ok: true, value: [] }
  if (entries.length > 1)
    return { ok: false, error: '当前仅核对单枚扩展词缀池符文；重复与多种来源共存尚未核实。' }
  if (
    state.sockets.some(
      (id) =>
        id !== null && ["Astrid's Creativity", "Serle's Triumph"].some((name) => id.includes(name)),
    )
  )
    return { ok: false, error: '扩展词缀池与特殊容量符文共存的交互尚未核实。' }
  const augment = entries[0]?.augment
  const rule = INFLUENCE_RUNES.find((rule) => rule.name === augment?.name)
  if (!augment || !rule || !influenceRuneFitsBase(catalog, state, augment))
    return { ok: false, error: '扩展词缀池符文的身份、部位、绑定或固定来源无效。' }
  return { ok: true, value: [rule.tag] }
}

export function influenceRuneSourceMatches(
  expected: readonly string[],
  actual: readonly string[],
): boolean {
  const select = (lines: readonly string[]) => lines.filter(isInfluenceRuneLine).sort()
  return JSON.stringify(select(expected)) === JSON.stringify(select(actual))
}

/** 不输出未经核对的部分候选池；准备入口和待揭示状态共用此边界。 */
export function supportsInfluenceDesecration(tags: readonly string[]): boolean {
  return tags.length === 1 && INFLUENCE_RUNES.some((rule) => rule.tag === tags[0])
}

export function influenceBoneError(
  catalog: CraftCatalog,
  state: Pick<CraftState, 'baseId' | 'sockets'>,
  context?: { lichOmen?: unknown; revealOmen?: unknown; putrefaction?: unknown },
): string | null {
  const source = influenceRuneTags(catalog, state)
  return !source.ok
    ? source.error
    : source.value.length > 0 &&
        (!context ||
          !supportsInfluenceDesecration(source.value) ||
          context.lichOmen !== undefined ||
          context.revealOmen !== undefined ||
          (context.putrefaction !== undefined && source.value[0] !== 'berserking'))
      ? '扩展词缀池符文与骨骼揭示的交互尚未核实。'
      : null
}
