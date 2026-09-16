import { alloyCatalogSignature } from './alloys'
import {
  BONE_DIRECTION_OMEN_RULES,
  BONE_LICH_OMEN_RULES,
  BONE_REVEAL_OMEN_RULES,
} from './boneOmens'
import { BONE_RULES } from './boneRules'
import type { CraftCatalog } from './catalog'
import type { CraftStep } from './craftSteps'
import { ESSENCE_OMEN_RULES } from './essenceOmens'
import { FLUXES, fluxCatalogSignature } from './fluxes'
import { supportedLiquidEmotionId } from './liquidEmotions'
import { CRAFT_OMEN_RULES, craftOmenMaterials } from './omens'
import { CRAFT_CURRENCY_LABELS, type CraftResult } from './rehearsal'
import { isRuneforgeCraftOperation } from './runeforge'
import { runeforgingCatalogSignature } from './runeforgingCatalog'

export interface CraftMaterial {
  id: string
  name: string
}
export interface CraftMaterialCost extends CraftMaterial {
  count: number
}
export interface CraftPricing {
  unit: 'divine' | 'exalted' | 'chaos'
  baseCost?: number
  prices: Record<string, number>
}
export const CRAFT_PRICE_UNITS = { divine: '神圣石', exalted: '崇高石', chaos: '混沌石' } as const
export interface CraftCostQuote {
  total: number | null
  knownSubtotal: number
  missing: string[]
  missingBase: boolean
}
const SCALE = 1_000_000
function fail(error: string): CraftResult<never> {
  return { ok: false, error }
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function validPrice(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1_000_000 &&
    Number(value.toFixed(6)) === value
  )
}

/** 使用稳定材料身份合并消费；同名符文的类别效果不是多种可购买材料。 */
export function craftMaterials(catalog: CraftCatalog): CraftMaterial[] {
  const entries: CraftMaterial[] = [
    ...Object.entries(CRAFT_CURRENCY_LABELS).map(([id, name]) => ({ id: `currency:${id}`, name })),
    { id: 'currency:artificer', name: '巧匠石' },
    { id: 'currency:vaal', name: 'Vaal Orb' },
    { id: 'currency:architect', name: "Architect's Orb" },
    { id: 'currency:fracture', name: 'Fracturing Orb' },
    { id: 'currency:perfect-flux', name: 'Perfect Flux' },
    { id: 'currency:extraction', name: 'Orb of Extraction' },
    ...(runeforgingCatalogSignature(catalog) !== null
      ? [{ id: 'currency:verisium', name: 'Verisium' }]
      : []),
    ...Object.entries(BONE_RULES).map(([id, rule]) => ({ id: `bone:${id}`, name: rule.name })),
    ...(catalog.essences ?? []).map((e) => ({ id: `essence:${e.id}`, name: e.name })),
    ...(alloyCatalogSignature(catalog) !== null ? (catalog.alloys?.alloys ?? []) : []).map(
      (entry) => ({ id: `alloy:${entry.id}`, name: entry.name }),
    ),
    ...(fluxCatalogSignature(catalog) !== null ? FLUXES : []).map((entry) => ({
      id: `flux:${entry.id}`,
      name: entry.name,
    })),
    ...(catalog.liquidEmotions ?? [])
      .filter((e) => supportedLiquidEmotionId(e.id))
      .map((e) => ({ id: `emotion:${e.id}`, name: e.name })),
    ...(catalog.augments ?? []).map((e) => ({ id: `augment:${e.name}`, name: e.name })),
    ...Object.keys(CRAFT_OMEN_RULES)
      .flatMap((id) => craftOmenMaterials(id as keyof typeof CRAFT_OMEN_RULES))
      .map((name) => ({ id: `omen:${name}`, name })),
    ...[
      BONE_DIRECTION_OMEN_RULES,
      BONE_LICH_OMEN_RULES,
      BONE_REVEAL_OMEN_RULES,
      ESSENCE_OMEN_RULES,
    ].flatMap((rules) =>
      Object.values(rules).map((rule) => ({ id: `omen:${rule.name}`, name: rule.name })),
    ),
  ]
  return [...new Map(entries.map((e) => [e.id, e])).values()]
}

/** 只统计调用方已验证的步骤；报价不会让非法制作变成合法操作。 */
export function collectCraftCosts(
  catalog: CraftCatalog,
  steps: readonly CraftStep[],
): CraftResult<CraftMaterialCost[]> {
  if (steps.length > 1000) return fail('计费步骤超过 1000 步。真实材料未被截断。')
  const materials = new Map(craftMaterials(catalog).map((m) => [m.id, m]))
  const counts = new Map<string, number>()
  const add = (id: string, count = 1) => counts.set(id, (counts.get(id) ?? 0) + count)
  for (const step of steps) {
    if ('currency' in step) {
      add(`currency:${step.currency}`)
      if (step.omen) for (const name of craftOmenMaterials(step.omen)) add(`omen:${name}`)
      continue
    }
    if (step.kind === 'masterwork') {
      add('augment:Masterwork Rune')
    } else if (step.kind === 'runeforge') {
      if (!isRuneforgeCraftOperation(step)) return fail('锻造步骤字段无效，不能计费。')
      const recipe = catalog.runeforging?.recipes.find(
        (r) =>
          r.fromBaseId === step.fromBaseId &&
          r.toBaseId === step.toBaseId &&
          r.implicit === 'preserve',
      )
      if (!recipe || !materials.has('currency:verisium'))
        return fail('缺少已核实锻造配方，不能计费。')
      add('currency:verisium', recipe.verisium)
    } else if (
      step.kind === 'extraction' ||
      step.kind === 'perfect-flux' ||
      step.kind === 'fracture' ||
      step.kind === 'artificer' ||
      step.kind === 'vaal' ||
      step.kind === 'architect'
    )
      add(`currency:${step.kind}`)
    else if (step.kind === 'socket') {
      const augment = catalog.augments?.find((a) => a.id === step.augmentId)
      if (!augment) return fail('无法识别镶嵌材料，不能完整计费。')
      add(`augment:${augment.name}`)
    } else if (step.kind === 'alloy') {
      add(`alloy:${step.alloyId}`)
    } else if (step.kind === 'flux') {
      add(`flux:${step.fluxId}`)
    } else if (step.kind === 'liquid-emotion') {
      if (!supportedLiquidEmotionId(step.emotionId))
        return fail('该液态情感材料尚未支持，不能计费。')
      add(`emotion:${step.emotionId}`)
    } else if (step.kind === 'essence') {
      add(`essence:${step.essenceId}`)
      if (step.omen) add(`omen:${ESSENCE_OMEN_RULES[step.omen].name}`)
    } else if (step.kind === 'desecrate') {
      add(`bone:${step.boneId}`)
      if (step.directionOmen) add(`omen:${BONE_DIRECTION_OMEN_RULES[step.directionOmen].name}`)
      if (step.lichOmen) add(`omen:${BONE_LICH_OMEN_RULES[step.lichOmen].name}`)
    } else if (step.kind === 'desecration-offer') {
      if (step.revealOmen) add(`omen:${BONE_REVEAL_OMEN_RULES[step.revealOmen].name}`)
    } else if (step.kind !== 'desecration-reroll' && step.kind !== 'desecration-reveal')
      return fail('未知步骤不能计费。')
  }
  const result: CraftMaterialCost[] = []
  for (const [id, count] of counts) {
    const material = materials.get(id)
    if (!material) return fail(`未知材料 ${id}，不能完整计费。`)
    result.push({ ...material, count })
  }
  return { ok: true, value: result }
}

export function parseCraftPricing(
  value: unknown,
  catalog?: CraftCatalog,
): CraftResult<CraftPricing> {
  if (
    !record(value) ||
    !Object.keys(value).every((k) => ['unit', 'prices', 'baseCost'].includes(k)) ||
    typeof value.unit !== 'string' ||
    !Object.hasOwn(CRAFT_PRICE_UNITS, value.unit) ||
    !record(value.prices) ||
    Object.keys(value.prices).length > 2000 ||
    (Object.hasOwn(value, 'baseCost') && !validPrice(value.baseCost))
  )
    return fail('报价格式无效：使用神圣石、崇高石或混沌石，金额应为 0–1000000 且最多六位小数。')
  const allowed = catalog ? new Set(craftMaterials(catalog).map((m) => m.id)) : null
  if (
    Object.entries(value.prices).some(
      ([id, price]) =>
        !validPrice(price) ||
        id.length > 512 ||
        !/^(currency|bone|essence|emotion|alloy|flux|augment|omen):.+$/.test(id) ||
        (allowed !== null && !allowed.has(id)),
    )
  )
    return fail('材料报价包含未知身份或无效金额。')
  return {
    ok: true,
    value: {
      unit: value.unit as CraftPricing['unit'],
      prices: { ...value.prices } as Record<string, number>,
      ...(Object.hasOwn(value, 'baseCost') ? { baseCost: value.baseCost as number } : {}),
    },
  }
}

export function quoteCraftCosts(
  costs: readonly CraftMaterialCost[],
  pricing: CraftPricing,
  includeBase = false,
): CraftResult<CraftCostQuote> {
  const parsed = parseCraftPricing(pricing)
  if (!parsed.ok) return parsed
  let micros =
    includeBase && pricing.baseCost !== undefined ? Math.round(pricing.baseCost * SCALE) : 0
  const missing: string[] = []
  for (const cost of costs) {
    if (!Number.isSafeInteger(cost.count) || cost.count < 1) return fail('材料数量无效。')
    const price = Object.hasOwn(pricing.prices, cost.id) ? pricing.prices[cost.id] : undefined
    if (price === undefined) missing.push(cost.id)
    else micros += Math.round(price * SCALE) * cost.count
    if (!Number.isSafeInteger(micros)) return fail('报价合计超过可精确计算范围。')
  }
  const missingBase = includeBase && pricing.baseCost === undefined
  return {
    ok: true,
    value: {
      knownSubtotal: micros / SCALE,
      total: missing.length || missingBase ? null : micros / SCALE,
      missing,
      missingBase,
    },
  }
}
