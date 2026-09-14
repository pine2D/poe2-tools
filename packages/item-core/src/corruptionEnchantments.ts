import type { CatalogCorruption, CraftCatalog } from './catalog'
import { corruptionSourceHash } from './corruptionSource'
import type { InspectedMod } from './export'
import { readNumericValues } from './numeric'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'

/** 与显式词缀、固有属性分别保存；数值为高级文本的基础值。 */
export interface CraftCorruption {
  modId: string
  lines: string[]
}

export function corruptionEntries(state: CraftState): CraftCorruption[] {
  return [state.corruption, state.secondCorruption].filter(
    (entry): entry is CraftCorruption => entry !== undefined,
  )
}

function eligible(
  catalog: CraftCatalog,
  state: CraftState,
  mod: CatalogCorruption,
  addedTags: readonly string[] = [],
): boolean {
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base || mod.kind !== 'corrupted' || mod.level > state.itemLevel) return false
  const tags = new Set([
    ...base.tags,
    ...addedTags,
    ...state.affixes.flatMap(
      (affix) => catalog.modifiers.find((entry) => entry.id === affix.modId)?.addsTags ?? [],
    ),
  ])
  return mod.eligibility.find((rule) => tags.has(rule.tag))?.value === 1
}

/** 仅核验独立层；由 createCraftState 在普通字段校验后调用，避免循环验证。 */
export function corruptionStateError(catalog: CraftCatalog, state: CraftState): string | null {
  if (
    Object.hasOwn(state, 'twiceCorrupted') &&
    (state.twiceCorrupted !== true || !state.corrupted || !state.corruption)
  )
    return '二重腐化必须保留腐化状态和至少一组强化属性。'
  if (Object.hasOwn(state, 'secondCorruption') && (!state.twiceCorrupted || !state.corruption))
    return '第二组腐化强化必须保留第一组和二重腐化状态。'
  for (const key of ['corruption', 'secondCorruption'] as const) {
    if (!Object.hasOwn(state, key)) continue
    const value = state[key]
    if (
      !state.corrupted ||
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !Object.keys(value).every((key) => ['modId', 'lines'].includes(key)) ||
      typeof value.modId !== 'string' ||
      !Array.isArray(value.lines) ||
      !value.lines.every((line) => typeof line === 'string')
    )
      return '腐化强化字段无效，且必须保留已腐化状态。'
    if (corruptionSourceHash(catalog) === null) return '腐化属性缺少可信来源指纹。'
    const mod = catalog.corruptions?.find((entry) => entry.id === value.modId)
    if (!mod || !eligible(catalog, state, mod))
      return '该腐化属性不适用于当前基底，或属于尚未支持的特殊腐化。'
    const actual = readNumericValues(mod.lines, value.lines)
    if (!actual.ok || actual.value.some((number) => number === null))
      return '腐化属性必须保留符合目录的已知基础数值。'
  }
  if (state.corruption && state.secondCorruption) {
    const first = catalog.corruptions?.find((mod) => mod.id === state.corruption?.modId)
    const second = catalog.corruptions?.find((mod) => mod.id === state.secondCorruption?.modId)
    if (!first || !second || first.group === second.group) return '两组腐化强化不能来自同一词缀组。'
    // 显示顺序不等于生成顺序；只要求有一条符合目录标签的生成路径。
    if (
      !eligible(catalog, state, second, first.addsTags) &&
      !eligible(catalog, state, first, second.addsTags)
    )
      return '两组腐化强化的附加标签互相排斥。'
  }
  return null
}

/** 手选结果按目录组和标签建模，组合交互仍待真机核对。 */
export function architectCandidates(catalog: CraftCatalog, state: CraftState): CatalogCorruption[] {
  if (
    !state.corrupted ||
    state.twiceCorrupted ||
    !createCraftState(catalog, state).ok ||
    corruptionSourceHash(catalog) === null
  )
    return []
  const first = catalog.corruptions?.find((mod) => mod.id === state.corruption?.modId)
  return (
    catalog.corruptions?.filter(
      (mod) => mod.group !== first?.group && eligible(catalog, state, mod, first?.addsTags),
    ) ?? []
  )
}

/** 首个匹配资格决定可用性；0/1 不是生成权重，不进行概率抽样。 */
export function corruptionCandidates(
  catalog: CraftCatalog,
  state: CraftState,
): CatalogCorruption[] {
  if (
    state.corrupted ||
    state.pendingDesecration ||
    corruptionSourceHash(catalog) === null ||
    !createCraftState(catalog, state).ok
  )
    return []
  return catalog.corruptions?.filter((mod) => eligible(catalog, state, mod)) ?? []
}

export function knownCorruptionHeader(header: string): boolean {
  return /^\s*\{\s*(?:Corrupted Enhancement|腐化强化|腐化強化)\s*(?:[—–]\s*[^{}\r\n]+)?\s*\}\s*$/i.test(
    header,
  )
}

/** 来源绑定由导入入口核验；这里仅按完整行、基础范围与装备资格消歧。 */
export function importCorruption(
  catalog: CraftCatalog,
  state: CraftState,
  groups: readonly InspectedMod[],
): CraftResult<Pick<CraftState, 'corruption' | 'secondCorruption'>> {
  const result: Pick<CraftState, 'corruption' | 'secondCorruption'> = {}
  if (
    (state.twiceCorrupted && groups.length === 0) ||
    groups.length > (state.twiceCorrupted ? 2 : 1)
  )
    return { ok: false, error: '二重腐化应保留一或两组普通强化；单次腐化只能有一组。' }
  for (const [index, group] of groups.entries()) {
    if (
      !state.corrupted ||
      !knownCorruptionHeader(group.mod.header.raw) ||
      (group.mod.states?.length ?? 0) > 0
    )
      return { ok: false, error: '只支持已腐化装备的普通腐化强化；其他附魔来源暂时只能对比。' }
    if (corruptionSourceHash(catalog) === null)
      return { ok: false, error: '腐化属性缺少可信来源指纹。' }
    const lines = group.stats.map(({ source, resolution }) => resolution.english ?? source.raw)
    const candidates =
      catalog.corruptions?.filter((mod) => {
        if (!eligible(catalog, state, mod)) return false
        const actual = readNumericValues(mod.lines, lines)
        return actual.ok && actual.value.every((value) => value !== null)
      }) ?? []
    const mod = candidates[0]
    if (candidates.length !== 1 || !mod)
      return { ok: false, error: '腐化强化未唯一对应目录及已知基础数值，暂时只能对比。' }
    result[index === 0 ? 'corruption' : 'secondCorruption'] = { modId: mod.id, lines }
  }
  const error = corruptionStateError(catalog, { ...state, ...result })
  return error ? { ok: false, error } : { ok: true, value: result }
}
