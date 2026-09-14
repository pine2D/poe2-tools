/** 普通制作的限制不适用于已有孔的镶嵌；其他腐化专用机制另行接入。 */
export const CORRUPTED_CRAFT_MESSAGE =
  '装备已腐化，不能使用该普通制作操作；仍可在已有孔内镶嵌或覆盖已支持的符文与魂核。'

interface VaalSimpleOperation {
  kind: 'vaal'
  outcome: 'unchanged' | 'socket'
}
interface VaalEnchantOperation {
  kind: 'vaal'
  outcome: 'enchant'
  modId: string
  values: number[]
}
export type VaalCraftOperation = VaalSimpleOperation | VaalEnchantOperation

export function isVaalCraftOperation(value: unknown): value is VaalCraftOperation {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const step = value as Record<string, unknown>
  if (step.kind === 'vaal' && step.outcome === 'enchant')
    return (
      Object.keys(step).every((key) => ['kind', 'outcome', 'modId', 'values'].includes(key)) &&
      typeof step.modId === 'string' &&
      Array.isArray(step.values) &&
      step.values.length <= 32 &&
      step.values.every((value) => typeof value === 'number' && Number.isFinite(value))
    )
  return (
    Object.keys(step).every((key) => key === 'kind' || key === 'outcome') &&
    step.kind === 'vaal' &&
    (step.outcome === 'unchanged' || step.outcome === 'socket')
  )
}
