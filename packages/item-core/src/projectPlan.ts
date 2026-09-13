import type { CraftCatalog } from './catalog'
import { parseCraftProject, type RestoredCraftProject, serializeCraftProject } from './craftProject'
import type { ItemDictionary } from './export'
import type { CraftResult } from './rehearsal'
import { craftStrategyLeaves } from './strategyConditions'

/** 沿用目标和指引，保持接收方完整历史、来源声明与报价。两份输入均须独立合法。 */
export function reuseCraftPlan(
  currentText: string,
  templateText: string,
  catalog: CraftCatalog,
  dictionary?: ItemDictionary,
): CraftResult<RestoredCraftProject> {
  const current = parseCraftProject(currentText, catalog, dictionary)
  if (!current.ok) return { ok: false, error: `当前项目无效：${current.error}` }
  const template = parseCraftProject(templateText, catalog, dictionary)
  if (!template.ok) return { ok: false, error: `收藏方案无效：${template.error}` }
  const source = template.value.project
  if (!source.strategy && !source.targetModIds?.length && !source.targetImplicitValues?.length)
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
  const missing =
    source.strategy?.rules.flatMap((rule) =>
      craftStrategyLeaves(rule.conditions).flatMap((condition) =>
        condition.kind === 'selected-targets'
          ? condition.modIds.filter((id) => !source.targetModIds?.includes(id))
          : [],
      ),
    ) ?? []
  if (missing.length)
    return {
      ok: false,
      error: `收藏方案引用了已移除的目标：${[...new Set(missing)].join('、')}。请先修复收藏中的条件。`,
    }
  const next = { ...current.value.project }
  // 可选字段缺省意味着清除接收方旧配置，不能混成两套目标。
  for (const key of [
    'targetModIds',
    'targetValues',
    'targetAlternatives',
    'targetImplicitValues',
    'targetFracturedModId',
    'minimumTargetCount',
    'strategy',
    'strategyStartStep',
  ] as const)
    delete next[key]
  Object.assign(next, {
    ...(source.targetModIds ? { targetModIds: source.targetModIds } : {}),
    ...(source.targetValues ? { targetValues: source.targetValues } : {}),
    ...(source.targetAlternatives ? { targetAlternatives: source.targetAlternatives } : {}),
    ...(source.targetImplicitValues ? { targetImplicitValues: source.targetImplicitValues } : {}),
    ...(source.targetFracturedModId ? { targetFracturedModId: source.targetFracturedModId } : {}),
    ...(source.minimumTargetCount === undefined
      ? {}
      : { minimumTargetCount: source.minimumTargetCount }),
    ...(source.strategy ? { strategy: source.strategy } : {}),
    ...(source.strategy?.flow ? { strategyStartStep: next.cursor } : {}),
  })
  // 新方案可能首次引入精华、骨骼、符文或有效值目标；只能携带已验证过的同快照指纹。
  for (const key of [
    'essenceSourceHash',
    'desecrationSourceHash',
    'augmentSourceHash',
    'scalabilitySourceHash',
  ] as const)
    if (source[key] !== undefined) next[key] = source[key]
  const restored = parseCraftProject(serializeCraftProject(next), catalog, dictionary)
  return restored.ok ? restored : { ok: false, error: `方案与当前装备不兼容：${restored.error}` }
}
