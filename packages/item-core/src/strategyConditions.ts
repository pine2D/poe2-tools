import { CATALYSTS } from './catalystQuality'
import { isPlainProjectJSON } from './craftProjectJSON'
import { CRAFT_PROPERTY_LABELS, type CraftProperty } from './itemProperties'
import type { CraftRarity } from './rehearsal'

export type CraftStrategyLeafCondition =
  | { kind: 'granted-skill-level'; min: number; max?: number }
  | {
      kind: 'quality'
      source: 'ordinary' | 'catalyst'
      catalystId?: string
      min: number
      max?: number
    }
  | { kind: 'item-property'; property: CraftProperty; min: number; max?: number }
  | { kind: 'selected-targets'; modIds: string[]; min: number; value: boolean }
  | { kind: 'socket-count' | 'open-sockets'; min: number; max: number }
  | { kind: 'always' }
  | { kind: 'rarity'; value: CraftRarity }
  | { kind: 'targets-met'; value: boolean }
  | { kind: 'open-prefix' | 'open-suffix'; min: number }
  | { kind: 'affix-count'; min: number }
  | { kind: 'desecration-stage'; value: 'none' | 'unrevealed' | 'offered' }
export type CraftStrategyCondition =
  | CraftStrategyLeafCondition
  | { kind: 'all'; conditions: CraftStrategyCondition[] }
  | { kind: 'any'; conditions: CraftStrategyCondition[] }
  | { kind: 'not'; condition: CraftStrategyCondition }

function keys(value: unknown, allowed: string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => allowed.includes(key))
  )
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}
function readLeaf(value: unknown): CraftStrategyLeafCondition | null {
  if (!keys(value, ['kind', 'value', 'min', 'max', 'modIds', 'property', 'source', 'catalystId']))
    return null
  if (value.kind === 'granted-skill-level') {
    if (
      !keys(value, ['kind', 'min', 'max']) ||
      !integer(value.min, 1, 20) ||
      (Object.hasOwn(value, 'max') && (!integer(value.max, 1, 20) || value.max < value.min))
    )
      return null
    return {
      kind: 'granted-skill-level',
      min: value.min,
      ...(typeof value.max === 'number' ? { max: value.max } : {}),
    }
  }
  if (value.kind === 'quality') {
    if (
      !keys(value, ['kind', 'source', 'catalystId', 'min', 'max']) ||
      (value.source !== 'ordinary' && value.source !== 'catalyst') ||
      !integer(value.min, 0, 100) ||
      (Object.hasOwn(value, 'max') && (!integer(value.max, 0, 100) || value.max < value.min)) ||
      (Object.hasOwn(value, 'catalystId') &&
        (value.source !== 'catalyst' || !CATALYSTS.some((entry) => entry.id === value.catalystId)))
    )
      return null
    return {
      kind: 'quality',
      source: value.source,
      min: value.min,
      ...(typeof value.max === 'number' ? { max: value.max } : {}),
      ...(typeof value.catalystId === 'string' ? { catalystId: value.catalystId } : {}),
    }
  }
  if (value.kind === 'item-property') {
    const number = (n: unknown): n is number =>
      typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER
    if (
      !keys(value, ['kind', 'property', 'min', 'max']) ||
      typeof value.property !== 'string' ||
      !Object.hasOwn(CRAFT_PROPERTY_LABELS, value.property) ||
      !number(value.min) ||
      (Object.hasOwn(value, 'max') && (!number(value.max) || value.max < value.min))
    )
      return null
    return {
      kind: 'item-property',
      property: value.property as CraftProperty,
      min: value.min,
      ...(typeof value.max === 'number' ? { max: value.max } : {}),
    }
  }
  if (
    value.kind === 'selected-targets' &&
    keys(value, ['kind', 'modIds', 'min', 'value']) &&
    Array.isArray(value.modIds) &&
    value.modIds.length >= 1 &&
    value.modIds.length <= 6 &&
    value.modIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 512) &&
    new Set(value.modIds).size === value.modIds.length &&
    integer(value.min, 1, value.modIds.length) &&
    typeof value.value === 'boolean'
  )
    return {
      kind: 'selected-targets',
      modIds: [...value.modIds],
      min: value.min,
      value: value.value,
    }
  if (
    (value.kind === 'socket-count' || value.kind === 'open-sockets') &&
    keys(value, ['kind', 'min', 'max']) &&
    integer(value.min, 0, 3) &&
    integer(value.max, 0, 3) &&
    value.min <= value.max
  )
    return { kind: value.kind, min: value.min, max: value.max }
  if (value.kind === 'affix-count' && keys(value, ['kind', 'min']) && integer(value.min, 0, 6))
    return { kind: 'affix-count', min: value.min }
  if (
    value.kind === 'desecration-stage' &&
    keys(value, ['kind', 'value']) &&
    (value.value === 'none' || value.value === 'unrevealed' || value.value === 'offered')
  )
    return { kind: 'desecration-stage', value: value.value }
  if (value.kind === 'always' && keys(value, ['kind'])) return { kind: 'always' }
  if (
    value.kind === 'rarity' &&
    keys(value, ['kind', 'value']) &&
    (value.value === 'normal' || value.value === 'magic' || value.value === 'rare')
  )
    return { kind: 'rarity', value: value.value }
  if (
    value.kind === 'targets-met' &&
    keys(value, ['kind', 'value']) &&
    typeof value.value === 'boolean'
  )
    return { kind: 'targets-met', value: value.value }
  if (
    (value.kind === 'open-prefix' || value.kind === 'open-suffix') &&
    keys(value, ['kind', 'min']) &&
    integer(value.min, 1, 3)
  )
    return { kind: value.kind, min: value.min }
  return null
}

/** 限深、限量先于递归；只构造已校验副本，循环对象也会在深度边界拒绝。 */
export function readStrategyConditions(value: unknown): CraftStrategyCondition[] | null {
  try {
    if (!isPlainProjectJSON(value)) return null
  } catch {
    return null
  }
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return null
  let nodes = 0
  const read = (input: unknown, depth: number): CraftStrategyCondition | null => {
    if (
      depth > 4 ||
      ++nodes > 32 ||
      !keys(input, [
        'kind',
        'conditions',
        'condition',
        'value',
        'min',
        'max',
        'modIds',
        'property',
        'source',
        'catalystId',
      ])
    )
      return null
    if (input.kind === 'all' || input.kind === 'any') {
      if (
        !keys(input, ['kind', 'conditions']) ||
        !Array.isArray(input.conditions) ||
        input.conditions.length < 1 ||
        input.conditions.length > 4
      )
        return null
      const children = Array.from(input.conditions, (child) => read(child, depth + 1))
      return children.every((child) => child !== null)
        ? { kind: input.kind, conditions: children }
        : null
    }
    if (input.kind === 'not') {
      if (!keys(input, ['kind', 'condition'])) return null
      const child = read(input.condition, depth + 1)
      return child ? { kind: 'not', condition: child } : null
    }
    return readLeaf(input)
  }
  const conditions = Array.from(value, (input) => read(input, 0))
  if (!conditions.every((condition) => condition !== null)) return null
  const roots = conditions.filter((condition) => !['all', 'any', 'not'].includes(condition.kind))
  if (
    new Set(
      roots.map((condition) =>
        condition.kind === 'item-property' ? `item-property:${condition.property}` : condition.kind,
      ),
    ).size !== roots.length
  )
    return null
  return conditions
}

/** 输入必须已经过 readStrategyConditions 校验，遍历所有分支而非仅匹配分支。 */
export function craftStrategyLeaves(
  conditions: readonly CraftStrategyCondition[],
): CraftStrategyLeafCondition[] {
  return conditions.flatMap((condition) => {
    if (condition.kind === 'all' || condition.kind === 'any')
      return craftStrategyLeaves(condition.conditions)
    if (condition.kind === 'not') return craftStrategyLeaves([condition.condition])
    return [condition]
  })
}
