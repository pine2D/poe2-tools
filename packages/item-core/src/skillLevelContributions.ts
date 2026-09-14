import { readStatAnnotations } from './annotations'
import type { CraftCatalog } from './catalog'
import { estimateCraftAffixEffects } from './jewelEffects'
import type { CraftResult, CraftState } from './rehearsal'

export interface SkillLevelContribution {
  scope: string
  value: CraftResult<number>
}

/** 只按显式词缀原文的适用范围分组；不推导技能标签、角色等级或授予技能等级。 */
export function estimateSkillLevelContributions(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<SkillLevelContribution[]> {
  const effects = estimateCraftAffixEffects(catalog, state)
  if (!effects.ok) return effects
  if (!state.catalyst && /^(?:Quality|品质|品質)\s*[(（]/im.test(state.sourceText ?? ''))
    return { ok: false, error: '催化品质尚未核对，无法估算技能等级词缀的有效值。' }
  if (state.pendingDesecration)
    return { ok: false, error: '请先完成亵渎揭示，再核对技能等级词缀。' }
  const totals = new Map<string, CraftResult<number>>()
  for (const group of effects.value.groups) {
    for (const line of group.lines) {
      const original = readStatAnnotations(line.before).text
      if (!/to Level of/i.test(original)) continue
      const scope = original.match(/^[+-](?:\d+(?:\([^)]*\))?|\([^)]*\)) to Level of (.+)$/)?.[1]
      if (!scope) return { ok: false, error: `未支持的技能等级词缀：${original}` }
      const previous = totals.get(scope) ?? { ok: true, value: 0 }
      if (!previous.ok) continue
      const actual = line.after === null ? null : readStatAnnotations(line.after).text
      const match = actual?.match(/^([+-]\d+)(?:\([^)]*\))? to Level of (.+)$/)
      if (!match || match[2] !== scope) {
        totals.set(scope, {
          ok: false,
          error: line.after === null ? line.reason : '技能等级词缀的实际掷值未知。',
        })
        continue
      }
      const value = Number(match[1])
      totals.set(
        scope,
        Number.isSafeInteger(value) && Number.isSafeInteger(previous.value + value)
          ? { ok: true, value: previous.value + value }
          : { ok: false, error: '技能等级词缀的数值无效。' },
      )
    }
  }
  return { ok: true, value: [...totals].map(([scope, value]) => ({ scope, value })) }
}
