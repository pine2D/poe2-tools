import { type IdentifiedCraftState, isIdentifiedCraftState } from './affixIdentity'
import type { CraftCatalog } from './catalog'
import { MAX_CRAFT_PROJECT_BYTES, readNativeTargetProjectProjection } from './craftProject'
import {
  IDENTITY_CRAFT_RULES_VERSION,
  type IdentityCraftProject,
  type RestoredIdentityCraftProject,
} from './craftProjectIdentity'
import { readIdentityStoredTargetProjection } from './craftProjectIdentityReader'
import { equivalentProjectJSON, isPlainProjectJSON } from './craftProjectJSON'
import type { CraftStrategy } from './craftStrategy'
import type {
  DefinitionCraftStrategy,
  DefinitionCraftStrategyCondition,
} from './definitionStrategy'
import type { ItemDictionary } from './export'
import { fluxCatalogSignature } from './fluxes'
import type { CraftResult } from './rehearsal'
import type { CraftStrategyCondition } from './strategyConditions'
import { readTargetDefinitionContext } from './targetDefinitionContext'
import {
  type CraftTargetDefinitionContext,
  createTargetDefinitionContext,
} from './targetDefinitionMigration'
import {
  type CraftTargetDefinition,
  type CraftTargetDefinitions,
  projectTargetDefinitions,
} from './targetDefinitions'
import { targetProjectSourceHashes } from './targetProjectSources'
import { loadWorkbenchProject } from './workbenchProject'

export const TARGET_CRAFT_RULES_VERSION = 'basic-2026-09-12-v74'
export const FLUX_CRAFT_RULES_VERSION = 'basic-2026-09-12-v75'

export interface TargetCraftProject
  extends Omit<
    IdentityCraftProject,
    | 'rulesVersion'
    | 'targetModIds'
    | 'targetValues'
    | 'targetAlternatives'
    | 'targetFracturedModId'
    | 'minimumTargetCount'
    | 'strategy'
  > {
  rulesVersion: typeof TARGET_CRAFT_RULES_VERSION | typeof FLUX_CRAFT_RULES_VERSION
  fluxCatalogSignature?: string
  targetDefinitions: CraftTargetDefinitions
  orphanedTargets: CraftTargetDefinition[]
  strategy?: DefinitionCraftStrategy
}

export interface RestoredTargetCraftProject {
  project: TargetCraftProject
  states: RestoredIdentityCraftProject['states']
}

const LEGACY_TARGET_KEYS = [
  'targetModIds',
  'targetValues',
  'targetAlternatives',
  'targetFracturedModId',
  'minimumTargetCount',
] as const

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 此投影仅复用项目来源校验，绝不能传给策略执行器；目标身份仍在原上下文中校验。 */
function sourceStrategy(context: CraftTargetDefinitionContext): CraftStrategy | undefined {
  if (context.strategy === undefined) return undefined
  const types = new Map(
    [...context.definitions.targets, ...context.orphanedTargets].map((target) => [
      target.targetId,
      target.modId,
    ]),
  )
  const project = (condition: DefinitionCraftStrategyCondition): CraftStrategyCondition => {
    if (condition.kind === 'all' || condition.kind === 'any')
      return { ...condition, conditions: condition.conditions.map(project) }
    if (condition.kind === 'not') return { ...condition, condition: project(condition.condition) }
    if (condition.kind !== 'selected-targets') return { ...condition }
    // 多代目标可以使用同一类型；来源集合只保留类型，原 min 与引用关系由新策略严格验证并原样恢复。
    const modIds = [...new Set(condition.targetIds.map((id) => types.get(id) as string))]
    return {
      kind: 'selected-targets',
      modIds,
      min: Math.min(condition.min, modIds.length),
      value: condition.value,
    }
  }
  return {
    ...context.strategy,
    rules: context.strategy.rules.map((rule) => ({
      ...rule,
      conditions: rule.conditions.map(project),
    })),
  }
}

function withTargetContext(
  project: IdentityCraftProject,
  context: CraftTargetDefinitionContext,
): TargetCraftProject {
  const {
    targetModIds: _ids,
    targetValues: _values,
    targetAlternatives: _alternatives,
    targetFracturedModId: _fractured,
    minimumTargetCount: _minimum,
    strategy: _strategy,
    rulesVersion: _version,
    ...rest
  } = project
  return {
    ...rest,
    rulesVersion: TARGET_CRAFT_RULES_VERSION,
    targetDefinitions: context.definitions,
    orphanedTargets: context.orphanedTargets,
    ...(context.strategy === undefined ? {} : { strategy: context.strategy }),
  }
}

/** 原文先按 v2–v73 自身规则完整验证，迁移不能替换版本绕过旧门禁。 */
export function upgradeTargetCraftProject(
  text: string,
  catalog: CraftCatalog,
  dictionary: ItemDictionary = {},
): CraftResult<RestoredTargetCraftProject> {
  const previous = loadWorkbenchProject(text, catalog, dictionary)
  if (!previous.ok) return previous
  const project = previous.value.project
  const context = createTargetDefinitionContext(
    catalog,
    project.initialState,
    {
      targetModIds: project.targetModIds ?? [],
      ...(project.targetValues === undefined ? {} : { targetValues: project.targetValues }),
      ...(project.targetAlternatives === undefined
        ? {}
        : { targetAlternatives: project.targetAlternatives }),
      ...(project.targetFracturedModId === undefined
        ? {}
        : { targetFracturedModId: project.targetFracturedModId }),
      ...(project.minimumTargetCount === undefined
        ? {}
        : { minimumTargetCount: project.minimumTargetCount }),
    },
    project.strategy,
  )
  if (!context.ok) return context
  const upgraded = withTargetContext(project, context.value)
  const definitions = context.value.definitions
  const sources = targetProjectSourceHashes(catalog, project.initialState.baseId, [
    ...definitions.targets.map((target) => target.modId),
    ...definitions.alternatives.flatMap((entry) => entry.modIds),
    ...definitions.values.map((entry) => entry.modId),
    ...context.value.orphanedTargets.map((target) => target.modId),
  ])
  // 旧原文已通过原版本与来源检查；仅在显式升级时记录新版额外要求的目录指纹。
  if (!sources.ok) return sources
  Object.assign(upgraded, sources.value)
  const saved = serializeTargetCraftProject(upgraded, catalog, dictionary)
  return saved.ok
    ? { ok: true, value: { project: upgraded, states: previous.value.states } }
    : saved
}

/** 目标配置按存储资格验证；完整实例历史仍回放，当前数值投影留给建议及执行时验证。 */
export function parseTargetCraftProject(
  text: string,
  catalog: CraftCatalog,
  dictionary: ItemDictionary = {},
): CraftResult<RestoredTargetCraftProject> {
  if (
    text.length > MAX_CRAFT_PROJECT_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_CRAFT_PROJECT_BYTES
  )
    return { ok: false, error: '演练项目超过 2 MB 限制。' }
  let original: unknown
  try {
    original = JSON.parse(text)
  } catch {
    return { ok: false, error: '演练项目不是有效 JSON。' }
  }
  if (
    !record(original) ||
    ![TARGET_CRAFT_RULES_VERSION, FLUX_CRAFT_RULES_VERSION].includes(String(original.rulesVersion))
  )
    return { ok: false, error: '目标项目必须使用精确的 v74 或 v75 规则版本。' }
  const native = original.rulesVersion === FLUX_CRAFT_RULES_VERSION
  const fluxSignature = native ? fluxCatalogSignature(catalog) : null
  if (native && (fluxSignature === null || original.fluxCatalogSignature !== fluxSignature))
    return { ok: false, error: '项目溶剂关系签名缺失或与当前目录不同，请先加载相同溶剂关系目录。 ' }
  if (LEGACY_TARGET_KEYS.some((key) => Object.hasOwn(original, key)))
    return { ok: false, error: 'v74 项目不能混入旧目标字段。' }
  if (!record(original.initialState) || typeof original.initialState.baseId !== 'string')
    return { ok: false, error: '目标项目缺少有效初始装备。' }
  const context = readTargetDefinitionContext(catalog, original.initialState.baseId, {
    definitions: original.targetDefinitions,
    orphanedTargets: original.orphanedTargets,
    ...(Object.hasOwn(original, 'strategy') ? { strategy: original.strategy } : {}),
  })
  if (!context.ok) return context
  const {
    fluxCatalogSignature: _fluxSignature,
    targetDefinitions: _definitions,
    orphanedTargets: _orphaned,
    strategy: _strategy,
    ...rest
  } = original
  const strategy = sourceStrategy(context.value)
  let projection: string
  try {
    projection = JSON.stringify({
      ...rest,
      rulesVersion: native ? 'basic-2026-09-12-v72' : IDENTITY_CRAFT_RULES_VERSION,
      ...(!native && Object.hasOwn(original, 'fluxCatalogSignature')
        ? { fluxCatalogSignature: original.fluxCatalogSignature }
        : {}),
      ...projectTargetDefinitions(context.value.definitions),
      ...(strategy === undefined ? {} : { strategy }),
    })
  } catch {
    return { ok: false, error: '目标项目结构过深，无法建立可验证的来源投影。' }
  }
  const replay = native ? readNativeTargetProjectProjection(projection, catalog, dictionary) : null
  if (replay && !replay.ok) return replay
  if (replay?.ok && !replay.value.states.every(isIdentifiedCraftState))
    return { ok: false, error: '项目回放未保留完整词缀实例。 ' }
  const checked = replay?.ok
    ? {
        ok: true as const,
        value: {
          project: {
            ...replay.value.project,
            rulesVersion: IDENTITY_CRAFT_RULES_VERSION as typeof IDENTITY_CRAFT_RULES_VERSION,
            initialState: replay.value.project.initialState as IdentifiedCraftState,
          },
          states: replay.value.states as IdentifiedCraftState[],
        },
      }
    : readIdentityStoredTargetProjection(projection, catalog, dictionary)
  if (!checked.ok) return checked
  const project = withTargetContext(checked.value.project, context.value)
  if (native) {
    project.rulesVersion = FLUX_CRAFT_RULES_VERSION
    project.fluxCatalogSignature = original.fluxCatalogSignature as string
  }
  if (!equivalentProjectJSON(original, project))
    return { ok: false, error: '目标项目与完整回放结果不一致；不能自动补全或修复身份及配置。' }
  return { ok: true, value: { project, states: checked.value.states } }
}

export function serializeTargetCraftProject(
  project: TargetCraftProject,
  catalog: CraftCatalog,
  dictionary: ItemDictionary = {},
): CraftResult<string> {
  let text: string
  try {
    if (!isPlainProjectJSON(project))
      return { ok: false, error: '目标项目包含不能无损保存的 JSON 字段。' }
    text = JSON.stringify(project)
  } catch {
    return { ok: false, error: '目标项目无法序列化为 JSON。' }
  }
  const checked = parseTargetCraftProject(text, catalog, dictionary)
  return checked.ok ? { ok: true, value: text } : checked
}
