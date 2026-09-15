import type { CraftCatalog } from './catalog'
import type { CraftResult, CraftState } from './rehearsal'
import type {
  CraftTargetDefinition,
  CraftTargetDefinitionAlternative,
  CraftTargetDefinitionValues,
} from './targetDefinitions'
import { readCraftTargetValue } from './targetValueValidation'

/** 调用方先验证目标与替代集合资格；这里只核对逐目标数值关联，不授权共存或生成。 */
export function readTargetDefinitionValues(
  catalog: CraftCatalog,
  baseId: string,
  targets: readonly CraftTargetDefinition[],
  alternatives: readonly CraftTargetDefinitionAlternative[],
  input: unknown,
  runtime?: { state: CraftState | undefined },
): CraftResult<CraftTargetDefinitionValues[]> {
  if (!Array.isArray(input) || input.length > 192)
    return { ok: false, error: '数值目标必须是最多 192 项条件的数组。' }
  const members = new Map(targets.map((target) => [target.targetId, new Set([target.modId])]))
  for (const entry of alternatives)
    for (const modId of entry.modIds) members.get(entry.targetId)?.add(modId)
  const seen = new Set<string>()
  const result: CraftTargetDefinitionValues[] = []
  for (const entry of input) {
    if (
      entry === null ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      !Object.entries(entry).every(
        ([key, value]) =>
          ['targetId', 'modId', 'bounds', 'basis'].includes(key) && value !== undefined,
      ) ||
      typeof entry.targetId !== 'string' ||
      typeof entry.modId !== 'string' ||
      !members.get(entry.targetId)?.has(entry.modId)
    )
      return { ok: false, error: '数值条件必须关联对应目标的主类型或替代档位，不能跨目标关联。' }
    const key = JSON.stringify([entry.targetId, entry.modId])
    if (seen.has(key)) return { ok: false, error: '同一目标的同类型数值条件不能重复。' }
    const { targetId, ...value } = entry
    const checked = readCraftTargetValue(catalog, baseId, value, runtime)
    if (!checked.ok) return checked
    seen.add(key)
    result.push({ targetId, ...checked.value })
  }
  return { ok: true, value: result }
}
