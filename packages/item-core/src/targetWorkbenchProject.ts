import type { CraftCatalog } from './catalog'
import { MAX_CRAFT_PROJECT_BYTES } from './craftProject'
import {
  parseTargetCraftProject,
  type RestoredTargetCraftProject,
  serializeTargetCraftProject,
  TARGET_CRAFT_RULES_VERSION,
  upgradeTargetCraftProject,
} from './craftProjectTargets'
import type { ItemDictionary } from './export'
import type { CraftResult } from './rehearsal'
import { targetProjectSourceHashes, targetProjectSourceUsage } from './targetProjectSources'

/** v74 严格读取；其余原文交给独立旧版本升级入口，不降级重试或递归分派。 */
export function loadTargetWorkbenchProject(
  text: string,
  catalog: CraftCatalog,
  dictionary?: ItemDictionary,
): CraftResult<RestoredTargetCraftProject> {
  if (
    text.length > MAX_CRAFT_PROJECT_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_CRAFT_PROJECT_BYTES
  )
    return { ok: false, error: '演练项目超过 2 MB 限制。' }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, error: '演练项目不是有效 JSON。' }
  }
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'rulesVersion' in value &&
    value.rulesVersion === TARGET_CRAFT_RULES_VERSION
    ? parseTargetCraftProject(text, catalog, dictionary)
    : upgradeTargetCraftProject(text, catalog, dictionary)
}

/** 两份原文分别验证；移植整个目标身份域，保留接收方历史及报价。 */
export function reuseTargetCraftPlan(
  currentText: string,
  templateText: string,
  catalog: CraftCatalog,
  dictionary?: ItemDictionary,
): CraftResult<RestoredTargetCraftProject> {
  const current = loadTargetWorkbenchProject(currentText, catalog, dictionary)
  if (!current.ok) return { ok: false, error: `当前项目无效：${current.error}` }
  const template = loadTargetWorkbenchProject(templateText, catalog, dictionary)
  if (!template.ok) return { ok: false, error: `收藏方案无效：${template.error}` }
  const source = template.value.project
  if (
    !source.strategy &&
    !source.targetDefinitions.targets.length &&
    !source.targetImplicitValues?.length
  )
    return { ok: false, error: '这份收藏没有制作目标或条件指引，无法沿用方案。' }
  if (source.targetImplicitValues?.length) {
    const from = catalog.bases.find((base) => base.id === source.initialState.baseId)
    const to = catalog.bases.find((base) => base.id === current.value.project.initialState.baseId)
    if (!from || !to || from.implicit !== to.implicit)
      return {
        ok: false,
        error: '两件装备的固有属性不同，不能按行号沿用固有目标。请先调整收藏方案。',
      }
  }
  const next = structuredClone(current.value.project)
  next.targetDefinitions = structuredClone(source.targetDefinitions)
  next.orphanedTargets = structuredClone(source.orphanedTargets)
  delete next.strategy
  delete next.strategyStartStep
  delete next.targetImplicitValues
  if (source.strategy) next.strategy = structuredClone(source.strategy)
  if (source.strategy?.flow) next.strategyStartStep = next.cursor
  if (source.targetImplicitValues)
    next.targetImplicitValues = structuredClone(source.targetImplicitValues)
  for (const key of [
    'essenceSourceHash',
    'liquidEmotionSourceHash',
    'alloyCatalogSignature',
    'desecrationSourceHash',
    'augmentSourceHash',
    'scalabilitySourceHash',
    'jewelSourceHash',
  ] as const)
    if (source[key] !== undefined) next[key] = source[key]
  const types = [
    ...next.targetDefinitions.targets.map((t) => t.modId),
    ...next.targetDefinitions.alternatives.flatMap((a) => a.modIds),
    ...next.orphanedTargets.map((t) => t.modId),
  ]
  const sources = targetProjectSourceUsage(catalog, next.initialState.baseId, types)
  if (
    !sources.jewel &&
    !catalog.bases.some((base) => base.id === next.initialState.baseId && base.type === 'Jewel')
  )
    delete next.jewelSourceHash
  // 基底改变时原本普通的失联类型可能依赖特殊来源，按接收基底重新核对。
  const hashes = targetProjectSourceHashes(catalog, next.initialState.baseId, types)
  if (!hashes.ok) return hashes
  Object.assign(next, hashes.value)
  const checked = serializeTargetCraftProject(next, catalog, dictionary)
  if (!checked.ok) return { ok: false, error: `方案与当前装备不兼容：${checked.error}` }
  return { ok: true, value: { project: next, states: current.value.states } }
}
