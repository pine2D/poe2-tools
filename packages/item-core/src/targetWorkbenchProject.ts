import {
  AMULET_CATALYST_RULES_VERSION,
  requiresAmuletCatalystProjectVersion,
} from './amuletCatalystProjectVersion'
import {
  AMULET_SKILL_LEVEL_RULES_VERSION,
  requiresAmuletSkillLevelProjectVersion,
} from './amuletSkillLevelProjectVersion'
import {
  AMULET_SKILL_SOCKETS_RULES_VERSION,
  requiresAmuletSkillSocketsProjectVersion,
} from './amuletSkillSocketsProjectVersion'
import { BODY_IDOL_RULES_VERSION, requiresBodyIdolProjectVersion } from './bodyIdolProjectVersion'
import type { CraftCatalog } from './catalog'
import {
  CONDITIONAL_ARMOUR_RUNE_RULES_VERSION,
  requiresConditionalArmourRuneProjectVersion,
} from './conditionalArmourRuneProjectVersion'
import {
  CRAFTED_CAPACITY_RULES_VERSION,
  requiresCraftedCapacityProjectVersion,
} from './craftedCapacityProjectVersion'
import { MAX_CRAFT_PROJECT_BYTES } from './craftProject'
import { isPlainProjectJSON } from './craftProjectJSON'
import {
  COMBAT_ARMOUR_RUNE_RULES_VERSION,
  CORRUPTION_STRATEGY_RULES_VERSION,
  EXTRACTION_CRAFT_RULES_VERSION,
  FLUX_CRAFT_RULES_VERSION,
  PERFECT_FLUX_CRAFT_RULES_VERSION,
  parseTargetCraftProject,
  RETAINED_CATALYST_RULES_VERSION,
  type RestoredTargetCraftProject,
  RUNEFORGE_CRAFT_RULES_VERSION,
  RUNEFORGED_ARMOUR_RULES_VERSION,
  requiresCombatArmourRuneProjectVersion,
  requiresCorruptionStrategyProjectVersion,
  requiresExtractionProjectVersion,
  requiresPerfectFluxProjectVersion,
  requiresRetainedCatalystProjectVersion,
  requiresRuneforgedArmourProjectVersion,
  requiresRuneforgeProjectVersion,
  serializeTargetCraftProject,
  TARGET_CRAFT_RULES_VERSION,
  upgradeTargetCraftProject,
} from './craftProjectTargets'
import {
  DEFENCE_ESSENCE_RULES_VERSION,
  requiresDefenceEssenceProjectVersion,
} from './defenceEssenceProjectVersion'
import {
  DESECRATION_COUNT_RULES_VERSION,
  requiresDesecrationCountProjectVersion,
} from './desecrationCountProjectVersion'
import {
  DESTRUCTION_RUNE_RULES_VERSION,
  requiresDestructionRuneProjectVersion,
} from './destructionRuneProjectVersion'
import {
  ESSENCE_OUTCOMES_RULES_VERSION,
  requiresEssenceOutcomesProjectVersion,
} from './essenceOutcomesProjectVersion'
import type { ItemDictionary } from './export'
import {
  EXTENDED_ARMOUR_RUNE_RULES_VERSION,
  requiresExtendedArmourRuneProjectVersion,
} from './extendedArmourRuneProjectVersion'
import {
  EXTENDED_INFLUENCE_BONE_RULES_VERSION,
  requiresExtendedInfluenceBoneProjectVersion,
} from './extendedInfluenceBoneProjectVersion'
import { FLASK_CRAFT_RULES_VERSION, requiresFlaskProjectVersion } from './flaskProjectVersion'
import {
  GLOVE_IDOL_RULES_VERSION,
  requiresGloveIdolProjectVersion,
} from './gloveIdolProjectVersion'
import {
  GRANTED_SKILL_TARGET_RULES_VERSION,
  requiresGrantedSkillTargetProjectVersion,
} from './grantedSkillTargetProjectVersion'
import {
  HELMET_BOOT_IDOL_RULES_VERSION,
  requiresHelmetBootIdolProjectVersion,
} from './helmetBootIdolProjectVersion'
import {
  INFLUENCE_BONE_RULES_VERSION,
  requiresInfluenceBoneProjectVersion,
} from './influenceBoneProjectVersion'
import {
  INFLUENCE_RUNE_RULES_VERSION,
  requiresInfluenceRuneProjectVersion,
} from './influenceRuneProjectVersion'
import {
  MASTERWORK_CRAFT_RULES_VERSION,
  requiresMasterworkProjectVersion,
} from './masterworkProjectVersion'
import {
  OFFHAND_IDOL_RULES_VERSION,
  requiresOffhandIdolProjectVersion,
} from './offhandIdolProjectVersion'
import {
  PANEL_GOAL_RULES_VERSION,
  requiresPanelGoalProjectVersion,
} from './panelGoalProjectVersion'
import {
  PENDING_EXALTATION_RULES_VERSION,
  requiresPendingExaltationProjectVersion,
} from './pendingExaltationProjectVersion'
import {
  PUTREFACTION_RULES_VERSION,
  requiresPutrefactionProjectVersion,
} from './putrefactionProjectVersion'
import type { CraftResult } from './rehearsal'
import { runeforgingCatalogSignature } from './runeforgingCatalog'
import {
  requiresSceptreAugmentProjectVersion,
  SCEPTRE_AUGMENT_RULES_VERSION,
} from './sceptreAugmentProjectVersion'
import { requiresSerleProjectVersion, SERLE_RULES_VERSION } from './serleProjectVersion'
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
import {
  requiresSpecialMartialRuneProjectVersion,
  SPECIAL_MARTIAL_RUNE_RULES_VERSION,
} from './specialMartialRuneProjectVersion'
import { statScalabilitySourceHash } from './statScalability'
import {
  requiresTalismanProjectVersion,
  TALISMAN_CRAFT_RULES_VERSION,
} from './talismanProjectVersion'
import { targetProjectSourceHashes, targetProjectSourceUsage } from './targetProjectSources'
import { requiresWardRuneProjectVersion, WARD_RUNE_RULES_VERSION } from './wardRuneProjectVersion'
import {
  requiresWeightedPropertyProjectVersion,
  WEIGHTED_PROPERTY_RULES_VERSION,
} from './weightedPropertyProjectVersion'

/** 挂载外部项目时仅重验原始项目一次；外部 states 不读取、不参与恢复。 */
export function restoreTargetWorkbenchProject(
  input: unknown,
  catalog: CraftCatalog,
  dictionary?: ItemDictionary,
): CraftResult<RestoredTargetCraftProject> {
  let text: string
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input))
      return { ok: false, error: '演练项目无法读取。' }
    const descriptor = Object.getOwnPropertyDescriptor(input, 'project')
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !isPlainProjectJSON(descriptor.value))
      return { ok: false, error: '目标项目包含不能无损保存的 JSON 字段。' }
    text = JSON.stringify(descriptor.value)
  } catch {
    return { ok: false, error: '演练项目无法读取。' }
  }
  return loadTargetWorkbenchProject(text, catalog, dictionary)
}

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
    (value.rulesVersion === TARGET_CRAFT_RULES_VERSION ||
      value.rulesVersion === FLUX_CRAFT_RULES_VERSION ||
      value.rulesVersion === PERFECT_FLUX_CRAFT_RULES_VERSION ||
      value.rulesVersion === EXTRACTION_CRAFT_RULES_VERSION ||
      value.rulesVersion === CORRUPTION_STRATEGY_RULES_VERSION ||
      value.rulesVersion === RETAINED_CATALYST_RULES_VERSION ||
      value.rulesVersion === COMBAT_ARMOUR_RUNE_RULES_VERSION ||
      value.rulesVersion === RUNEFORGED_ARMOUR_RULES_VERSION ||
      value.rulesVersion === RUNEFORGE_CRAFT_RULES_VERSION ||
      value.rulesVersion === WARD_RUNE_RULES_VERSION ||
      value.rulesVersion === EXTENDED_ARMOUR_RUNE_RULES_VERSION ||
      value.rulesVersion === MASTERWORK_CRAFT_RULES_VERSION ||
      value.rulesVersion === ESSENCE_OUTCOMES_RULES_VERSION ||
      value.rulesVersion === SERLE_RULES_VERSION ||
      value.rulesVersion === CRAFTED_CAPACITY_RULES_VERSION ||
      value.rulesVersion === CONDITIONAL_ARMOUR_RUNE_RULES_VERSION ||
      value.rulesVersion === PENDING_EXALTATION_RULES_VERSION ||
      value.rulesVersion === DEFENCE_ESSENCE_RULES_VERSION ||
      value.rulesVersion === PANEL_GOAL_RULES_VERSION ||
      value.rulesVersion === OFFHAND_IDOL_RULES_VERSION ||
      value.rulesVersion === BODY_IDOL_RULES_VERSION ||
      value.rulesVersion === HELMET_BOOT_IDOL_RULES_VERSION ||
      value.rulesVersion === GLOVE_IDOL_RULES_VERSION ||
      value.rulesVersion === SCEPTRE_AUGMENT_RULES_VERSION ||
      value.rulesVersion === SPECIAL_MARTIAL_RUNE_RULES_VERSION ||
      value.rulesVersion === TALISMAN_CRAFT_RULES_VERSION ||
      value.rulesVersion === FLASK_CRAFT_RULES_VERSION ||
      value.rulesVersion === AMULET_CATALYST_RULES_VERSION ||
      value.rulesVersion === AMULET_SKILL_LEVEL_RULES_VERSION ||
      value.rulesVersion === AMULET_SKILL_SOCKETS_RULES_VERSION ||
      value.rulesVersion === SKILL_VARIANT_AMULET_RULES_VERSION ||
      value.rulesVersion === SKILL_LEVEL_DECLARATION_RULES_VERSION ||
      value.rulesVersion === SKILL_SOCKET_TARGET_RULES_VERSION ||
      value.rulesVersion === SKILL_SOCKETS_RULES_VERSION ||
      value.rulesVersion === WEIGHTED_PROPERTY_RULES_VERSION ||
      value.rulesVersion === GRANTED_SKILL_TARGET_RULES_VERSION ||
      value.rulesVersion === EXTENDED_INFLUENCE_BONE_RULES_VERSION ||
      value.rulesVersion === INFLUENCE_BONE_RULES_VERSION ||
      value.rulesVersion === DESTRUCTION_RUNE_RULES_VERSION ||
      value.rulesVersion === INFLUENCE_RUNE_RULES_VERSION ||
      value.rulesVersion === DESECRATION_COUNT_RULES_VERSION ||
      value.rulesVersion === PUTREFACTION_RULES_VERSION)
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
    !source.targetDefinitions.panelGoals?.length &&
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
  if (source.fluxCatalogSignature !== undefined) {
    if (
      next.rulesVersion !== DEFENCE_ESSENCE_RULES_VERSION &&
      next.rulesVersion !== PANEL_GOAL_RULES_VERSION &&
      next.rulesVersion !== OFFHAND_IDOL_RULES_VERSION &&
      next.rulesVersion !== BODY_IDOL_RULES_VERSION &&
      next.rulesVersion !== HELMET_BOOT_IDOL_RULES_VERSION &&
      next.rulesVersion !== GLOVE_IDOL_RULES_VERSION &&
      next.rulesVersion !== SCEPTRE_AUGMENT_RULES_VERSION &&
      next.rulesVersion !== SPECIAL_MARTIAL_RUNE_RULES_VERSION &&
      next.rulesVersion !== TALISMAN_CRAFT_RULES_VERSION &&
      next.rulesVersion !== FLASK_CRAFT_RULES_VERSION &&
      next.rulesVersion !== AMULET_CATALYST_RULES_VERSION &&
      next.rulesVersion !== AMULET_SKILL_LEVEL_RULES_VERSION &&
      next.rulesVersion !== AMULET_SKILL_SOCKETS_RULES_VERSION &&
      next.rulesVersion !== SKILL_VARIANT_AMULET_RULES_VERSION &&
      next.rulesVersion !== SKILL_LEVEL_DECLARATION_RULES_VERSION &&
      next.rulesVersion !== SKILL_SOCKET_TARGET_RULES_VERSION &&
      next.rulesVersion !== SKILL_SOCKETS_RULES_VERSION &&
      next.rulesVersion !== WEIGHTED_PROPERTY_RULES_VERSION &&
      next.rulesVersion !== GRANTED_SKILL_TARGET_RULES_VERSION &&
      next.rulesVersion !== EXTENDED_INFLUENCE_BONE_RULES_VERSION &&
      next.rulesVersion !== INFLUENCE_BONE_RULES_VERSION &&
      next.rulesVersion !== DESTRUCTION_RUNE_RULES_VERSION &&
      next.rulesVersion !== INFLUENCE_RUNE_RULES_VERSION &&
      next.rulesVersion !== DESECRATION_COUNT_RULES_VERSION &&
      next.rulesVersion !== PUTREFACTION_RULES_VERSION &&
      next.rulesVersion !== PENDING_EXALTATION_RULES_VERSION &&
      next.rulesVersion !== ESSENCE_OUTCOMES_RULES_VERSION &&
      next.rulesVersion !== SERLE_RULES_VERSION &&
      next.rulesVersion !== CRAFTED_CAPACITY_RULES_VERSION &&
      next.rulesVersion !== CONDITIONAL_ARMOUR_RUNE_RULES_VERSION &&
      next.rulesVersion !== MASTERWORK_CRAFT_RULES_VERSION &&
      next.rulesVersion !== EXTENDED_ARMOUR_RUNE_RULES_VERSION &&
      next.rulesVersion !== WARD_RUNE_RULES_VERSION &&
      next.rulesVersion !== RUNEFORGE_CRAFT_RULES_VERSION &&
      next.rulesVersion !== PERFECT_FLUX_CRAFT_RULES_VERSION &&
      next.rulesVersion !== EXTRACTION_CRAFT_RULES_VERSION &&
      next.rulesVersion !== CORRUPTION_STRATEGY_RULES_VERSION &&
      next.rulesVersion !== RETAINED_CATALYST_RULES_VERSION &&
      next.rulesVersion !== RUNEFORGED_ARMOUR_RULES_VERSION &&
      next.rulesVersion !== COMBAT_ARMOUR_RUNE_RULES_VERSION
    )
      next.rulesVersion = FLUX_CRAFT_RULES_VERSION
    next.fluxCatalogSignature = source.fluxCatalogSignature
  }
  next.targetDefinitions = structuredClone(source.targetDefinitions)
  next.orphanedTargets = structuredClone(source.orphanedTargets)
  delete next.strategy
  delete next.strategyStartStep
  delete next.targetImplicitValues
  if (source.strategy) next.strategy = structuredClone(source.strategy)
  if (source.strategy?.flow) next.strategyStartStep = next.cursor
  if (source.targetImplicitValues)
    next.targetImplicitValues = structuredClone(source.targetImplicitValues)
  if (
    next.rulesVersion === DEFENCE_ESSENCE_RULES_VERSION ||
    requiresDefenceEssenceProjectVersion(next) ||
    next.rulesVersion === PANEL_GOAL_RULES_VERSION ||
    requiresPanelGoalProjectVersion(next) ||
    next.rulesVersion === OFFHAND_IDOL_RULES_VERSION ||
    requiresOffhandIdolProjectVersion(next) ||
    next.rulesVersion === BODY_IDOL_RULES_VERSION ||
    requiresBodyIdolProjectVersion(next) ||
    next.rulesVersion === HELMET_BOOT_IDOL_RULES_VERSION ||
    requiresHelmetBootIdolProjectVersion(next) ||
    next.rulesVersion === GLOVE_IDOL_RULES_VERSION ||
    requiresGloveIdolProjectVersion(next) ||
    next.rulesVersion === SCEPTRE_AUGMENT_RULES_VERSION ||
    requiresSceptreAugmentProjectVersion(next) ||
    next.rulesVersion === SPECIAL_MARTIAL_RUNE_RULES_VERSION ||
    requiresSpecialMartialRuneProjectVersion(next) ||
    next.rulesVersion === TALISMAN_CRAFT_RULES_VERSION ||
    requiresTalismanProjectVersion(next, catalog) ||
    next.rulesVersion === FLASK_CRAFT_RULES_VERSION ||
    requiresFlaskProjectVersion(next, catalog) ||
    next.rulesVersion === AMULET_CATALYST_RULES_VERSION ||
    requiresAmuletCatalystProjectVersion(next) ||
    next.rulesVersion === AMULET_SKILL_LEVEL_RULES_VERSION ||
    requiresAmuletSkillLevelProjectVersion(next) ||
    next.rulesVersion === AMULET_SKILL_SOCKETS_RULES_VERSION ||
    requiresAmuletSkillSocketsProjectVersion(next) ||
    next.rulesVersion === SKILL_VARIANT_AMULET_RULES_VERSION ||
    requiresSkillVariantAmuletProjectVersion(next) ||
    next.rulesVersion === SKILL_LEVEL_DECLARATION_RULES_VERSION ||
    requiresSkillLevelDeclarationProjectVersion(next) ||
    next.rulesVersion === SKILL_SOCKET_TARGET_RULES_VERSION ||
    requiresSkillSocketTargetProjectVersion(next) ||
    next.rulesVersion === SKILL_SOCKETS_RULES_VERSION ||
    requiresSkillSocketsProjectVersion(next) ||
    next.rulesVersion === WEIGHTED_PROPERTY_RULES_VERSION ||
    requiresWeightedPropertyProjectVersion(next) ||
    next.rulesVersion === GRANTED_SKILL_TARGET_RULES_VERSION ||
    requiresGrantedSkillTargetProjectVersion(next) ||
    next.rulesVersion === EXTENDED_INFLUENCE_BONE_RULES_VERSION ||
    requiresExtendedInfluenceBoneProjectVersion(next) ||
    next.rulesVersion === INFLUENCE_BONE_RULES_VERSION ||
    requiresInfluenceBoneProjectVersion(next) ||
    next.rulesVersion === DESTRUCTION_RUNE_RULES_VERSION ||
    requiresDestructionRuneProjectVersion(next) ||
    next.rulesVersion === INFLUENCE_RUNE_RULES_VERSION ||
    requiresInfluenceRuneProjectVersion(next) ||
    next.rulesVersion === DESECRATION_COUNT_RULES_VERSION ||
    requiresDesecrationCountProjectVersion(next) ||
    next.rulesVersion === PUTREFACTION_RULES_VERSION ||
    requiresPutrefactionProjectVersion(next) ||
    next.rulesVersion === PENDING_EXALTATION_RULES_VERSION ||
    requiresPendingExaltationProjectVersion(next) ||
    next.rulesVersion === ESSENCE_OUTCOMES_RULES_VERSION ||
    requiresEssenceOutcomesProjectVersion(next) ||
    next.rulesVersion === SERLE_RULES_VERSION ||
    requiresSerleProjectVersion(next, catalog) ||
    next.rulesVersion === CRAFTED_CAPACITY_RULES_VERSION ||
    requiresCraftedCapacityProjectVersion(next, catalog) ||
    next.rulesVersion === CONDITIONAL_ARMOUR_RUNE_RULES_VERSION ||
    requiresConditionalArmourRuneProjectVersion(next, catalog) ||
    next.rulesVersion === MASTERWORK_CRAFT_RULES_VERSION ||
    requiresMasterworkProjectVersion(next) ||
    next.rulesVersion === EXTENDED_ARMOUR_RUNE_RULES_VERSION ||
    requiresExtendedArmourRuneProjectVersion(next, catalog) ||
    next.rulesVersion === WARD_RUNE_RULES_VERSION ||
    next.rulesVersion === RUNEFORGE_CRAFT_RULES_VERSION ||
    requiresWardRuneProjectVersion(next, catalog) ||
    requiresRuneforgeProjectVersion(next)
  ) {
    next.rulesVersion =
      next.rulesVersion === DEFENCE_ESSENCE_RULES_VERSION ||
      requiresDefenceEssenceProjectVersion(next)
        ? DEFENCE_ESSENCE_RULES_VERSION
        : next.rulesVersion === PANEL_GOAL_RULES_VERSION || requiresPanelGoalProjectVersion(next)
          ? PANEL_GOAL_RULES_VERSION
          : next.rulesVersion === OFFHAND_IDOL_RULES_VERSION ||
              requiresOffhandIdolProjectVersion(next)
            ? OFFHAND_IDOL_RULES_VERSION
            : next.rulesVersion === BODY_IDOL_RULES_VERSION || requiresBodyIdolProjectVersion(next)
              ? BODY_IDOL_RULES_VERSION
              : next.rulesVersion === HELMET_BOOT_IDOL_RULES_VERSION ||
                  requiresHelmetBootIdolProjectVersion(next)
                ? HELMET_BOOT_IDOL_RULES_VERSION
                : next.rulesVersion === GLOVE_IDOL_RULES_VERSION ||
                    requiresGloveIdolProjectVersion(next)
                  ? GLOVE_IDOL_RULES_VERSION
                  : next.rulesVersion === SCEPTRE_AUGMENT_RULES_VERSION ||
                      requiresSceptreAugmentProjectVersion(next)
                    ? SCEPTRE_AUGMENT_RULES_VERSION
                    : next.rulesVersion === SPECIAL_MARTIAL_RUNE_RULES_VERSION ||
                        requiresSpecialMartialRuneProjectVersion(next)
                      ? SPECIAL_MARTIAL_RUNE_RULES_VERSION
                      : next.rulesVersion === TALISMAN_CRAFT_RULES_VERSION ||
                          requiresTalismanProjectVersion(next, catalog)
                        ? TALISMAN_CRAFT_RULES_VERSION
                        : next.rulesVersion === FLASK_CRAFT_RULES_VERSION ||
                            requiresFlaskProjectVersion(next, catalog)
                          ? FLASK_CRAFT_RULES_VERSION
                          : next.rulesVersion === AMULET_CATALYST_RULES_VERSION ||
                              requiresAmuletCatalystProjectVersion(next)
                            ? AMULET_CATALYST_RULES_VERSION
                            : next.rulesVersion === AMULET_SKILL_LEVEL_RULES_VERSION ||
                                requiresAmuletSkillLevelProjectVersion(next)
                              ? AMULET_SKILL_LEVEL_RULES_VERSION
                              : next.rulesVersion === AMULET_SKILL_SOCKETS_RULES_VERSION ||
                                  requiresAmuletSkillSocketsProjectVersion(next)
                                ? AMULET_SKILL_SOCKETS_RULES_VERSION
                                : next.rulesVersion === SKILL_VARIANT_AMULET_RULES_VERSION ||
                                    requiresSkillVariantAmuletProjectVersion(next)
                                  ? SKILL_VARIANT_AMULET_RULES_VERSION
                                  : next.rulesVersion === SKILL_LEVEL_DECLARATION_RULES_VERSION ||
                                      requiresSkillLevelDeclarationProjectVersion(next)
                                    ? SKILL_LEVEL_DECLARATION_RULES_VERSION
                                    : next.rulesVersion === SKILL_SOCKET_TARGET_RULES_VERSION ||
                                        requiresSkillSocketTargetProjectVersion(next)
                                      ? SKILL_SOCKET_TARGET_RULES_VERSION
                                      : next.rulesVersion === SKILL_SOCKETS_RULES_VERSION ||
                                          requiresSkillSocketsProjectVersion(next)
                                        ? SKILL_SOCKETS_RULES_VERSION
                                        : next.rulesVersion === WEIGHTED_PROPERTY_RULES_VERSION ||
                                            requiresWeightedPropertyProjectVersion(next)
                                          ? WEIGHTED_PROPERTY_RULES_VERSION
                                          : next.rulesVersion ===
                                                GRANTED_SKILL_TARGET_RULES_VERSION ||
                                              requiresGrantedSkillTargetProjectVersion(next)
                                            ? GRANTED_SKILL_TARGET_RULES_VERSION
                                            : next.rulesVersion ===
                                                  EXTENDED_INFLUENCE_BONE_RULES_VERSION ||
                                                requiresExtendedInfluenceBoneProjectVersion(next)
                                              ? EXTENDED_INFLUENCE_BONE_RULES_VERSION
                                              : next.rulesVersion ===
                                                    INFLUENCE_BONE_RULES_VERSION ||
                                                  requiresInfluenceBoneProjectVersion(next)
                                                ? INFLUENCE_BONE_RULES_VERSION
                                                : next.rulesVersion ===
                                                      DESTRUCTION_RUNE_RULES_VERSION ||
                                                    requiresDestructionRuneProjectVersion(next)
                                                  ? DESTRUCTION_RUNE_RULES_VERSION
                                                  : next.rulesVersion ===
                                                        INFLUENCE_RUNE_RULES_VERSION ||
                                                      requiresInfluenceRuneProjectVersion(next)
                                                    ? INFLUENCE_RUNE_RULES_VERSION
                                                    : next.rulesVersion ===
                                                          DESECRATION_COUNT_RULES_VERSION ||
                                                        requiresDesecrationCountProjectVersion(next)
                                                      ? DESECRATION_COUNT_RULES_VERSION
                                                      : next.rulesVersion ===
                                                            PUTREFACTION_RULES_VERSION ||
                                                          requiresPutrefactionProjectVersion(next)
                                                        ? PUTREFACTION_RULES_VERSION
                                                        : next.rulesVersion ===
                                                              PENDING_EXALTATION_RULES_VERSION ||
                                                            requiresPendingExaltationProjectVersion(
                                                              next,
                                                            )
                                                          ? PENDING_EXALTATION_RULES_VERSION
                                                          : next.rulesVersion ===
                                                                ESSENCE_OUTCOMES_RULES_VERSION ||
                                                              requiresEssenceOutcomesProjectVersion(
                                                                next,
                                                              )
                                                            ? ESSENCE_OUTCOMES_RULES_VERSION
                                                            : next.rulesVersion ===
                                                                  SERLE_RULES_VERSION ||
                                                                requiresSerleProjectVersion(
                                                                  next,
                                                                  catalog,
                                                                )
                                                              ? SERLE_RULES_VERSION
                                                              : next.rulesVersion ===
                                                                    CRAFTED_CAPACITY_RULES_VERSION ||
                                                                  requiresCraftedCapacityProjectVersion(
                                                                    next,
                                                                    catalog,
                                                                  )
                                                                ? CRAFTED_CAPACITY_RULES_VERSION
                                                                : next.rulesVersion ===
                                                                      CONDITIONAL_ARMOUR_RUNE_RULES_VERSION ||
                                                                    requiresConditionalArmourRuneProjectVersion(
                                                                      next,
                                                                      catalog,
                                                                    )
                                                                  ? CONDITIONAL_ARMOUR_RUNE_RULES_VERSION
                                                                  : next.rulesVersion ===
                                                                        MASTERWORK_CRAFT_RULES_VERSION ||
                                                                      requiresMasterworkProjectVersion(
                                                                        next,
                                                                      )
                                                                    ? MASTERWORK_CRAFT_RULES_VERSION
                                                                    : next.rulesVersion ===
                                                                          EXTENDED_ARMOUR_RUNE_RULES_VERSION ||
                                                                        requiresExtendedArmourRuneProjectVersion(
                                                                          next,
                                                                          catalog,
                                                                        )
                                                                      ? EXTENDED_ARMOUR_RUNE_RULES_VERSION
                                                                      : next.rulesVersion ===
                                                                            WARD_RUNE_RULES_VERSION ||
                                                                          requiresWardRuneProjectVersion(
                                                                            next,
                                                                            catalog,
                                                                          )
                                                                        ? WARD_RUNE_RULES_VERSION
                                                                        : RUNEFORGE_CRAFT_RULES_VERSION
    if (requiresDestructionRuneProjectVersion(next) || requiresInfluenceRuneProjectVersion(next)) {
      const hash = catalog._meta.sources.find(
        (source) => source.path === 'src/Data/ModRunes.lua',
      )?.sha256
      if (!hash) return { ok: false, error: '沿用符文指引需要相同镶嵌目录。' }
      next.augmentSourceHash = hash
    }
    if (requiresRuneforgeProjectVersion(next)) {
      const signature = runeforgingCatalogSignature(catalog)
      if (signature === null) return { ok: false, error: '沿用锻造指引需要相同锻造配方目录。' }
      next.runeforgingCatalogSignature = signature
    }
  } else if (requiresRuneforgedArmourProjectVersion(next, catalog))
    next.rulesVersion = RUNEFORGED_ARMOUR_RULES_VERSION
  else if (requiresCombatArmourRuneProjectVersion(next, catalog))
    next.rulesVersion = COMBAT_ARMOUR_RUNE_RULES_VERSION
  if (
    next.rulesVersion !== DEFENCE_ESSENCE_RULES_VERSION &&
    next.rulesVersion !== PANEL_GOAL_RULES_VERSION &&
    next.rulesVersion !== OFFHAND_IDOL_RULES_VERSION &&
    next.rulesVersion !== BODY_IDOL_RULES_VERSION &&
    next.rulesVersion !== HELMET_BOOT_IDOL_RULES_VERSION &&
    next.rulesVersion !== GLOVE_IDOL_RULES_VERSION &&
    next.rulesVersion !== SCEPTRE_AUGMENT_RULES_VERSION &&
    next.rulesVersion !== SPECIAL_MARTIAL_RUNE_RULES_VERSION &&
    next.rulesVersion !== TALISMAN_CRAFT_RULES_VERSION &&
    next.rulesVersion !== FLASK_CRAFT_RULES_VERSION &&
    next.rulesVersion !== AMULET_CATALYST_RULES_VERSION &&
    next.rulesVersion !== AMULET_SKILL_LEVEL_RULES_VERSION &&
    next.rulesVersion !== AMULET_SKILL_SOCKETS_RULES_VERSION &&
    next.rulesVersion !== SKILL_VARIANT_AMULET_RULES_VERSION &&
    next.rulesVersion !== SKILL_LEVEL_DECLARATION_RULES_VERSION &&
    next.rulesVersion !== SKILL_SOCKET_TARGET_RULES_VERSION &&
    next.rulesVersion !== SKILL_SOCKETS_RULES_VERSION &&
    next.rulesVersion !== WEIGHTED_PROPERTY_RULES_VERSION &&
    next.rulesVersion !== GRANTED_SKILL_TARGET_RULES_VERSION &&
    next.rulesVersion !== EXTENDED_INFLUENCE_BONE_RULES_VERSION &&
    next.rulesVersion !== INFLUENCE_BONE_RULES_VERSION &&
    next.rulesVersion !== DESTRUCTION_RUNE_RULES_VERSION &&
    next.rulesVersion !== INFLUENCE_RUNE_RULES_VERSION &&
    next.rulesVersion !== DESECRATION_COUNT_RULES_VERSION &&
    next.rulesVersion !== PUTREFACTION_RULES_VERSION &&
    next.rulesVersion !== PENDING_EXALTATION_RULES_VERSION &&
    next.rulesVersion !== ESSENCE_OUTCOMES_RULES_VERSION &&
    next.rulesVersion !== SERLE_RULES_VERSION &&
    next.rulesVersion !== CRAFTED_CAPACITY_RULES_VERSION &&
    next.rulesVersion !== CONDITIONAL_ARMOUR_RUNE_RULES_VERSION &&
    next.rulesVersion !== MASTERWORK_CRAFT_RULES_VERSION &&
    next.rulesVersion !== EXTENDED_ARMOUR_RUNE_RULES_VERSION &&
    next.rulesVersion !== WARD_RUNE_RULES_VERSION &&
    next.rulesVersion !== RUNEFORGE_CRAFT_RULES_VERSION &&
    next.rulesVersion !== RUNEFORGED_ARMOUR_RULES_VERSION &&
    next.rulesVersion !== COMBAT_ARMOUR_RUNE_RULES_VERSION &&
    requiresRetainedCatalystProjectVersion(current.value.states, catalog)
  )
    next.rulesVersion = RETAINED_CATALYST_RULES_VERSION
  if (
    next.rulesVersion !== CORRUPTION_STRATEGY_RULES_VERSION &&
    next.rulesVersion !== RETAINED_CATALYST_RULES_VERSION &&
    next.rulesVersion !== DEFENCE_ESSENCE_RULES_VERSION &&
    next.rulesVersion !== PANEL_GOAL_RULES_VERSION &&
    next.rulesVersion !== OFFHAND_IDOL_RULES_VERSION &&
    next.rulesVersion !== BODY_IDOL_RULES_VERSION &&
    next.rulesVersion !== HELMET_BOOT_IDOL_RULES_VERSION &&
    next.rulesVersion !== GLOVE_IDOL_RULES_VERSION &&
    next.rulesVersion !== SCEPTRE_AUGMENT_RULES_VERSION &&
    next.rulesVersion !== SPECIAL_MARTIAL_RUNE_RULES_VERSION &&
    next.rulesVersion !== TALISMAN_CRAFT_RULES_VERSION &&
    next.rulesVersion !== FLASK_CRAFT_RULES_VERSION &&
    next.rulesVersion !== AMULET_CATALYST_RULES_VERSION &&
    next.rulesVersion !== AMULET_SKILL_LEVEL_RULES_VERSION &&
    next.rulesVersion !== AMULET_SKILL_SOCKETS_RULES_VERSION &&
    next.rulesVersion !== SKILL_VARIANT_AMULET_RULES_VERSION &&
    next.rulesVersion !== SKILL_LEVEL_DECLARATION_RULES_VERSION &&
    next.rulesVersion !== SKILL_SOCKET_TARGET_RULES_VERSION &&
    next.rulesVersion !== SKILL_SOCKETS_RULES_VERSION &&
    next.rulesVersion !== WEIGHTED_PROPERTY_RULES_VERSION &&
    next.rulesVersion !== GRANTED_SKILL_TARGET_RULES_VERSION &&
    next.rulesVersion !== EXTENDED_INFLUENCE_BONE_RULES_VERSION &&
    next.rulesVersion !== INFLUENCE_BONE_RULES_VERSION &&
    next.rulesVersion !== DESTRUCTION_RUNE_RULES_VERSION &&
    next.rulesVersion !== INFLUENCE_RUNE_RULES_VERSION &&
    next.rulesVersion !== DESECRATION_COUNT_RULES_VERSION &&
    next.rulesVersion !== PUTREFACTION_RULES_VERSION &&
    next.rulesVersion !== PENDING_EXALTATION_RULES_VERSION &&
    next.rulesVersion !== ESSENCE_OUTCOMES_RULES_VERSION &&
    next.rulesVersion !== SERLE_RULES_VERSION &&
    next.rulesVersion !== CRAFTED_CAPACITY_RULES_VERSION &&
    next.rulesVersion !== CONDITIONAL_ARMOUR_RUNE_RULES_VERSION &&
    next.rulesVersion !== MASTERWORK_CRAFT_RULES_VERSION &&
    next.rulesVersion !== EXTENDED_ARMOUR_RUNE_RULES_VERSION &&
    next.rulesVersion !== WARD_RUNE_RULES_VERSION &&
    next.rulesVersion !== RUNEFORGE_CRAFT_RULES_VERSION &&
    next.rulesVersion !== RUNEFORGED_ARMOUR_RULES_VERSION &&
    next.rulesVersion !== COMBAT_ARMOUR_RUNE_RULES_VERSION
  ) {
    if (requiresCorruptionStrategyProjectVersion(next))
      next.rulesVersion = CORRUPTION_STRATEGY_RULES_VERSION
    else if (requiresExtractionProjectVersion(next))
      next.rulesVersion = EXTRACTION_CRAFT_RULES_VERSION
    else if (
      next.rulesVersion !== EXTRACTION_CRAFT_RULES_VERSION &&
      requiresPerfectFluxProjectVersion(next)
    )
      next.rulesVersion = PERFECT_FLUX_CRAFT_RULES_VERSION
  }
  for (const key of [
    'essenceSourceHash',
    'liquidEmotionSourceHash',
    'alloyCatalogSignature',
    'desecrationSourceHash',
    'augmentSourceHash',
    'scalabilitySourceHash',
    'jewelSourceHash',
    'flaskSourceHash',
  ] as const)
    if (source[key] !== undefined) next[key] = source[key]
  if (
    requiresOffhandIdolProjectVersion(next) ||
    requiresBodyIdolProjectVersion(next) ||
    requiresHelmetBootIdolProjectVersion(next) ||
    requiresGloveIdolProjectVersion(next) ||
    requiresSceptreAugmentProjectVersion(next)
  ) {
    const augmentHash = catalog._meta.sources.find(
      (source) => source.path === 'src/Data/ModRunes.lua',
    )?.sha256
    const scalabilityHash = statScalabilitySourceHash(catalog)
    if (!augmentHash || !scalabilityHash)
      return { ok: false, error: '沿用镶嵌指引需要完整镶嵌与属性缩放来源。' }
    next.augmentSourceHash = augmentHash
    next.scalabilitySourceHash = scalabilityHash
  }
  const types = [
    ...next.targetDefinitions.targets.map((t) => t.modId),
    ...next.targetDefinitions.alternatives.flatMap((a) => a.modIds),
    ...next.orphanedTargets.map((t) => t.modId),
  ]
  const sources = targetProjectSourceUsage(catalog, next.initialState.baseId, types)
  if (!sources.flask) delete next.flaskSourceHash
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
