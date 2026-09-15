import { type IdentifiedCraftAffix, isIdentifiedCraftState } from './affixIdentity'
import { DESTROYED_ITEM_MESSAGE } from './architect'
import { PENDING_DESECRATION_MESSAGE } from './boneRules'
import type { CatalogMod, CraftCatalog } from './catalog'
import { CORRUPTED_CRAFT_MESSAGE } from './corruptionRules'
import { isPlainProjectJSON } from './craftProjectJSON'
import { FLUXES, fluxCatalogSignature, inspectFluxes } from './fluxes'
import { renderNumericLines } from './numeric'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'

export interface FluxCraftOperation {
  kind: 'flux'
  fluxId: string
  rolls: { affixId: string; modId: string; values: number[] }[]
}
export interface PreparedFluxCraft {
  flux: (typeof FLUXES)[number]
  changes: { affix: IdentifiedCraftAffix; fromMod: CatalogMod; toMod: CatalogMod }[]
}
const fail = (error: string): CraftResult<never> => ({ ok: false, error })
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function keys(value: Record<string, unknown>, expected: readonly string[]) {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  )
}
export function isFluxCraftOperation(value: unknown): value is FluxCraftOperation {
  try {
    if (!isPlainProjectJSON(value)) return false
  } catch {
    return false
  }
  return (
    record(value) &&
    keys(value, ['kind', 'fluxId', 'rolls']) &&
    value.kind === 'flux' &&
    typeof value.fluxId === 'string' &&
    FLUXES.some((flux) => flux.id === value.fluxId) &&
    Array.isArray(value.rolls) &&
    value.rolls.length > 0 &&
    value.rolls.length <= 6 &&
    value.rolls.every(
      (roll) =>
        record(roll) &&
        keys(roll, ['affixId', 'modId', 'values']) &&
        typeof roll.affixId === 'string' &&
        /^a[1-9]\d*$/.test(roll.affixId) &&
        Number.isSafeInteger(Number(roll.affixId.slice(1))) &&
        typeof roll.modId === 'string' &&
        roll.modId.length > 0 &&
        Array.isArray(roll.values) &&
        roll.values.length <= 32 &&
        roll.values.every((number) => typeof number === 'number' && Number.isFinite(number)),
    )
  )
}

/** 仅返回完整前态中实际会转换的实例；缺失关系不能静默跳过。 */
export function prepareFluxCraft(
  catalog: CraftCatalog,
  state: CraftState,
  fluxId: string,
): CraftResult<PreparedFluxCraft> {
  if (Object.hasOwn(state, 'destroyed')) return fail(DESTROYED_ITEM_MESSAGE)
  if (state.corrupted) return fail(CORRUPTED_CRAFT_MESSAGE)
  if (state.pendingDesecration) return fail(PENDING_DESECRATION_MESSAGE)
  if (!isIdentifiedCraftState(state)) return fail('溶剂演练需要完整的词缀实例身份。')
  if (state.rarity === 'normal') return fail('溶剂演练需要魔法或稀有装备。')
  if (state.affixes.some((affix) => affix.fractured))
    return fail('已破裂装备使用溶剂的整体消费尚未核实，暂不演练此组合。')
  const flux = FLUXES.find((flux) => flux.id === fluxId)
  if (!flux) return fail('请选择受支持的溶剂材料。')
  if (fluxCatalogSignature(catalog) === null || !catalog.fluxes)
    return fail('溶剂关系来源缺失或不匹配，请先加载原关系目录。')
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const base = catalog.bases.find((base) => base.id === state.baseId)
  if (!base || !isIdentifiedCraftState(checked.value)) return fail('溶剂演练缺少合法基底或实例。')
  const relations = inspectFluxes(catalog.fluxes, catalog, base).filter(
    (entry) => entry.flux.id === fluxId,
  )
  const changes: PreparedFluxCraft['changes'] = []
  for (const affix of checked.value.affixes) {
    const matching = relations.filter((entry) => entry.fromMod?.id === affix.modId)
    if (!matching.length) continue
    if (affix.crafted) return fail('被转换工艺词缀的来源标记交互尚未核实，暂不演练此组合。')
    if (matching.length !== 1) return fail('此实例的溶剂对应关系不唯一，不能指定结果。')
    const relation = matching[0]
    if (!relation?.fromMod || !relation.toMod)
      return fail('此实例缺少完整溶剂目标关系，不能只转换其中部分词缀。')
    changes.push({ affix, fromMod: relation.fromMod, toMod: relation.toMod })
  }
  if (!changes.length) return fail('此溶剂不会改变当前词缀；混沌抗性不能逆向转换。')
  return { ok: true, value: { flux, changes } }
}

/** 所有目标数值按实际实例一次性写入；身份和历史分配游标不重新分配。 */
export function applyFluxCraft(
  catalog: CraftCatalog,
  state: CraftState,
  operation: FluxCraftOperation,
): CraftResult<CraftState> {
  if (!isFluxCraftOperation(operation)) return fail('溶剂步骤字段无效，必须逐实例提供完整数值。')
  const prepared = prepareFluxCraft(catalog, state, operation.fluxId)
  if (!prepared.ok) return prepared
  if (operation.rolls.length !== prepared.value.changes.length)
    return fail('必须为全部应转换实例分别指定一次结果。')
  const values = new Map<string, FluxCraftOperation['rolls'][number]>()
  for (const roll of operation.rolls) {
    if (values.has(roll.affixId)) return fail('同一溶剂实例不能重复指定结果。')
    values.set(roll.affixId, roll)
  }
  const converted = new Map<string, { modId: string; lines: string[] }>()
  for (const { affix, toMod } of prepared.value.changes) {
    const roll = values.get(affix.affixId)
    if (!roll || roll.modId !== toMod.id) return fail('溶剂结果实例已过期或目标类型不匹配。')
    const rendered = renderNumericLines(toMod.lines, roll.values)
    if (!rendered.ok) return rendered
    converted.set(affix.affixId, { modId: toMod.id, lines: rendered.value })
  }
  return createCraftState(catalog, {
    ...state,
    affixes: state.affixes.map((affix) => {
      const change = affix.affixId === undefined ? undefined : converted.get(affix.affixId)
      return change ? { ...affix, ...change } : affix
    }),
  })
}
