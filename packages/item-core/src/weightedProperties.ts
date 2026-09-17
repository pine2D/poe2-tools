import type { CraftCatalog } from './catalog'
import { isPlainProjectJSON } from './craftProjectJSON'
import { CRAFT_PROPERTY_LABELS, type CraftProperty, readCraftProperty } from './itemProperties'
import type { CraftResult, CraftState } from './rehearsal'

export interface WeightedPropertyTerm {
  property: CraftProperty
  weight: number
}
export interface WeightedPropertiesCondition {
  kind: 'weighted-properties'
  terms: WeightedPropertyTerm[]
  min: number
  max?: number
}

function safeNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= Number.MAX_SAFE_INTEGER
  )
}
function keys(value: unknown, allowed: readonly string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => allowed.includes(key))
  )
}

/** 可独立供编辑器调用；先拒绝非 JSON 和访问器，再读取字段并构造副本。 */
export function readWeightedPropertiesCondition(
  value: unknown,
): WeightedPropertiesCondition | null {
  try {
    if (!isPlainProjectJSON(value)) return null
    if (
      !keys(value, ['kind', 'terms', 'min', 'max']) ||
      value.kind !== 'weighted-properties' ||
      !safeNumber(value.min) ||
      (Object.hasOwn(value, 'max') && (!safeNumber(value.max) || value.max < value.min)) ||
      !Array.isArray(value.terms) ||
      value.terms.length < 1 ||
      value.terms.length > 4
    )
      return null
    const terms: WeightedPropertyTerm[] = []
    for (const term of value.terms) {
      if (
        !keys(term, ['property', 'weight']) ||
        typeof term.property !== 'string' ||
        !Object.hasOwn(CRAFT_PROPERTY_LABELS, term.property) ||
        !safeNumber(term.weight) ||
        term.weight === 0 ||
        Math.abs(term.weight) > 1_000_000 ||
        terms.some((previous) => previous.property === term.property)
      )
        return null
      terms.push({ property: term.property as CraftProperty, weight: term.weight })
    }
    return {
      kind: 'weighted-properties',
      terms,
      min: value.min,
      ...(typeof value.max === 'number' ? { max: value.max } : {}),
    }
  } catch {
    return null
  }
}

/** 任一指标未知或任一步算术越界，整体即未知；不对合计四舍五入。 */
export function readWeightedProperties(
  catalog: CraftCatalog,
  state: CraftState,
  terms: readonly WeightedPropertyTerm[],
): CraftResult<number> {
  const checked = readWeightedPropertiesCondition({ kind: 'weighted-properties', terms, min: 0 })
  if (!checked) return { ok: false, error: '面板加权项无效。' }
  let total = 0
  for (const term of checked.terms) {
    const result = readCraftProperty(catalog, state, term.property)
    if (!result.ok) return result
    const product = result.value * term.weight
    if (!safeNumber(product) || !safeNumber(total + product))
      return { ok: false, error: '面板加权合计超出安全数值范围。' }
    total += product
  }
  return { ok: true, value: total }
}
