import { isVaalJewelAffixChange } from './jewelVaalAffixRules'
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
export interface VaalReplacement {
  removeModId: string
  removeAffixId?: string
  modId: string
  values: number[]
}
interface VaalRerollOperation {
  kind: 'vaal'
  outcome: 'reroll'
  replacements: VaalReplacement[]
}
interface VaalAddOperation {
  kind: 'vaal'
  outcome: 'add'
  modId: string
  values: number[]
}
interface VaalRemoveOperation {
  kind: 'vaal'
  outcome: 'remove'
  removeModId: string
  removeAffixId?: string
}
export type VaalCraftOperation =
  | VaalSimpleOperation
  | VaalEnchantOperation
  | VaalRerollOperation
  | VaalAddOperation
  | VaalRemoveOperation

export function isVaalReplacement(value: unknown): value is VaalReplacement {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  return (
    Object.keys(entry).every((key) =>
      ['removeModId', 'removeAffixId', 'modId', 'values'].includes(key),
    ) &&
    typeof entry.removeModId === 'string' &&
    entry.removeModId.length > 0 &&
    (!Object.hasOwn(entry, 'removeAffixId') ||
      (typeof entry.removeAffixId === 'string' && entry.removeAffixId.length > 0)) &&
    typeof entry.modId === 'string' &&
    entry.modId.length > 0 &&
    Array.isArray(entry.values) &&
    entry.values.length <= 32 &&
    entry.values.every((v) => typeof v === 'number' && Number.isFinite(v))
  )
}

export function isVaalCraftOperation(value: unknown): value is VaalCraftOperation {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const step = value as Record<string, unknown>
  if (step.kind === 'vaal' && (step.outcome === 'add' || step.outcome === 'remove')) {
    const { kind: _, ...change } = step
    return isVaalJewelAffixChange(change)
  }
  if (step.kind === 'vaal' && step.outcome === 'reroll')
    return (
      Object.keys(step).every((key) => ['kind', 'outcome', 'replacements'].includes(key)) &&
      Array.isArray(step.replacements) &&
      step.replacements.length >= 1 &&
      step.replacements.length <= 3 &&
      step.replacements.every(isVaalReplacement)
    )
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
