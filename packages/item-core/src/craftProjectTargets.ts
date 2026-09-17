import { type IdentifiedCraftState, isIdentifiedCraftState } from './affixIdentity'
import type { CraftCatalog } from './catalog'
import {
  COMBAT_ARMOUR_RUNE_RULES_VERSION,
  requiresCombatArmourRuneProjectVersion,
} from './combatArmourRuneProjectVersion'
import {
  CONDITIONAL_ARMOUR_RUNE_RULES_VERSION,
  requiresConditionalArmourRuneProjectVersion,
} from './conditionalArmourRuneProjectVersion'
import {
  CORRUPTION_STRATEGY_RULES_VERSION,
  requiresCorruptionStrategyProjectVersion,
} from './corruptionStrategyProjectVersion'
import {
  CRAFTED_CAPACITY_RULES_VERSION,
  requiresCraftedCapacityProjectVersion,
} from './craftedCapacityProjectVersion'
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
import {
  DESECRATION_COUNT_RULES_VERSION,
  requiresDesecrationCountProjectVersion,
} from './desecrationCountProjectVersion'
import {
  DESTRUCTION_RUNE_RULES_VERSION,
  destructionRuneProjectCapabilityError,
  requiresDestructionRuneProjectVersion,
} from './destructionRuneProjectVersion'
import {
  ESSENCE_OUTCOMES_RULES_VERSION,
  essenceOutcomesProjectCapabilityError,
  requiresEssenceOutcomesProjectVersion,
} from './essenceOutcomesProjectVersion'
import type { ItemDictionary } from './export'
import {
  EXTENDED_ARMOUR_RUNE_RULES_VERSION,
  requiresExtendedArmourRuneProjectVersion,
} from './extendedArmourRuneProjectVersion'
import {
  EXTENDED_INFLUENCE_BONE_RULES_VERSION,
  extendedInfluenceBoneProjectCapabilityError,
  requiresExtendedInfluenceBoneProjectVersion,
} from './extendedInfluenceBoneProjectVersion'
import {
  EXTRACTION_CRAFT_RULES_VERSION,
  requiresExtractionProjectVersion,
} from './extractionProjectVersion'
import { fluxCatalogSignature } from './fluxes'
import {
  GRANTED_SKILL_TARGET_RULES_VERSION,
  requiresGrantedSkillTargetProjectVersion,
} from './grantedSkillTargetProjectVersion'
import {
  INFLUENCE_BONE_RULES_VERSION,
  influenceBoneProjectCapabilityError,
  requiresInfluenceBoneProjectVersion,
} from './influenceBoneProjectVersion'
import {
  INFLUENCE_RUNE_RULES_VERSION,
  influenceRuneProjectCapabilityError,
  requiresInfluenceRuneProjectVersion,
} from './influenceRuneProjectVersion'
import {
  MASTERWORK_CRAFT_RULES_VERSION,
  requiresMasterworkProjectVersion,
} from './masterworkProjectVersion'
import {
  PENDING_EXALTATION_RULES_VERSION,
  requiresPendingExaltationProjectVersion,
} from './pendingExaltationProjectVersion'
import {
  PERFECT_FLUX_CRAFT_RULES_VERSION,
  requiresPerfectFluxProjectVersion,
} from './perfectFluxProjectVersion'
import {
  PUTREFACTION_RULES_VERSION,
  requiresPutrefactionProjectVersion,
} from './putrefactionProjectVersion'
import type { CraftResult, CraftState } from './rehearsal'
import {
  RETAINED_CATALYST_RULES_VERSION,
  requiresRetainedCatalystProjectVersion,
} from './retainedCatalystProjectVersion'
import {
  RUNEFORGED_ARMOUR_RULES_VERSION,
  requiresRuneforgedArmourProjectVersion,
} from './runeforgedProjectVersion'
import {
  RUNEFORGE_CRAFT_RULES_VERSION,
  requiresRuneforgeProjectVersion,
} from './runeforgeProjectVersion'
import { runeforgingCatalogSignature } from './runeforgingCatalog'
import {
  requiresSerleProjectVersion,
  SERLE_RULES_VERSION,
  serleProjectCapabilityError,
} from './serleProjectVersion'
import {
  requiresSkillLevelDeclarationProjectVersion,
  SKILL_LEVEL_DECLARATION_RULES_VERSION,
} from './skillLevelDeclarationProjectVersion'
import {
  requiresSkillSocketsProjectVersion,
  SKILL_SOCKETS_RULES_VERSION,
} from './skillSocketsProjectVersion'
import {
  requiresSkillSocketTargetProjectVersion,
  SKILL_SOCKET_TARGET_RULES_VERSION,
} from './skillSocketTargetProjectVersion'
import {
  requiresSkillVariantAmuletProjectVersion,
  SKILL_VARIANT_AMULET_RULES_VERSION,
} from './skillVariantAmuletProjectVersion'
import type { CraftStrategyCondition } from './strategyConditions'
import { findTargetCapacityContext } from './targetCapacityContext'
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
import { requiresWardRuneProjectVersion, WARD_RUNE_RULES_VERSION } from './wardRuneProjectVersion'
import {
  requiresWeightedPropertyProjectVersion,
  WEIGHTED_PROPERTY_RULES_VERSION,
} from './weightedPropertyProjectVersion'
import { loadWorkbenchProject } from './workbenchProject'

export const TARGET_CRAFT_RULES_VERSION = 'basic-2026-09-12-v74'
export const FLUX_CRAFT_RULES_VERSION = 'basic-2026-09-12-v75'
export {
  COMBAT_ARMOUR_RUNE_RULES_VERSION,
  CORRUPTION_STRATEGY_RULES_VERSION,
  EXTENDED_ARMOUR_RUNE_RULES_VERSION,
  EXTRACTION_CRAFT_RULES_VERSION,
  MASTERWORK_CRAFT_RULES_VERSION,
  PENDING_EXALTATION_RULES_VERSION,
  PERFECT_FLUX_CRAFT_RULES_VERSION,
  PUTREFACTION_RULES_VERSION,
  RETAINED_CATALYST_RULES_VERSION,
  RUNEFORGE_CRAFT_RULES_VERSION,
  RUNEFORGED_ARMOUR_RULES_VERSION,
  requiresCombatArmourRuneProjectVersion,
  requiresCorruptionStrategyProjectVersion,
  requiresExtractionProjectVersion,
  requiresPerfectFluxProjectVersion,
  requiresRetainedCatalystProjectVersion,
  requiresRuneforgedArmourProjectVersion,
  requiresRuneforgeProjectVersion,
  requiresWardRuneProjectVersion,
  WARD_RUNE_RULES_VERSION,
}

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
  rulesVersion:
    | typeof TARGET_CRAFT_RULES_VERSION
    | typeof FLUX_CRAFT_RULES_VERSION
    | typeof PERFECT_FLUX_CRAFT_RULES_VERSION
    | typeof EXTRACTION_CRAFT_RULES_VERSION
    | typeof CORRUPTION_STRATEGY_RULES_VERSION
    | typeof RETAINED_CATALYST_RULES_VERSION
    | typeof COMBAT_ARMOUR_RUNE_RULES_VERSION
    | typeof RUNEFORGED_ARMOUR_RULES_VERSION
    | typeof ESSENCE_OUTCOMES_RULES_VERSION
    | typeof SERLE_RULES_VERSION
    | typeof CRAFTED_CAPACITY_RULES_VERSION
    | typeof CONDITIONAL_ARMOUR_RUNE_RULES_VERSION
    | typeof MASTERWORK_CRAFT_RULES_VERSION
    | typeof EXTENDED_ARMOUR_RUNE_RULES_VERSION
    | typeof WARD_RUNE_RULES_VERSION
    | typeof RUNEFORGE_CRAFT_RULES_VERSION
    | typeof PENDING_EXALTATION_RULES_VERSION
    | typeof SKILL_VARIANT_AMULET_RULES_VERSION
    | typeof SKILL_LEVEL_DECLARATION_RULES_VERSION
    | typeof SKILL_SOCKET_TARGET_RULES_VERSION
    | typeof SKILL_SOCKETS_RULES_VERSION
    | typeof WEIGHTED_PROPERTY_RULES_VERSION
    | typeof GRANTED_SKILL_TARGET_RULES_VERSION
    | typeof EXTENDED_INFLUENCE_BONE_RULES_VERSION
    | typeof INFLUENCE_BONE_RULES_VERSION
    | typeof DESTRUCTION_RUNE_RULES_VERSION
    | typeof INFLUENCE_RUNE_RULES_VERSION
    | typeof DESECRATION_COUNT_RULES_VERSION
    | typeof PUTREFACTION_RULES_VERSION
  runeforgingCatalogSignature?: string
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

function hasFluxCapability(input: unknown): boolean {
  const pending = [input]
  while (pending.length) {
    const value = pending.pop()
    if (Array.isArray(value)) {
      for (const child of value) pending.push(child)
      continue
    }
    if (!record(value)) continue
    if (value.kind === 'flux' || Object.keys(value).some((key) => key.startsWith('flux:')))
      return true
    for (const child of Object.values(value)) pending.push(child)
  }
  return false
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
    typeof original.rulesVersion !== 'string' ||
    ![
      TARGET_CRAFT_RULES_VERSION,
      FLUX_CRAFT_RULES_VERSION,
      PERFECT_FLUX_CRAFT_RULES_VERSION,
      EXTRACTION_CRAFT_RULES_VERSION,
      CORRUPTION_STRATEGY_RULES_VERSION,
      RETAINED_CATALYST_RULES_VERSION,
      COMBAT_ARMOUR_RUNE_RULES_VERSION,
      RUNEFORGED_ARMOUR_RULES_VERSION,
      RUNEFORGE_CRAFT_RULES_VERSION,
      WARD_RUNE_RULES_VERSION,
      EXTENDED_ARMOUR_RUNE_RULES_VERSION,
      ESSENCE_OUTCOMES_RULES_VERSION,
      PENDING_EXALTATION_RULES_VERSION,
      SKILL_VARIANT_AMULET_RULES_VERSION,
      SKILL_LEVEL_DECLARATION_RULES_VERSION,
      SKILL_SOCKET_TARGET_RULES_VERSION,
      SKILL_SOCKETS_RULES_VERSION,
      WEIGHTED_PROPERTY_RULES_VERSION,
      GRANTED_SKILL_TARGET_RULES_VERSION,
      EXTENDED_INFLUENCE_BONE_RULES_VERSION,
      INFLUENCE_BONE_RULES_VERSION,
      DESTRUCTION_RUNE_RULES_VERSION,
      INFLUENCE_RUNE_RULES_VERSION,
      DESECRATION_COUNT_RULES_VERSION,
      PUTREFACTION_RULES_VERSION,
      SERLE_RULES_VERSION,
      CRAFTED_CAPACITY_RULES_VERSION,
      CONDITIONAL_ARMOUR_RUNE_RULES_VERSION,
      MASTERWORK_CRAFT_RULES_VERSION,
    ].includes(original.rulesVersion)
  )
    return {
      ok: false,
      error:
        '目标项目必须使用精确的 v74、v75、v76、v77、v78、v79、v80、v81、v82、v83、v84、v85、v86、v87、v88、v89、v90、v91、v92、v93、v94、v95、v96、v97、v98、v99、v100、v101 或 v102 规则版本。',
    }
  const skillVariantAmulets = original.rulesVersion === SKILL_VARIANT_AMULET_RULES_VERSION
  if (!skillVariantAmulets && requiresSkillVariantAmuletProjectVersion(original))
    return {
      ok: false,
      error: '技能变体项链必须使用 v102 项目，包括起点、完整未来和嵌套未执行结构。',
    }
  const skillLevelDeclarations =
    skillVariantAmulets || original.rulesVersion === SKILL_LEVEL_DECLARATION_RULES_VERSION
  if (!skillLevelDeclarations && requiresSkillLevelDeclarationProjectVersion(original))
    return {
      ok: false,
      error: '装备最高技能等级起点声明必须使用 v101 项目，包括完整未来和未执行指引。',
    }
  const skillSocketTargets =
    skillLevelDeclarations || original.rulesVersion === SKILL_SOCKET_TARGET_RULES_VERSION
  if (!skillSocketTargets && requiresSkillSocketTargetProjectVersion(original))
    return { ok: false, error: '装备技能辅助孔起点声明与目标必须使用 v100 项目。' }
  const skillSockets = skillSocketTargets || original.rulesVersion === SKILL_SOCKETS_RULES_VERSION
  if (!skillSockets && requiresSkillSocketsProjectVersion(original))
    return {
      ok: false,
      error: '装备技能辅助孔必须使用 v99 项目，包括起点、完整未来、嵌套未执行指引及报价。',
    }
  const weightedProperties =
    skillSockets || original.rulesVersion === WEIGHTED_PROPERTY_RULES_VERSION
  if (!weightedProperties && requiresWeightedPropertyProjectVersion(original))
    return { ok: false, error: '面板加权合计条件必须使用 v98 项目，包括完整未来和嵌套未执行指引。' }
  const grantedSkillTargets =
    weightedProperties || original.rulesVersion === GRANTED_SKILL_TARGET_RULES_VERSION
  if (!grantedSkillTargets && requiresGrantedSkillTargetProjectVersion(original))
    return {
      ok: false,
      error: '装备固有技能目标必须使用 v97 项目，包括起点、目标、完整未来和未执行指引。',
    }
  const extendedInfluenceBones =
    grantedSkillTargets || original.rulesVersion === EXTENDED_INFLUENCE_BONE_RULES_VERSION
  if (!extendedInfluenceBones && requiresExtendedInfluenceBoneProjectVersion(original))
    return { ok: false, error: '扩展符文骨骼必须使用 v96 项目，包括起点、完整未来和未执行指引。' }
  const extendedBoneError = extendedInfluenceBones
    ? extendedInfluenceBoneProjectCapabilityError(original, catalog)
    : null
  if (extendedBoneError) return { ok: false, error: extendedBoneError }
  const influenceBones =
    extendedInfluenceBones || original.rulesVersion === INFLUENCE_BONE_RULES_VERSION
  if (!influenceBones && requiresInfluenceBoneProjectVersion(original))
    return { ok: false, error: '符文骨骼必须使用 v95 项目，包括起点、完整未来和未执行指引。' }
  const influenceBoneError = influenceBones
    ? influenceBoneProjectCapabilityError(original, catalog)
    : null
  if (influenceBoneError) return { ok: false, error: influenceBoneError }
  const destructionRunes =
    influenceBones || original.rulesVersion === DESTRUCTION_RUNE_RULES_VERSION
  if (!destructionRunes && requiresDestructionRuneProjectVersion(original))
    return {
      ok: false,
      error: '毁灭符文必须使用 v94 项目，包括起点、目标、声明、完整未来、指引及报价。',
    }
  const destructionError = destructionRunes
    ? destructionRuneProjectCapabilityError(original, catalog)
    : null
  if (destructionError) return { ok: false, error: destructionError }
  const influenceRunes = destructionRunes || original.rulesVersion === INFLUENCE_RUNE_RULES_VERSION
  if (!influenceRunes && requiresInfluenceRuneProjectVersion(original))
    return {
      ok: false,
      error: '扩展词缀池符文必须使用 v93 项目，包括起点、目标、声明、完整未来、指引及报价。',
    }
  const influenceError = influenceRunes
    ? influenceRuneProjectCapabilityError(original, catalog)
    : null
  if (influenceError) return { ok: false, error: influenceError }
  const desecrationCount =
    influenceRunes || original.rulesVersion === DESECRATION_COUNT_RULES_VERSION
  if (!desecrationCount && requiresDesecrationCountProjectVersion(original))
    return { ok: false, error: '亵渎数量条件必须使用 v92 项目，包括未执行和嵌套指引。' }
  const putrefaction = desecrationCount || original.rulesVersion === PUTREFACTION_RULES_VERSION
  if (!putrefaction && requiresPutrefactionProjectVersion(original))
    return { ok: false, error: '腐烂预兆必须使用 v91 项目，包括起点及撤销位置之后的步骤。' }
  const pendingExaltation =
    putrefaction || original.rulesVersion === PENDING_EXALTATION_RULES_VERSION
  if (!pendingExaltation && requiresPendingExaltationProjectVersion(original))
    return {
      ok: false,
      error: '未揭示期间的崇高操作必须使用 v90 项目，包括撤销位置之后的步骤。',
    }
  const essenceOutcomes =
    pendingExaltation || original.rulesVersion === ESSENCE_OUTCOMES_RULES_VERSION
  if (!essenceOutcomes && requiresEssenceOutcomesProjectVersion(original))
    return {
      ok: false,
      error: '多结果精华必须使用 v89 项目，包括起点、目标、完整未来及未执行指引。',
    }
  const essenceError = essenceOutcomes
    ? essenceOutcomesProjectCapabilityError(original, catalog)
    : null
  if (essenceError) return { ok: false, error: essenceError }
  const serle = essenceOutcomes || original.rulesVersion === SERLE_RULES_VERSION
  if (!serle && requiresSerleProjectVersion(original, catalog))
    return {
      ok: false,
      error: 'Serle 后缀容量必须使用 v88 项目，包括起点、声明、完整未来、指引及报价。',
    }
  const serleError = serle ? serleProjectCapabilityError(original, catalog) : null
  if (serleError) return { ok: false, error: serleError }
  const craftedCapacity = serle || original.rulesVersion === CRAFTED_CAPACITY_RULES_VERSION
  if (!craftedCapacity && requiresCraftedCapacityProjectVersion(original, catalog))
    return {
      ok: false,
      error: '多工艺容量必须使用 v87 项目，包括起点、声明、完整未来、指引及报价。',
    }
  const conditionalRunes =
    craftedCapacity || original.rulesVersion === CONDITIONAL_ARMOUR_RUNE_RULES_VERSION
  if (!conditionalRunes && requiresConditionalArmourRuneProjectVersion(original, catalog))
    return {
      ok: false,
      error: '条件限量符文必须使用 v86 项目，包括起点、声明、完整未来、指引及报价。',
    }
  const masterwork = conditionalRunes || original.rulesVersion === MASTERWORK_CRAFT_RULES_VERSION
  if (!masterwork && requiresMasterworkProjectVersion(original))
    return { ok: false, error: '符文升级必须使用 v85 项目，包括完整未来、指引及报价。' }
  const extendedArmourRunes =
    masterwork || original.rulesVersion === EXTENDED_ARMOUR_RUNE_RULES_VERSION
  if (!extendedArmourRunes && requiresExtendedArmourRuneProjectVersion(original, catalog))
    return {
      ok: false,
      error: '重生与结界提高符文必须使用 v84 项目，包括起点、声明、完整未来历史、指引及报价。',
    }
  const wardRunes = extendedArmourRunes || original.rulesVersion === WARD_RUNE_RULES_VERSION
  if (!wardRunes && requiresWardRuneProjectVersion(original, catalog))
    return {
      ok: false,
      error: '结界与再生符文必须使用 v83 项目，包括起点、导入声明、未来历史、指引及报价。',
    }
  const runeforge = wardRunes || original.rulesVersion === RUNEFORGE_CRAFT_RULES_VERSION
  const needsRuneforging =
    requiresRuneforgeProjectVersion(original) ||
    Object.hasOwn(original, 'runeforgingCatalogSignature')
  if (!runeforge && needsRuneforging)
    return {
      ok: false,
      error: '锻造操作、指引及 Verisium 报价必须使用 v82 项目，包括完整未来历史。',
    }
  if (needsRuneforging) {
    const signature = runeforgingCatalogSignature(catalog)
    if (signature === null || original.runeforgingCatalogSignature !== signature)
      return {
        ok: false,
        error: '项目锻造关系签名缺失或与当前目录不同，请先加载相同锻造配方目录。',
      }
  }
  const runeforgedArmour = runeforge || original.rulesVersion === RUNEFORGED_ARMOUR_RULES_VERSION
  if (!runeforgedArmour && requiresRuneforgedArmourProjectVersion(original, catalog))
    return {
      ok: false,
      error: '符文锻造基底与结界条件必须使用 v81 项目，包括完整历史及未执行指引。',
    }
  const combatArmourRunes =
    runeforgedArmour || original.rulesVersion === COMBAT_ARMOUR_RUNE_RULES_VERSION
  if (!combatArmourRunes && requiresCombatArmourRuneProjectVersion(original, catalog))
    return {
      ok: false,
      error: '防具荆棘与减益符文必须使用 v80 项目，包括起点、导入声明、未来操作和指引。',
    }
  const retainedCatalyst =
    combatArmourRunes || original.rulesVersion === RETAINED_CATALYST_RULES_VERSION
  if (!retainedCatalyst && requiresRetainedCatalystProjectVersion(original, catalog))
    return { ok: false, error: '已有扩展催化品质及裂隙精华共存必须使用 v79 项目，包括未来历史。' }
  const corruptionStrategy =
    retainedCatalyst || original.rulesVersion === CORRUPTION_STRATEGY_RULES_VERSION
  if (!corruptionStrategy && requiresCorruptionStrategyProjectVersion(original))
    return { ok: false, error: '腐化材料指引及腐化状态条件必须使用 v78 项目，包括未执行阶段。' }
  const extraction = corruptionStrategy || original.rulesVersion === EXTRACTION_CRAFT_RULES_VERSION
  if (!extraction && requiresExtractionProjectVersion(original))
    return { ok: false, error: '萃取石及相关指引或报价必须使用 v77 项目，包括未来历史。' }
  const perfectFlux = extraction || original.rulesVersion === PERFECT_FLUX_CRAFT_RULES_VERSION
  if (!perfectFlux && requiresPerfectFluxProjectVersion(original))
    return {
      ok: false,
      error: '完美溶剂、装备技能结果及相关指引或报价必须使用 v76 项目，包括未来历史。',
    }
  const native = perfectFlux || original.rulesVersion === FLUX_CRAFT_RULES_VERSION
  const requiresFlux =
    original.rulesVersion === FLUX_CRAFT_RULES_VERSION ||
    (perfectFlux &&
      (Object.hasOwn(original, 'fluxCatalogSignature') || hasFluxCapability(original)))
  const fluxSignature = requiresFlux ? fluxCatalogSignature(catalog) : null
  if (requiresFlux && (fluxSignature === null || original.fluxCatalogSignature !== fluxSignature))
    return { ok: false, error: '项目溶剂关系签名缺失或与当前目录不同，请先加载相同溶剂关系目录。 ' }
  if (perfectFlux && !requiresFlux && catalog.fluxes) {
    // 无抗性签名不能借已加载的目录取得转换后的重复/跨基底资格。
    const { fluxes: _fluxes, ...plainCatalog } = catalog
    catalog = plainCatalog
  }
  if (LEGACY_TARGET_KEYS.some((key) => Object.hasOwn(original, key)))
    return { ok: false, error: 'v74 项目不能混入旧目标字段。' }
  if (!record(original.initialState) || typeof original.initialState.baseId !== 'string')
    return { ok: false, error: '目标项目缺少有效初始装备。' }
  const {
    runeforgingCatalogSignature: _runeforgingSignature,
    fluxCatalogSignature: _fluxSignature,
    targetDefinitions: _definitions,
    orphanedTargets: _orphaned,
    strategy: _strategy,
    ...rest
  } = original
  let capacityContext: CraftState | undefined
  if (craftedCapacity) {
    // 先回放真实装备历史，再授权超额目标；未执行指引和伪造孔位不能提供容量。
    const { strategyStartStep: _strategyStartStep, ...stateProjection } = rest
    let historyProjection: string
    try {
      historyProjection = JSON.stringify({
        ...stateProjection,
        rulesVersion: 'basic-2026-09-12-v72',
      })
    } catch {
      return { ok: false, error: '目标项目结构过深，无法建立可验证的来源投影。' }
    }
    const history = readNativeTargetProjectProjection(
      historyProjection,
      catalog,
      dictionary,
      perfectFlux,
      extraction,
      corruptionStrategy,
      retainedCatalyst,
      combatArmourRunes,
      runeforgedArmour,
      runeforge,
      wardRunes,
      extendedArmourRunes,
      masterwork,
      conditionalRunes,
      craftedCapacity,
      serle,
      essenceOutcomes,
      pendingExaltation,
      putrefaction,
      desecrationCount,
      influenceRunes,
      destructionRunes,
      influenceBones,
      extendedInfluenceBones,
      grantedSkillTargets,
      weightedProperties,
      skillSockets,
      skillSocketTargets,
      skillLevelDeclarations,
      skillVariantAmulets,
    )
    if (!history.ok) return history
    capacityContext =
      findTargetCapacityContext(catalog, history.value.states, original.targetDefinitions) ??
      history.value.states[0]
  }
  const context = readTargetDefinitionContext(
    catalog,
    capacityContext?.baseId ?? original.initialState.baseId,
    {
      definitions: original.targetDefinitions,
      orphanedTargets: original.orphanedTargets,
      ...(Object.hasOwn(original, 'strategy') ? { strategy: original.strategy } : {}),
    },
    capacityContext,
  )
  if (!context.ok) return context
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
  const replay = native
    ? readNativeTargetProjectProjection(
        projection,
        catalog,
        dictionary,
        perfectFlux,
        extraction,
        corruptionStrategy,
        retainedCatalyst,
        combatArmourRunes,
        runeforgedArmour,
        runeforge,
        wardRunes,
        extendedArmourRunes,
        masterwork,
        conditionalRunes,
        craftedCapacity,
        serle,
        essenceOutcomes,
        pendingExaltation,
        putrefaction,
        desecrationCount,
        influenceRunes,
        destructionRunes,
        influenceBones,
        extendedInfluenceBones,
        grantedSkillTargets,
        weightedProperties,
        skillSockets,
        skillSocketTargets,
        skillLevelDeclarations,
        skillVariantAmulets,
      )
    : null
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
    project.rulesVersion = skillVariantAmulets
      ? SKILL_VARIANT_AMULET_RULES_VERSION
      : skillLevelDeclarations
        ? SKILL_LEVEL_DECLARATION_RULES_VERSION
        : skillSocketTargets
          ? SKILL_SOCKET_TARGET_RULES_VERSION
          : skillSockets
            ? SKILL_SOCKETS_RULES_VERSION
            : weightedProperties
              ? WEIGHTED_PROPERTY_RULES_VERSION
              : grantedSkillTargets
                ? GRANTED_SKILL_TARGET_RULES_VERSION
                : extendedInfluenceBones
                  ? EXTENDED_INFLUENCE_BONE_RULES_VERSION
                  : influenceBones
                    ? INFLUENCE_BONE_RULES_VERSION
                    : destructionRunes
                      ? DESTRUCTION_RUNE_RULES_VERSION
                      : influenceRunes
                        ? INFLUENCE_RUNE_RULES_VERSION
                        : desecrationCount
                          ? DESECRATION_COUNT_RULES_VERSION
                          : putrefaction
                            ? PUTREFACTION_RULES_VERSION
                            : pendingExaltation
                              ? PENDING_EXALTATION_RULES_VERSION
                              : essenceOutcomes
                                ? ESSENCE_OUTCOMES_RULES_VERSION
                                : serle
                                  ? SERLE_RULES_VERSION
                                  : craftedCapacity
                                    ? CRAFTED_CAPACITY_RULES_VERSION
                                    : conditionalRunes
                                      ? CONDITIONAL_ARMOUR_RUNE_RULES_VERSION
                                      : masterwork
                                        ? MASTERWORK_CRAFT_RULES_VERSION
                                        : extendedArmourRunes
                                          ? EXTENDED_ARMOUR_RUNE_RULES_VERSION
                                          : wardRunes
                                            ? WARD_RUNE_RULES_VERSION
                                            : runeforge
                                              ? RUNEFORGE_CRAFT_RULES_VERSION
                                              : runeforgedArmour
                                                ? RUNEFORGED_ARMOUR_RULES_VERSION
                                                : combatArmourRunes
                                                  ? COMBAT_ARMOUR_RUNE_RULES_VERSION
                                                  : retainedCatalyst
                                                    ? RETAINED_CATALYST_RULES_VERSION
                                                    : corruptionStrategy
                                                      ? CORRUPTION_STRATEGY_RULES_VERSION
                                                      : extraction
                                                        ? EXTRACTION_CRAFT_RULES_VERSION
                                                        : perfectFlux
                                                          ? PERFECT_FLUX_CRAFT_RULES_VERSION
                                                          : FLUX_CRAFT_RULES_VERSION
    if (needsRuneforging)
      project.runeforgingCatalogSignature = original.runeforgingCatalogSignature as string
    if (requiresFlux) project.fluxCatalogSignature = original.fluxCatalogSignature as string
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
