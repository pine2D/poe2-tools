import { armourIdolLimitKey } from './armourIdols'
import { isAstridRune } from './astridRune'
import type { CatalogAugment, CraftCatalog } from './catalog'
import type { CraftState } from './rehearsal'
import { sceptreLimitKey } from './sceptreAugments'
import { isSerleRune } from './serleRune'
import { specialMartialLimitKey } from './specialMartialRunes'
import { wandRuneLimitKey } from './wandRunes'

const PROTECTION =
  /^Every 4 seconds, gain Guard equal to ([1-9]\d*)% of maximum Runic Ward for 2 seconds$/
const NOURISHMENT = /^([1-9]\d*)% Life Recovery from Flasks also applies to Runic Ward$/

/** 条件效果保留完整语义；不把周期、持续时间或比例合并成角色最终数值。 */
export function conditionalArmourRuneKind(line: string): 'protection' | 'nourishment' | null {
  const match = PROTECTION.exec(line) ?? NOURISHMENT.exec(line)
  if (!match || !Number.isSafeInteger(Number(match[1]))) return null
  return PROTECTION.test(line) ? 'protection' : 'nourishment'
}

export function isConditionalArmourRune(augment: CatalogAugment): boolean {
  if (
    augment.type !== 'Rune' ||
    augment.category !== 'armour' ||
    augment.localMod !== false ||
    augment.limit !== 1 ||
    augment.limitId !== undefined ||
    augment.isSocketBound === true ||
    augment.lines.length !== 1
  )
    return false
  const kind = conditionalArmourRuneKind(augment.lines[0] as string)
  return (
    (augment.name === 'Warding Rune of Protection' && kind === 'protection') ||
    (augment.name === 'Warding Rune of Nourishment' && kind === 'nourishment')
  )
}

/** 单件已知数量；外部装备和角色孔未知，不代表角色可穿戴。 */
export function socketLimitWarnings(catalog: CraftCatalog, state: CraftState) {
  const counts = new Map<string, number>()
  for (const id of state.sockets ?? []) {
    const augment = catalog.augments?.find((a) => a.id === id)
    const special =
      augment &&
      (wandRuneLimitKey(augment) ??
        specialMartialLimitKey(augment) ??
        sceptreLimitKey(augment) ??
        armourIdolLimitKey(augment))
    if (special) {
      const name = special === 'AldursLegacyLimit1' ? "Aldur's Legacy" : special
      counts.set(name, (counts.get(name) ?? 0) + 1)
      continue
    }
    if (
      augment &&
      (isConditionalArmourRune(augment) || isAstridRune(augment) || isSerleRune(augment))
    )
      counts.set(augment.name, (counts.get(augment.name) ?? 0) + 1)
  }
  return [...counts].map(([name, count]) => ({ name, limit: 1, count, exceeded: count > 1 }))
}

/** 已有重复可检查和替换；不把未经核实的新增重复模拟成已确认游戏操作。 */
export function conditionalRuneSocketError(
  catalog: CraftCatalog,
  state: CraftState,
  index: number,
  id: string,
): string | null {
  const augment = catalog.augments?.find((a) => a.id === id)
  if (!augment || !isConditionalArmourRune(augment)) return null
  const count = (state.sockets ?? []).filter(
    (old, i) =>
      i !== index && catalog.augments?.some((a) => a.id === old && a.name === augment.name),
  ).length
  return count > 0
    ? '该限量符文的重复镶入行为尚未核实；请替换其他重复孔，或选择不同符文。已有孔位可保留检查。'
    : null
}

/** 按完整条件行及出现次数比较，不能仅比百分数或忽略重复项。 */
export function conditionalRuneSourceMatches(
  expected: readonly string[],
  actual: readonly string[],
): boolean {
  const select = (lines: readonly string[]) =>
    lines.filter((line) => conditionalArmourRuneKind(line) !== null).sort()
  return JSON.stringify(select(expected)) === JSON.stringify(select(actual))
}
