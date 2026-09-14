import type { CraftCatalog } from './catalog'
import { architectCandidates } from './corruptionEnchantments'
import { renderNumericLines } from './numeric'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'

export const DESTROYED_ITEM_MESSAGE =
  '装备已摧毁；可撤销演练或回到起点，不能继续制作或使用其装备数值。'

interface ArchitectDestroyOperation {
  kind: 'architect'
  outcome: 'destroy'
}
interface ArchitectEnchantOperation {
  kind: 'architect'
  outcome: 'enchant'
  modId: string
  values: number[]
}
export type ArchitectCraftOperation = ArchitectDestroyOperation | ArchitectEnchantOperation

export function isArchitectCraftOperation(value: unknown): value is ArchitectCraftOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const step = value as Record<string, unknown>
  if (step.kind === 'architect' && step.outcome === 'enchant')
    return (
      Object.keys(step).every((key) => ['kind', 'outcome', 'modId', 'values'].includes(key)) &&
      typeof step.modId === 'string' &&
      step.modId.length > 0 &&
      Array.isArray(step.values) &&
      step.values.length <= 32 &&
      step.values.every((v) => typeof v === 'number' && Number.isFinite(v))
    )
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
  if (checked.value.twiceCorrupted)
    return { ok: false, error: '装备已二重腐化，不能再次使用建筑师宝珠。' }
  if (!checked.value.corrupted) return { ok: false, error: '建筑师宝珠只支持已腐化装备。' }
  return { ok: true, value: { ...checked.value, destroyed: true } }
}

export function applyArchitect(
  catalog: CraftCatalog,
  state: CraftState,
  step: ArchitectCraftOperation,
): CraftResult<CraftState> {
  if (step.outcome === 'destroy') return destroyWithArchitect(catalog, state)
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (checked.value.twiceCorrupted)
    return { ok: false, error: '装备已二重腐化，不能再次使用建筑师宝珠。' }
  const mod = architectCandidates(catalog, checked.value).find((mod) => mod.id === step.modId)
  if (!mod) return { ok: false, error: '请选择当前可用的建筑师腐化强化。' }
  const lines = renderNumericLines(mod.lines, step.values)
  if (!lines.ok) return lines
  const value = { modId: mod.id, lines: lines.value }
  return createCraftState(catalog, {
    ...checked.value,
    twiceCorrupted: true,
    ...(checked.value.corruption ? { secondCorruption: value } : { corruption: value }),
  })
}
