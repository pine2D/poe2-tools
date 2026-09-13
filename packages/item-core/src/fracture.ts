import type { CraftCatalog } from './catalog'
import { readCatalogLineValues } from './catalogMatch'
import { type CraftAffix, type CraftResult, type CraftState, createCraftState } from './rehearsal'

export interface FractureCraftOperation {
  kind: 'fracture'
  modId: string
}
export interface PreparedFracture {
  candidates: CraftAffix[]
  unresolvedModIds: string[]
}

export function isFractureCraftOperation(value: unknown): value is FractureCraftOperation {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const step = value as Record<string, unknown>
  return (
    Object.keys(step).every((key) => key === 'kind' || key === 'modId') &&
    step.kind === 'fracture' &&
    typeof step.modId === 'string' &&
    step.modId.length > 0
  )
}

/** 候选包含未知实际值，指定结果时仍须单独拒绝，不能假造中值。 */
export function prepareFracture(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<PreparedFracture> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const current = checked.value
  if (current.rarity !== 'rare') return { ok: false, error: '破裂操作只能用于稀有装备。' }
  if (current.affixes.some((affix) => affix.fractured))
    return { ok: false, error: '装备已有破裂词缀，不能再次使用破裂操作。' }
  if (current.affixes.length + (current.pendingDesecration ? 1 : 0) < 4)
    return { ok: false, error: '破裂操作需要至少四组词缀；待揭示亵渎占位计入数量。' }
  const candidates = current.affixes.filter((affix) => !affix.desecrated)
  if (!candidates.length) return { ok: false, error: '没有可以破裂的非亵渎词缀。' }
  const unresolvedModIds = candidates
    .filter((affix) => {
      const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
      const values = mod ? readCatalogLineValues(mod.lines, affix.lines) : null
      return values === null || values.flat().some((value) => value === null)
    })
    .map((affix) => affix.modId)
  return { ok: true, value: { candidates, unresolvedModIds } }
}

export function applyFracture(
  catalog: CraftCatalog,
  state: CraftState,
  operation: FractureCraftOperation,
): CraftResult<CraftState> {
  if (!isFractureCraftOperation(operation)) return { ok: false, error: '破裂操作字段无效。' }
  const prepared = prepareFracture(catalog, state)
  if (!prepared.ok) return prepared
  if (!prepared.value.candidates.some((affix) => affix.modId === operation.modId))
    return { ok: false, error: '必须选择当前非亵渎词缀作为破裂结果。' }
  if (prepared.value.unresolvedModIds.includes(operation.modId))
    return { ok: false, error: '该词缀缺少实际数值，不能锁定未知结果。' }
  return createCraftState(catalog, {
    ...state,
    affixes: state.affixes.map((affix) =>
      affix.modId === operation.modId ? { ...affix, fractured: true } : affix,
    ),
  })
}
