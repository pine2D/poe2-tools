import type { CraftCatalog } from './catalog'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'

export const DESTROYED_ITEM_MESSAGE =
  '装备已摧毁；可撤销演练或回到起点，不能继续制作或使用其装备数值。'

export interface ArchitectCraftOperation {
  kind: 'architect'
  outcome: 'destroy'
}

export function isArchitectCraftOperation(value: unknown): value is ArchitectCraftOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const step = value as Record<string, unknown>
  return (
    Object.keys(step).every((key) => key === 'kind' || key === 'outcome') &&
    step.kind === 'architect' &&
    step.outcome === 'destroy'
  )
}

/** 指定摧毁结果；原字段只作历史快照，不能通过存活装备校验。 */
export function destroyWithArchitect(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<CraftState> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (!checked.value.corrupted) return { ok: false, error: '建筑师宝珠只支持已腐化装备。' }
  return { ok: true, value: { ...checked.value, destroyed: true } }
}
