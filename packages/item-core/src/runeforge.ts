import type { CatalogBase, CraftCatalog } from './catalog'
import { isPlainProjectJSON } from './craftProjectJSON'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { parseRuneforgingCatalog, type RuneforgingCatalog } from './runeforgingCatalog'

export interface RuneforgeCraftOperation {
  kind: 'runeforge'
  fromBaseId: string
  toBaseId: string
}
export interface PreparedRuneforgeCraft {
  recipe: RuneforgingCatalog['recipes'][number]
  fromBase: CatalogBase
  toBase: CatalogBase
}
const fail = (error: string): CraftResult<never> => ({ ok: false, error })

export function isRuneforgeCraftOperation(value: unknown): value is RuneforgeCraftOperation {
  try {
    if (!isPlainProjectJSON(value)) return false
  } catch {
    return false
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  return (
    Object.keys(entry).length === 3 &&
    entry.kind === 'runeforge' &&
    typeof entry.fromBaseId === 'string' &&
    entry.fromBaseId.length > 0 &&
    typeof entry.toBaseId === 'string' &&
    entry.toBaseId.length > 0
  )
}

/** 配方仅提供身份关系；输入与目标状态均由现有引擎核对。 */
export function prepareRuneforgeCraft(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<PreparedRuneforgeCraft> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (state.corrupted) return fail('腐化装备不能锻造。')
  if (Object.hasOwn(state, 'pendingDesecration')) return fail('待揭示亵渎装备不能锻造。')
  if (Object.hasOwn(state, 'catalyst')) return fail('催化剂特殊装备尚未支持锻造。')
  const fromBase = catalog.bases.find((base) => base.id === state.baseId)
  if (!fromBase || fromBase.runeforged) return fail('当前基底已经锻造或不在目录中。')
  let table: RuneforgingCatalog
  try {
    table = parseRuneforgingCatalog(catalog.runeforging, catalog)
  } catch {
    return fail('缺少有效的锻造配方目录。')
  }
  const recipe = table.recipes.find((entry) => entry.fromBaseId === state.baseId)
  if (!recipe) return fail('当前基底没有已核实的锻造配方。')
  if (recipe.implicit !== 'preserve') return fail('固有属性替换的实际掷值规则未核实，暂不能锻造。')
  const toBase = catalog.bases.find((base) => base.id === recipe.toBaseId)
  if (!toBase) return fail('锻造目标基底不在目录中。')
  const target = createCraftState(catalog, { ...state, baseId: toBase.id })
  if (!target.ok) return target
  return { ok: true, value: { recipe, fromBase, toBase } }
}

/** 仅转换基底，保留原文及全部实例，未知品质和孔位不补成零。 */
export function applyRuneforgeCraft(
  catalog: CraftCatalog,
  state: CraftState,
  operation: RuneforgeCraftOperation,
): CraftResult<CraftState> {
  if (!isRuneforgeCraftOperation(operation)) return fail('锻造步骤字段无效。')
  const prepared = prepareRuneforgeCraft(catalog, state)
  if (!prepared.ok) return prepared
  if (operation.fromBaseId !== state.baseId || operation.toBaseId !== prepared.value.toBase.id)
    return fail('锻造步骤的起始或目标基底与当前配方不匹配。')
  return createCraftState(catalog, { ...state, baseId: operation.toBaseId })
}
