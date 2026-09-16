import type { CraftCatalog } from './catalog'
import { isPlainProjectJSON } from './craftProjectJSON'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { isSerleRune } from './serleRune'

export interface ExtractionCraftOperation {
  kind: 'extraction'
}
export interface ExtractionReturn {
  augmentId: string
  name: string
  count: number
  socketIndices: number[]
}
export interface PreparedExtractionCraft {
  returns: ExtractionReturn[]
}
const fail = (error: string): CraftResult<never> => ({ ok: false, error })

/** 返还依据原材料身份逐孔计算，不使用可能已被增效的镶嵌属性文本。 */
function inspectExtraction(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<PreparedExtractionCraft & { state: CraftState }> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const sockets = checked.value.sockets
  if (sockets === undefined) return fail('孔位尚未核对，不能确定萃取返还；请先核对已有镶嵌物。')
  if (!sockets.some((id) => id !== null)) return fail('装备没有已镶嵌物，不能使用萃取石。')
  const returns = new Map<string, ExtractionReturn>()
  for (const [socketIndex, augmentId] of sockets.entries()) {
    if (augmentId === null) continue
    const augment = catalog.augments?.find((entry) => entry.id === augmentId)
    if (!augment) return fail('镶嵌材料身份不在当前目录中，不能确定返还。')
    // Serle 随整件销毁，只有非绑定材料进入返还清单。
    if (augment.isSocketBound === true) {
      if (isSerleRune(augment)) continue
      return fail('该绑定镶嵌物的萃取交互尚未核实。')
    }
    const existing = returns.get(augmentId)
    if (existing) {
      existing.count++
      existing.socketIndices.push(socketIndex)
    } else
      returns.set(augmentId, {
        augmentId,
        name: augment.name,
        count: 1,
        socketIndices: [socketIndex],
      })
  }
  if (returns.size === 0) return fail('全部镶嵌物已绑定；无可返还材料时的萃取消费尚未核实。')
  return { ok: true, value: { state: checked.value, returns: [...returns.values()] } }
}

export function prepareExtractionCraft(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<PreparedExtractionCraft> {
  const result = inspectExtraction(catalog, state)
  return result.ok ? { ok: true, value: { returns: result.value.returns } } : result
}

/** 保留已核对的独立历史快照；返还只能由前态派生，不写入终态或外部库存。 */
export function applyExtractionCraft(
  catalog: CraftCatalog,
  state: CraftState,
  operation: ExtractionCraftOperation,
): CraftResult<CraftState> {
  if (!isExtractionCraftOperation(operation)) return fail('萃取石步骤只能包含 kind: extraction。')
  const result = inspectExtraction(catalog, state)
  return result.ok ? { ok: true, value: { ...result.value.state, destroyed: true } } : result
}

export function isExtractionCraftOperation(value: unknown): value is ExtractionCraftOperation {
  try {
    if (!isPlainProjectJSON(value)) return false
  } catch {
    return false
  }
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    Object.hasOwn(value, 'kind') &&
    (value as Record<string, unknown>).kind === 'extraction'
  )
}
