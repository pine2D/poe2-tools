import type { CraftCatalog } from './catalog'
import {
  CRAFT_PRICE_UNITS,
  type CraftPricing,
  collectCraftCosts,
  quoteCraftCosts,
} from './craftCosts'
import { craftMaterialLabels } from './craftMaterialLabels'
import type { CraftStep } from './craftSteps'
import type { CraftResult } from './rehearsal'

export interface CraftStrategySpending {
  operations: readonly CraftStep[]
  pricing?: CraftPricing
}

/** 操作由调用方已验证历史提供；只累计当前游标之前的材料，以当前报价重新估值。 */
export function readStrategySpending(
  catalog: CraftCatalog,
  context: CraftStrategySpending | undefined,
  appliedSteps: number,
  unit: CraftPricing['unit'],
): CraftResult<number> {
  const fail = (error: string): CraftResult<never> => ({ ok: false, error })
  if (!context) return fail('缺少已应用材料历史，无法判断费用条件。')
  if (
    !Number.isInteger(appliedSteps) ||
    appliedSteps < 0 ||
    appliedSteps > context.operations.length
  )
    return fail('费用条件的历史游标无效。')
  if (!context.pricing) return fail('请先应用制作报价，再判断已用材料费用。')
  if (context.pricing.unit !== unit)
    return fail(`费用条件使用${CRAFT_PRICE_UNITS[unit]}，与当前报价单位不同；请核对条件和报价。`)
  const costs = collectCraftCosts(catalog, context.operations.slice(0, appliedSteps))
  if (!costs.ok) return costs
  const quote = quoteCraftCosts(costs.value, context.pricing)
  if (!quote.ok) return quote
  if (quote.value.total === null) {
    const label = craftMaterialLabels(catalog)
    const names = new Map(costs.value.map((material) => [material.id, label(material)]))
    return fail(
      `已用材料缺少报价：${quote.value.missing.map((id) => names.get(id) ?? id).join('、')}；无法判断费用条件。`,
    )
  }
  return { ok: true, value: quote.value.total }
}
