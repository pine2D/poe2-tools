import type { CraftState } from './rehearsal'

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : entry,
  )
}

/** 搜索去重忽略分配身份；保留每个实例的属性、标记及重复数量。 */
export function craftStateSemanticKey(state: CraftState): string {
  const semantic = Object.fromEntries(
    Object.entries(state).filter(([key]) => key !== 'nextAffixId'),
  )
  return canonical({
    ...semantic,
    affixes: state.affixes
      .map((affix) =>
        canonical(Object.fromEntries(Object.entries(affix).filter(([key]) => key !== 'affixId'))),
      )
      .sort(),
  })
}
