import { usesJewelCapacity } from './affixCapacity'
import { isIdentifiedCraftState } from './affixIdentity'
import { usesSovereignResistance } from './alloyEffects'
import { alloyProjectUsage } from './alloyProjectUsage'
import { alloyCatalogSignature as readAlloyCatalogSignature } from './alloys'
import { requiresAmuletCatalystProjectVersion } from './amuletCatalystProjectVersion'
import { requiresAmuletSkillLevelProjectVersion } from './amuletSkillLevelProjectVersion'
import { requiresAmuletSkillSocketsProjectVersion } from './amuletSkillSocketsProjectVersion'
import { readStatAnnotations } from './annotations'
import { isArchitectCraftOperation } from './architect'
import { isBeltCapacityBase, resolveCraftImplicitPatterns } from './beltImplicits'
import {
  clonePendingDesecration,
  isBoneCraftOperation,
  isBoneOperationKind,
  isPendingDesecration,
} from './boneRules'
import { type CraftCatalog, hasCraftModEligibility, hasGenesisModEligibility } from './catalog'
import { isCatalystQuality } from './catalystQuality'
import { requiresCombatArmourRuneProjectVersion } from './combatArmourRuneProjectVersion'
import { requiresConditionalArmourRuneProjectVersion } from './conditionalArmourRuneProjectVersion'
import { isVaalCraftOperation } from './corruptionRules'
import { requiresCorruptionStrategyProjectVersion } from './corruptionStrategyProjectVersion'
import { type CraftPricing, parseCraftPricing } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { requiresCraftedCapacityProjectVersion } from './craftedCapacityProjectVersion'
import { equivalentProjectJSON } from './craftProjectJSON'
import { applyCraftStep, type CraftStep, isAlloyCraftOperation } from './craftSteps'
import { type CraftStrategy, readCraftStrategy } from './craftStrategy'
import { desecrationSourceHash as readDesecrationSourceHash } from './desecration'
import { requiresDesecrationCountProjectVersion } from './desecrationCountProjectVersion'
import { requiresDestructionRuneProjectVersion } from './destructionRuneProjectVersion'
import { isEssenceOmen } from './essenceOmens'
import { requiresEssenceOutcomesProjectVersion } from './essenceOutcomesProjectVersion'
import {
  essenceCraftMode,
  isEssenceMappedMod,
  essenceSourceHash as readEssenceSourceHash,
} from './essences'
import { type ItemDictionary, inspectItem } from './export'
import { requiresExtendedArmourRuneProjectVersion } from './extendedArmourRuneProjectVersion'
import { requiresExtendedInfluenceBoneProjectVersion } from './extendedInfluenceBoneProjectVersion'
import { isExtractionCraftOperation } from './extraction'
import { requiresExtractionProjectVersion } from './extractionProjectVersion'
import { isFluxCraftOperation } from './fluxCraft'
import { fluxEligibleModIds } from './fluxes'
import { isFractureCraftOperation } from './fracture'
import { validateCraftFractureTarget } from './fractureTargets'
import { matchesGrantedSkillImplicitLines, readUnlevelledSkillName } from './grantedSkills'
import { requiresGrantedSkillTargetProjectVersion } from './grantedSkillTargetProjectVersion'
import {
  type CraftImplicitTargetValues,
  readCraftImplicitTargets,
  validateCraftImplicitTargets,
  validateStoredCraftImplicitTargets,
} from './implicitTargets'
import { requiresInfluenceBoneProjectVersion } from './influenceBoneProjectVersion'
import { requiresInfluenceRuneProjectVersion } from './influenceRuneProjectVersion'
import { JEWEL_EFFECT_EMOTION_ID } from './jewelEffectRules'
import { usesJewelEffect } from './jewelEffects'
import { isRadiusJewel, jewelSourceHash as readJewelSourceHash } from './jewels'
import {
  liquidEmotionSourceHash as readLiquidEmotionSourceHash,
  supportedBasicLiquidEmotionId,
  supportedRadiusLiquidEmotionId,
} from './liquidEmotions'
import { isMasterworkCraftOperation } from './masterwork'
import { requiresMasterworkProjectVersion } from './masterworkProjectVersion'
import { CRAFT_OMEN_RULES, type CraftOmen, isCraftOmen } from './omens'
import { parseItem } from './parse'
import { requiresPendingExaltationProjectVersion } from './pendingExaltationProjectVersion'
import { isPerfectFluxCraftOperation } from './perfectFlux'
import { requiresPerfectFluxProjectVersion } from './perfectFluxProjectVersion'
import { requiresPutrefactionProjectVersion } from './putrefactionProjectVersion'
import {
  CRAFT_CURRENCY_LABELS,
  type CraftCurrency,
  type CraftOperation,
  type CraftResult,
  type CraftState,
  createCraftState,
} from './rehearsal'
import { importCraftState, importIdentifiedCraftState } from './rehearsalImport'
import { RESISTANCE_LABELS } from './resistances'
import { requiresRetainedCatalystProjectVersion } from './retainedCatalystProjectVersion'
import { isSupportedArmourRune, isUtilityArmourRune, parseRuneEffectTotals } from './runeEffects'
import { isRuneforgeCraftOperation } from './runeforge'
import { requiresRuneforgedArmourProjectVersion } from './runeforgedProjectVersion'
import { requiresRuneforgeProjectVersion } from './runeforgeProjectVersion'
import { requiresSerleProjectVersion } from './serleProjectVersion'
import { requiresSkillLevelDeclarationProjectVersion } from './skillLevelDeclarationProjectVersion'
import { isSkillSocketsCraftOperation } from './skillSockets'
import { requiresSkillSocketsProjectVersion } from './skillSocketsProjectVersion'
import { requiresSkillSocketTargetProjectVersion } from './skillSocketTargetProjectVersion'
import { requiresSkillVariantAmuletProjectVersion } from './skillVariantAmuletProjectVersion'
import { isHorrorSocketAffix } from './socketAmplification'
import { isSupportedSoulCore } from './soulCoreEffects'
import { statScalabilitySourceHash } from './statScalability'
import { craftStrategyLeaves } from './strategyConditions'
import { validStrategyStartStep } from './strategyStages'
import { targetProjectSourceUsage } from './targetProjectSources'
import {
  type CraftTargetAlternative,
  type CraftTargetValues,
  validateCraftTargetAlternatives,
  validateCraftTargets,
  validateCraftTargetValues,
  validateStoredCraftTargetValues,
} from './targets'
import { requiresWardRuneProjectVersion } from './wardRuneProjectVersion'
import { isExtendedWeaponRune } from './weaponRuneEffects'
import { requiresWeightedPropertyProjectVersion } from './weightedPropertyProjectVersion'

export const CRAFT_RULES_VERSION = 'basic-2026-09-12-v72'
const JEWEL_CAPACITY_EMOTION_ID = 'Metadata/Items/Currency/EndgameDistilledEmotion3'
const ORIGINAL_CURRENCIES = new Set([
  'transmutation',
  'augmentation',
  'regal',
  'alchemy',
  'exalted',
  'chaos',
  'annulment',
  'divine',
])
export const MAX_CRAFT_PROJECT_BYTES = 2_000_000
const MAX_OPERATIONS = 1000

export interface CraftProject {
  strategyStartStep?: number
  strategy?: CraftStrategy
  minimumTargetCount?: number
  scalabilitySourceHash?: string
  pricing?: CraftPricing
  schemaVersion: 1
  sourceCommit: string
  rulesVersion: typeof CRAFT_RULES_VERSION
  initialState: CraftState
  operations: CraftStep[]
  cursor: number
  targetModIds?: string[]
  targetFracturedModId?: string
  targetValues?: CraftTargetValues[]
  targetImplicitValues?: CraftImplicitTargetValues[]
  targetAlternatives?: CraftTargetAlternative[]
  desecrationSourceHash?: string
  jewelSourceHash?: string
  essenceSourceHash?: string
  liquidEmotionSourceHash?: string
  alloyCatalogSignature?: string
  augmentSourceHash?: string
  corruptionSourceHash?: string
  importedSockets?: (string | null)[]
  importedQuality?: number
}

export interface RestoredCraftProject {
  project: CraftProject
  states: CraftState[]
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function readRulesVersion(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^basic-2026-09-12-v(\d+)$/.exec(value)
  if (!match?.[1]) return null
  const version = Number(match[1])
  return String(version) === match[1] && version >= 2 && version <= 72 ? version : null
}

function readState(
  value: unknown,
  native = false,
  skillSocketTargets = false,
  skillLevelDeclarations = false,
): CraftState | null {
  if (
    !record(value) ||
    !exactKeys(value, [
      ...(native ? ['nextAffixId'] : []),
      ...(skillSocketTargets ? ['declaredSkillSockets'] : []),
      ...(skillLevelDeclarations ? ['declaredSkillLevel'] : []),
      'baseId',
      'itemLevel',
      'rarity',
      'affixes',
      'sourceText',
      'implicitLines',
      'sockets',
      'runeSourceLines',
      'quality',
      'catalyst',
      'corrupted',
      'corruption',
      'secondCorruption',
      'twiceCorrupted',
      'pendingDesecration',
    ])
  )
    return null
  if (
    !nonempty(value.baseId) ||
    typeof value.itemLevel !== 'number' ||
    typeof value.rarity !== 'string' ||
    !['normal', 'magic', 'rare'].includes(value.rarity)
  )
    return null
  if (Object.hasOwn(value, 'corrupted') && value.corrupted !== true) return null
  if (Object.hasOwn(value, 'twiceCorrupted') && value.twiceCorrupted !== true) return null
  const corruptionFields: Pick<CraftState, 'corruption' | 'secondCorruption'> = {}
  for (const key of ['corruption', 'secondCorruption'] as const) {
    if (!Object.hasOwn(value, key)) continue
    const entry = value[key]
    if (
      !record(entry) ||
      !exactKeys(entry, ['modId', 'lines']) ||
      !nonempty(entry.modId) ||
      !Array.isArray(entry.lines) ||
      entry.lines.length > 32 ||
      !entry.lines.every(nonempty)
    )
      return null
    corruptionFields[key] = { modId: entry.modId, lines: [...entry.lines] }
  }
  if (value.sourceText !== null && typeof value.sourceText !== 'string') return null
  if (Object.hasOwn(value, 'catalyst') && !isCatalystQuality(value.catalyst)) return null
  if (
    Object.hasOwn(value, 'quality') &&
    (typeof value.quality !== 'number' ||
      !Number.isInteger(value.quality) ||
      value.quality < 0 ||
      value.quality > 30)
  )
    return null
  if (!Array.isArray(value.affixes) || value.affixes.length > 7) return null
  if (
    Object.hasOwn(value, 'sockets') &&
    (!Array.isArray(value.sockets) ||
      value.sockets.length > 10 ||
      !value.sockets.every((id) => id === null || nonempty(id)))
  )
    return null
  if (
    Object.hasOwn(value, 'implicitLines') &&
    (!Array.isArray(value.implicitLines) || !value.implicitLines.every(nonempty))
  )
    return null
  if (
    Object.hasOwn(value, 'runeSourceLines') &&
    (!Array.isArray(value.runeSourceLines) || !value.runeSourceLines.every(nonempty))
  )
    return null
  if (Object.hasOwn(value, 'pendingDesecration') && !isPendingDesecration(value.pendingDesecration))
    return null
  const affixes: CraftState['affixes'] = []
  for (const affix of value.affixes) {
    if (
      !record(affix) ||
      !exactKeys(affix, [
        'modId',
        'lines',
        'crafted',
        'desecrated',
        'fractured',
        ...(native ? ['affixId'] : []),
      ]) ||
      (Object.hasOwn(affix, 'crafted') && affix.crafted !== true) ||
      (Object.hasOwn(affix, 'desecrated') && affix.desecrated !== true) ||
      (Object.hasOwn(affix, 'fractured') && affix.fractured !== true) ||
      !nonempty(affix.modId) ||
      !Array.isArray(affix.lines) ||
      !affix.lines.every(nonempty)
    )
      return null
    affixes.push({
      ...(native ? { affixId: affix.affixId as string } : {}),
      modId: affix.modId,
      lines: [...affix.lines],
      ...(affix.crafted === true ? { crafted: true } : {}),
      ...(affix.desecrated === true ? { desecrated: true } : {}),
      ...(affix.fractured === true ? { fractured: true } : {}),
    })
  }
  return {
    ...(isPendingDesecration(value.pendingDesecration)
      ? { pendingDesecration: clonePendingDesecration(value.pendingDesecration) }
      : {}),
    ...(native ? { nextAffixId: value.nextAffixId as number } : {}),
    ...(Object.hasOwn(value, 'declaredSkillSockets')
      ? { declaredSkillSockets: value.declaredSkillSockets as 2 | 3 | 4 | 5 }
      : {}),
    ...(Object.hasOwn(value, 'declaredSkillLevel')
      ? { declaredSkillLevel: value.declaredSkillLevel as number }
      : {}),
    baseId: value.baseId,
    itemLevel: value.itemLevel,
    rarity: value.rarity as CraftState['rarity'],
    affixes,
    sourceText: value.sourceText,
    ...(value.corrupted === true ? { corrupted: true } : {}),
    ...corruptionFields,
    ...(value.twiceCorrupted ? { twiceCorrupted: true } : {}),
    ...(isCatalystQuality(value.catalyst) ? { catalyst: { ...value.catalyst } } : {}),
    ...(Array.isArray(value.runeSourceLines)
      ? { runeSourceLines: [...value.runeSourceLines] as string[] }
      : {}),
    ...(Array.isArray(value.sockets) ? { sockets: [...value.sockets] as (string | null)[] } : {}),
    ...(Array.isArray(value.implicitLines)
      ? { implicitLines: [...value.implicitLines] as string[] }
      : {}),
    ...(typeof value.quality === 'number' ? { quality: value.quality } : {}),
  }
}

function numericValues(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    value.every((number) => typeof number === 'number' && Number.isFinite(number))
  )
}

function readOperation(value: unknown): CraftStep | null {
  if (record(value) && value.kind === 'fracture')
    return isFractureCraftOperation(value) ? value : null
  if (record(value) && isBoneOperationKind(value.kind))
    return isBoneCraftOperation(value) ? value : null
  if (record(value) && Object.hasOwn(value, 'kind')) {
    if (value.kind === 'alloy')
      return isAlloyCraftOperation(value) ? { ...value, values: [...value.values] } : null
    if (value.kind === 'liquid-emotion')
      return exactKeys(value, ['kind', 'emotionId', 'removeModId', 'values', 'resultKind']) &&
        (!Object.hasOwn(value, 'resultKind') ||
          value.resultKind === 'prefix' ||
          value.resultKind === 'suffix') &&
        nonempty(value.emotionId) &&
        nonempty(value.removeModId) &&
        numericValues(value.values)
        ? {
            kind: 'liquid-emotion',
            emotionId: value.emotionId,
            removeModId: value.removeModId,
            values: [...value.values],
            ...(value.resultKind === 'prefix' || value.resultKind === 'suffix'
              ? { resultKind: value.resultKind }
              : {}),
          }
        : null
    if (value.kind === 'essence')
      return exactKeys(value, [
        'kind',
        'essenceId',
        'values',
        'removeModId',
        'omen',
        'resultModId',
      ]) &&
        (!Object.hasOwn(value, 'omen') || isEssenceOmen(value.omen)) &&
        nonempty(value.essenceId) &&
        (!Object.hasOwn(value, 'resultModId') || nonempty(value.resultModId)) &&
        numericValues(value.values) &&
        (!Object.hasOwn(value, 'removeModId') || nonempty(value.removeModId))
        ? {
            kind: 'essence',
            essenceId: value.essenceId,
            ...(typeof value.resultModId === 'string' ? { resultModId: value.resultModId } : {}),
            ...(isEssenceOmen(value.omen) ? { omen: value.omen } : {}),
            values: [...value.values],
            ...(typeof value.removeModId === 'string' ? { removeModId: value.removeModId } : {}),
          }
        : null
    if (value.kind === 'architect')
      return isArchitectCraftOperation(value)
        ? value.outcome === 'enchant'
          ? { ...value, values: [...value.values] }
          : { ...value }
        : null
    if (value.kind === 'vaal')
      return isVaalCraftOperation(value)
        ? value.outcome === 'enchant'
          ? { ...value, values: [...value.values] }
          : value.outcome === 'reroll'
            ? {
                ...value,
                replacements: value.replacements.map((entry) => ({
                  ...entry,
                  values: [...entry.values],
                })),
              }
            : { ...value }
        : null
    if (value.kind === 'artificer') return exactKeys(value, ['kind']) ? { kind: 'artificer' } : null
    if (
      !exactKeys(value, ['kind', 'socketIndex', 'augmentId']) ||
      value.kind !== 'socket' ||
      typeof value.socketIndex !== 'number' ||
      !Number.isInteger(value.socketIndex) ||
      value.socketIndex < 0 ||
      !nonempty(value.augmentId)
    )
      return null
    return { kind: 'socket', socketIndex: value.socketIndex, augmentId: value.augmentId }
  }
  if (
    !record(value) ||
    !exactKeys(value, ['currency', 'modIds', 'removeModId', 'rolls', 'implicitValues', 'omen'])
  )
    return null
  if (typeof value.currency !== 'string' || !Object.hasOwn(CRAFT_CURRENCY_LABELS, value.currency))
    return null
  if (!Array.isArray(value.modIds) || value.modIds.length > 4 || !value.modIds.every(nonempty))
    return null
  if (Object.hasOwn(value, 'omen') && !isCraftOmen(value.omen)) return null
  if (Object.hasOwn(value, 'removeModId') && !nonempty(value.removeModId)) return null
  const rolls: NonNullable<CraftOperation['rolls']> = []
  if (Object.hasOwn(value, 'rolls')) {
    if (!Array.isArray(value.rolls) || value.rolls.length > 7) return null
    for (const roll of value.rolls) {
      if (
        !record(roll) ||
        !exactKeys(roll, ['modId', 'values']) ||
        !nonempty(roll.modId) ||
        !numericValues(roll.values)
      )
        return null
      rolls.push({ modId: roll.modId, values: [...roll.values] })
    }
  }
  if (Object.hasOwn(value, 'implicitValues') && !numericValues(value.implicitValues)) return null
  return {
    currency: value.currency as CraftCurrency,
    ...(Object.hasOwn(value, 'omen') ? { omen: value.omen as CraftOmen } : {}),
    modIds: [...value.modIds],
    ...(typeof value.removeModId === 'string' ? { removeModId: value.removeModId } : {}),
    ...(Object.hasOwn(value, 'rolls') ? { rolls } : {}),
    ...(numericValues(value.implicitValues) ? { implicitValues: [...value.implicitValues] } : {}),
  }
}

/** v75 操作要求每个选择和数值条目保留身份；结构投影只复用旧语法，执行始终用原操作。 */
function readNativeOperation(
  input: unknown,
  perfectFlux: boolean,
  extraction: boolean,
  runeforge: boolean,
  masterwork: boolean,
  skillSockets: boolean,
): CraftStep | null {
  if (record(input) && input.kind === 'masterwork')
    return masterwork && isMasterworkCraftOperation(input) ? input : null
  if (record(input) && input.kind === 'runeforge')
    return runeforge && isRuneforgeCraftOperation(input) ? input : null
  if (record(input) && input.kind === 'extraction')
    return extraction && isExtractionCraftOperation(input) ? input : null
  if (!record(input)) return null
  if (input.kind === 'skill-sockets')
    return skillSockets && isSkillSocketsCraftOperation(input) ? input : null
  if (input.kind === 'perfect-flux')
    return perfectFlux && isPerfectFluxCraftOperation(input) ? input : null
  if (input.kind === 'flux') return isFluxCraftOperation(input) ? input : null
  const projection = structuredClone(input)
  if (Object.hasOwn(projection, 'removeModId')) {
    if (!nonempty(projection.removeAffixId)) return null
    delete projection.removeAffixId
  }
  if (projection.kind === 'fracture') {
    if (!nonempty(projection.affixId)) return null
    delete projection.affixId
  }
  if (typeof projection.currency === 'string' && Array.isArray(projection.rolls)) {
    for (const roll of projection.rolls) {
      if (!record(roll) || !nonempty(roll.affixId)) return null
      delete roll.affixId
    }
  }
  if (
    projection.kind === 'vaal' &&
    projection.outcome === 'reroll' &&
    Array.isArray(projection.replacements)
  ) {
    for (const replacement of projection.replacements) {
      if (!record(replacement) || !nonempty(replacement.removeAffixId)) return null
      delete replacement.removeAffixId
    }
  }
  const checked = readOperation(projection)
  return checked && equivalentProjectJSON(projection, checked)
    ? (input as unknown as CraftStep)
    : null
}

function validateInitial(
  state: CraftState,
  catalog: CraftCatalog,
  dictionary: ItemDictionary,
  importedSockets?: readonly (string | null)[],
  importedQuality?: number,
  legacy = false,
  native = false,
): CraftResult<CraftState> {
  if (Object.hasOwn(state, 'pendingDesecration'))
    return { ok: false, error: '项目起点不能预装待揭示亵渎；必须从已支持的起点回放骨骼操作。' }
  if (
    native &&
    (!isIdentifiedCraftState(state) ||
      state.nextAffixId !== state.affixes.length + 1 ||
      state.affixes.some((a, i) => a.affixId !== `a${i + 1}`))
  )
    return { ok: false, error: '项目初始词缀身份必须按原文顺序从 a1 连续分配。' }
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (state.sourceText === null) {
    if (state.corrupted)
      return { ok: false, error: '搜索起点不能预装腐化；请通过瓦尔结果步骤保留操作历史。' }
    if (state.catalyst && state.catalyst.declared !== true)
      return { ok: false, error: '搜索起点的催化品质需要明确声明。' }
    if (importedSockets !== undefined)
      return { ok: false, error: '孔位核对声明必须关联来源原文，不能用于空白起点。' }
    if (importedQuality !== undefined)
      return { ok: false, error: '导入品质声明必须关联来源原文，不能用于空白起点。' }
    if (state.sockets?.some((id) => id !== null))
      return { ok: false, error: '空白项目起点只能设定已有空孔，不能预设镶嵌物。' }
    if (state.implicitLines !== undefined) {
      const blankBase = catalog.bases.find((base) => base.id === state.baseId)
      if (blankBase === undefined) return { ok: false, error: '空白项目基底不存在。' }
      const implicit = resolveCraftImplicitPatterns(blankBase, state)
      if (!implicit.ok) return implicit
      const belt = implicit.value.charm
      const initialPatterns = implicit.value.patterns
      if (
        state.implicitLines.length !== initialPatterns.length ||
        initialPatterns.some((pattern, index) => {
          const actual = state.implicitLines?.[index]
          if (belt?.lineIndex === index) return false
          return (
            actual === undefined ||
            (pattern.startsWith('Grants Skill:')
              ? !matchesGrantedSkillImplicitLines([pattern], [actual])
              : actual !== pattern)
          )
        })
      )
        return { ok: false, error: '空白项目起点只能声明授予技能等级，不能预设其他固有属性数值。' }
    }
    return state.rarity === 'normal' && state.affixes.length === 0
      ? checked
      : { ok: false, error: '无来源原文的项目必须从空白普通基底开始。' }
  }
  const parsed = parseItem(state.sourceText)
  if (!parsed.ok) return { ok: false, error: `项目来源原文无法解析：${parsed.error}` }
  const sourceDictionary = createCraftItemDictionary(catalog, dictionary)
  const first = inspectItem(parsed.item, sourceDictionary)
  if (first.skills.length > 0 && state.implicitLines === undefined)
    return { ok: false, error: '授予技能来源项目必须保存完整固有属性，不能按旧规则补全。' }
  // 仅恢复仍存在于词典候选中的显式选择，不根据保存文件生成新译法。
  const selections: Record<number, string> = {}
  const baseName = catalog.bases.find((base) => base.id === state.baseId)?.name
  const baseCandidate = first.base.candidates.find((candidate) => candidate.english === baseName)
  const baseLine = parsed.item.nameLines.at(-1)?.line
  if (baseCandidate && baseLine !== undefined) selections[baseLine] = baseCandidate.id
  const explicit = first.mods.filter(({ mod }) => mod.kind === 'prefix' || mod.kind === 'suffix')
  for (const [index, group] of explicit.entries()) {
    for (const [lineIndex, stat] of group.stats.entries()) {
      const expected = state.affixes[index]?.lines[lineIndex]
      const candidate = stat.resolution.candidates.find(
        (entry) =>
          readStatAnnotations(entry.english).text === readStatAnnotations(expected ?? '').text,
      )
      if (candidate) selections[stat.source.line] = candidate.id
    }
  }
  const implicit = first.mods
    .filter(({ mod }) => mod.kind === 'implicit')
    .flatMap(({ stats }) => stats)
  for (const [index, stat] of implicit.entries()) {
    const expected = state.implicitLines?.[index]
    const candidate = stat.resolution.candidates.find(
      (entry) =>
        readStatAnnotations(entry.english).text === readStatAnnotations(expected ?? '').text,
    )
    if (candidate) selections[stat.source.line] = candidate.id
  }
  for (const [index, rune] of first.runes.entries()) {
    const expected = state.runeSourceLines?.[index]
    const candidate = rune.resolution.candidates.find(
      (entry) =>
        readStatAnnotations(entry.english).text === readStatAnnotations(expected ?? '').text,
    )
    if (candidate) selections[rune.source.line] = candidate.id
  }
  for (const skill of first.skills) {
    const candidate = skill.resolution.candidates.find((entry) =>
      state.implicitLines?.includes(entry.english),
    )
    if (candidate) selections[skill.source.line] = candidate.id
  }
  const restored = (native ? importIdentifiedCraftState : importCraftState)(
    catalog,
    state.baseId,
    parsed.item,
    inspectItem(parsed.item, sourceDictionary, selections),
    importedSockets,
    importedQuality,
    dictionary.stats?.entries,
    state.catalyst?.declared ? state.catalyst.id : undefined,
  )
  if (!restored.ok) return { ok: false, error: `项目来源核对失败：${restored.error}` }
  if (
    restored.value.corrupted !== state.corrupted ||
    JSON.stringify(restored.value.corruption) !== JSON.stringify(state.corruption) ||
    JSON.stringify(restored.value.secondCorruption) !== JSON.stringify(state.secondCorruption) ||
    restored.value.twiceCorrupted !== state.twiceCorrupted ||
    restored.value.rarity !== state.rarity ||
    restored.value.itemLevel !== state.itemLevel ||
    !equivalentProjectJSON(restored.value.affixes, state.affixes)
  )
    return { ok: false, error: '项目初始状态与来源装备不一致。' }
  if (
    state.implicitLines !== undefined &&
    JSON.stringify(state.implicitLines) !== JSON.stringify(restored.value.implicitLines ?? [])
  )
    return { ok: false, error: '项目初始固有属性与来源装备不一致。' }
  if (JSON.stringify(state.sockets) !== JSON.stringify(restored.value.sockets))
    return { ok: false, error: '项目初始孔位与来源装备不一致。' }
  if (JSON.stringify(state.runeSourceLines) !== JSON.stringify(restored.value.runeSourceLines))
    return { ok: false, error: '项目初始符文效果与来源装备不一致。' }
  if (!legacy && state.quality !== restored.value.quality)
    return { ok: false, error: '项目初始品质与来源装备或导入声明不一致。' }
  if (
    state.catalyst?.id !== restored.value.catalyst?.id ||
    state.catalyst?.quality !== restored.value.catalyst?.quality ||
    state.catalyst?.declared !== restored.value.catalyst?.declared
  )
    return { ok: false, error: '项目催化品质与来源原文或类型声明不一致。' }
  // 旧版项目没有保存固有行时，以重新核对的原文恢复，不能用目录范围覆盖实值。
  return state.declaredSkillSockets !== undefined || state.declaredSkillLevel !== undefined
    ? createCraftState(catalog, {
        ...restored.value,
        ...(state.declaredSkillSockets !== undefined
          ? { declaredSkillSockets: state.declaredSkillSockets }
          : {}),
        ...(state.declaredSkillLevel !== undefined
          ? { declaredSkillLevel: state.declaredSkillLevel }
          : {}),
      })
    : restored
}

/** 保存格式只包含起点和操作；恢复时回放所有步骤，不能信任外来派生快照。 */
/** 实例操作尚未接入项目版本；先检查原始树，避免 undefined 被 JSON 静默删除。 */
function hasAffixIdentityFields(input: unknown): boolean {
  const pending = [input]
  const visited = new Set<object>()
  while (pending.length) {
    const value = pending.pop()
    if (value === null || typeof value !== 'object' || visited.has(value)) continue
    visited.add(value)
    if (['affixId', 'nextAffixId', 'removeAffixId'].some((key) => Object.hasOwn(value, key)))
      return true
    for (const child of Object.values(value)) pending.push(child)
  }
  return false
}

export function parseCraftProject(
  text: string,
  catalog: CraftCatalog,
  dictionary: ItemDictionary = {},
): CraftResult<RestoredCraftProject> {
  return readCraftProject(text, catalog, dictionary, false)
}

/** 仅供新目标项目的 v72 内部投影；历史及来源门禁保持原样。 */
export function readStoredTargetProjectProjection(
  text: string,
  catalog: CraftCatalog,
  dictionary: ItemDictionary,
): CraftResult<RestoredCraftProject> {
  return readCraftProject(text, catalog, dictionary, true)
}

/** 包内 v75 来源投影入口：目标已按原生上下文校验；直接回放完整实例，绝不降级重建身份。 */
export function readNativeTargetProjectProjection(
  text: string,
  catalog: CraftCatalog,
  dictionary: ItemDictionary,
  perfectFlux = false,
  extraction = false,
  corruptionStrategy = false,
  retainedCatalyst = false,
  combatArmourRunes = false,
  runeforgedArmour = false,
  runeforge = false,
  wardRunes = false,
  extendedArmourRunes = false,
  masterwork = false,
  conditionalRunes = false,
  craftedCapacity = false,
  serle = false,
  essenceOutcomes = false,
  pendingExaltation = false,
  putrefaction = false,
  desecrationCount = false,
  influenceRunes = false,
  destructionRunes = false,
  influenceBones = false,
  extendedInfluenceBones = false,
  grantedSkillTargets = false,
  weightedProperties = false,
  skillSockets = false,
  skillSocketTargets = false,
  skillLevelDeclarations = false,
  skillVariantAmulets = false,
  amuletSkillSockets = false,
  amuletSkillLevel = false,
  amuletCatalyst = false,
): CraftResult<RestoredCraftProject> {
  return readCraftProject(
    text,
    catalog,
    dictionary,
    true,
    true,
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
    amuletSkillSockets,
    amuletSkillLevel,
    amuletCatalyst,
  )
}

function readCraftProject(
  text: string,
  catalog: CraftCatalog,
  dictionary: ItemDictionary,
  storedTargets: boolean,
  native = false,
  perfectFlux = false,
  extraction = false,
  corruptionStrategy = false,
  retainedCatalyst = false,
  combatArmourRunes = false,
  runeforgedArmour = false,
  runeforge = false,
  wardRunes = false,
  extendedArmourRunes = false,
  masterwork = false,
  conditionalRunes = false,
  craftedCapacity = false,
  serle = false,
  essenceOutcomes = false,
  pendingExaltation = false,
  putrefaction = false,
  desecrationCount = false,
  influenceRunes = false,
  destructionRunes = false,
  influenceBones = false,
  extendedInfluenceBones = false,
  grantedSkillTargets = false,
  weightedProperties = false,
  skillSockets = false,
  skillSocketTargets = false,
  skillLevelDeclarations = false,
  skillVariantAmulets = false,
  amuletSkillSockets = false,
  amuletSkillLevel = false,
  amuletCatalyst = false,
): CraftResult<RestoredCraftProject> {
  // 旧语义入口始终使用旧资格；载入新关系表不能改变既有项目的来源要求。
  if (!native && catalog.fluxes) {
    const { fluxes: _fluxes, ...legacyCatalog } = catalog
    catalog = legacyCatalog
  }
  const fail = (error: string): CraftResult<RestoredCraftProject> => ({ ok: false, error })
  if (
    text.length > MAX_CRAFT_PROJECT_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_CRAFT_PROJECT_BYTES
  )
    return fail('演练项目超过 2 MB 限制。')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return fail('演练项目不是有效 JSON。')
  }
  if (!amuletCatalyst && requiresAmuletCatalystProjectVersion(value))
    return fail('技能项链催化品质必须使用 v105 项目，包括起点、完整未来和嵌套未执行状态。')
  if (!amuletSkillLevel && requiresAmuletSkillLevelProjectVersion(value))
    return fail('技能项链等级制作必须使用 v104 项目，包括起点、完整未来、目标和未执行指引。')
  if (!amuletSkillSockets && requiresAmuletSkillSocketsProjectVersion(value))
    return fail('技能项链辅助孔必须使用 v103 项目，包括起点、完整未来、目标和未执行指引。')
  if (!skillVariantAmulets && requiresSkillVariantAmuletProjectVersion(value))
    return fail('技能变体项链必须使用 v102 项目，包括起点、完整未来和嵌套未执行结构。')
  if (!skillLevelDeclarations && requiresSkillLevelDeclarationProjectVersion(value))
    return fail('装备最高技能等级起点声明必须使用 v101 项目，包括完整未来和未执行指引。')
  if (!skillSocketTargets && requiresSkillSocketTargetProjectVersion(value))
    return fail('装备技能辅助孔起点声明与目标必须使用 v100 项目。')
  if (!skillSockets && requiresSkillSocketsProjectVersion(value))
    return fail('装备技能辅助孔必须使用 v99 项目，包括起点、完整未来、嵌套未执行指引及报价。')
  if (!weightedProperties && requiresWeightedPropertyProjectVersion(value))
    return fail('面板加权合计条件必须使用 v98 项目，包括完整未来和嵌套未执行指引。')
  if (!grantedSkillTargets && requiresGrantedSkillTargetProjectVersion(value))
    return fail('装备固有技能目标必须使用 v97 项目，包括起点、目标、完整未来和未执行指引。')
  if (!extendedInfluenceBones && requiresExtendedInfluenceBoneProjectVersion(value))
    return fail('扩展符文骨骼必须使用 v96 项目，包括起点、完整未来和未执行指引。')
  if (!influenceBones && requiresInfluenceBoneProjectVersion(value))
    return fail('符文骨骼必须使用 v95 项目，包括起点、完整未来和未执行指引。')
  if (!destructionRunes && requiresDestructionRuneProjectVersion(value))
    return fail('毁灭符文必须使用 v94 项目，包括起点、目标、声明、完整未来、指引及报价。')
  if (!influenceRunes && requiresInfluenceRuneProjectVersion(value))
    return fail('扩展词缀池符文必须使用 v93 项目，包括起点、目标、声明、完整未来、指引及报价。')
  if (!desecrationCount && requiresDesecrationCountProjectVersion(value))
    return fail('亵渎数量条件必须使用 v92 项目，包括未执行和嵌套指引。')
  if (!putrefaction && requiresPutrefactionProjectVersion(value))
    return fail('腐烂预兆必须使用 v91 项目，包括起点及撤销位置之后的步骤。')
  if (!essenceOutcomes && requiresEssenceOutcomesProjectVersion(value))
    return fail('多结果精华必须使用 v89 项目，包括起点、目标、完整未来及未执行指引。')
  if (!pendingExaltation && requiresPendingExaltationProjectVersion(value))
    return fail('未揭示期间的崇高操作必须使用 v90 项目，包括撤销位置之后的步骤。')
  if (!serle && requiresSerleProjectVersion(value, catalog))
    return fail('Serle 后缀容量必须使用 v88 项目，包括起点、声明、完整未来、指引及报价。')
  if (!craftedCapacity && requiresCraftedCapacityProjectVersion(value, catalog))
    return fail('多工艺容量必须使用 v87 项目，包括起点、声明、完整未来、指引及报价。')
  if (!conditionalRunes && requiresConditionalArmourRuneProjectVersion(value, catalog))
    return fail('条件限量符文必须使用 v86 项目，包括起点、声明、完整未来、指引及报价。')
  if (!masterwork && requiresMasterworkProjectVersion(value))
    return fail('符文升级必须使用 v85 项目，包括完整未来、指引及报价。')
  if (!extendedArmourRunes && requiresExtendedArmourRuneProjectVersion(value, catalog))
    return fail('重生与结界提高符文必须使用 v84 项目，包括完整未来历史、指引及报价。')
  if (!wardRunes && requiresWardRuneProjectVersion(value, catalog))
    return fail('结界与再生符文必须使用 v83 项目，包括起点、导入声明、未来历史、指引及报价。')
  if (!runeforge && requiresRuneforgeProjectVersion(value))
    return fail('锻造操作、指引及 Verisium 报价必须使用 v82 项目，包括完整未来历史。')
  if (!runeforgedArmour && requiresRuneforgedArmourProjectVersion(value, catalog))
    return fail('符文锻造基底与结界条件必须使用 v81 项目，包括完整历史及未执行指引。')
  if (!combatArmourRunes && requiresCombatArmourRuneProjectVersion(value, catalog))
    return fail('防具荆棘与减益符文必须使用 v80 项目，包括起点、导入声明、未来操作和指引。')
  if (!retainedCatalyst && requiresRetainedCatalystProjectVersion(value, catalog))
    return fail('已有扩展催化品质及裂隙精华共存必须使用 v79 项目，包括未来历史。')
  if (!corruptionStrategy && requiresCorruptionStrategyProjectVersion(value))
    return fail('腐化材料指引及腐化状态条件必须使用 v78 项目，包括未执行阶段。')
  if (!extraction && requiresExtractionProjectVersion(value))
    return fail('萃取石及相关指引或报价必须使用 v77 项目，包括未来历史。')
  if (!perfectFlux && requiresPerfectFluxProjectVersion(value))
    return fail('完美溶剂、装备技能结果及相关指引或报价必须使用 v76 项目，包括未来历史。')
  if (
    record(value) &&
    record(value.initialState) &&
    Object.hasOwn(value.initialState, 'grantedSkillLevel')
  )
    return fail('项目起点不能预装装备技能升级结果；必须回放完美溶剂操作。')
  if (
    record(value) &&
    record(value.initialState) &&
    Object.hasOwn(value.initialState, 'grantedSkillSockets')
  )
    return fail('项目起点不能预装装备技能辅助孔结果；必须回放工匠石操作。')
  if (!native && hasAffixIdentityFields(value))
    return fail('v2–v72 项目尚不支持词缀实例字段，不能恢复此状态或历史。')
  if (
    !record(value) ||
    !exactKeys(value, [
      'schemaVersion',
      'sourceCommit',
      'rulesVersion',
      'initialState',
      'operations',
      'cursor',
      'targetModIds',
      'minimumTargetCount',
      'strategy',
      'strategyStartStep',
      'targetFracturedModId',
      'targetValues',
      'targetImplicitValues',
      'targetAlternatives',
      'augmentSourceHash',
      'corruptionSourceHash',
      'essenceSourceHash',
      'liquidEmotionSourceHash',
      'alloyCatalogSignature',
      'desecrationSourceHash',
      'jewelSourceHash',
      'scalabilitySourceHash',
      'pricing',
      'importedSockets',
      'importedQuality',
    ])
  )
    return fail('演练项目结构无效。')
  if (value.schemaVersion !== 1) return fail('不支持该演练项目格式版本。')
  if (storedTargets && value.rulesVersion !== 'basic-2026-09-12-v72')
    return fail('存储目标投影必须使用固定的 v72 语义基线。')
  if (value.sourceCommit !== catalog._meta.sourceCommit)
    return fail('项目与当前制作目录快照不同，不能混用。')
  const rulesVersion = readRulesVersion(value.rulesVersion)
  if (rulesVersion === null) return fail('项目与当前通货规则版本不同，暂不能恢复。')
  if (!native && JSON.stringify(value).includes('"kind":"flux"'))
    return fail('v2–v74 项目不能包含溶剂步骤或指引，包括撤销位置之后的步骤。 ')
  if (
    !native &&
    record(value.pricing) &&
    record(value.pricing.prices) &&
    Object.keys(value.pricing.prices).some((key) => key.startsWith('flux:'))
  )
    return fail('v2–v74 项目不能包含溶剂报价。 ')
  const alloyUsage = alloyProjectUsage(value)
  const needsAlloyCatalog = alloyUsage.used || Object.hasOwn(value, 'alloyCatalogSignature')
  const alloyCatalogSignature = readAlloyCatalogSignature(catalog)
  if (rulesVersion < 66 && needsAlloyCatalog)
    return fail('v2–v65 旧版项目不能包含合金操作、起点、目标、指引或来源，包括撤销位置之后的步骤。')
  if (
    needsAlloyCatalog &&
    (alloyCatalogSignature === null || value.alloyCatalogSignature !== alloyCatalogSignature)
  )
    return fail('项目合金关系签名缺失或与当前目录不同，请先加载相同合金关系目录。')
  let usesSovereignEffects = alloyUsage.resistanceEffect
  const isNewCatalysingCombination = (omen: unknown) =>
    isCraftOmen(omen) && omen !== 'catalysing_exaltation' && CRAFT_OMEN_RULES[omen].consumesCatalyst
  if (
    rulesVersion < 65 &&
    Array.isArray(value.operations) &&
    value.operations.some((step) => record(step) && isNewCatalysingCombination(step.omen))
  )
    return fail('v2–v64 旧版项目不能包含催化崇高组合，包括撤销位置之后的步骤。')

  if (
    rulesVersion < 64 &&
    Array.isArray(value.operations) &&
    value.operations.some(
      (step) =>
        record(step) &&
        (step.omen === 'whittling_sinistral_erasure' || step.omen === 'whittling_dextral_erasure'),
    )
  )
    return fail('v2–v63 旧版项目不能包含消减与定向消抹组合，包括撤销位置之后的步骤。')
  if (
    rulesVersion < 63 &&
    ((record(value.initialState) &&
      (Object.hasOwn(value.initialState, 'secondCorruption') ||
        Object.hasOwn(value.initialState, 'twiceCorrupted'))) ||
      (Array.isArray(value.operations) &&
        value.operations.some(
          (step) => record(step) && step.kind === 'architect' && step.outcome === 'enchant',
        )))
  )
    return fail('v2–v62 旧版项目不能包含建筑师强化或二重腐化状态。')
  if (
    rulesVersion < 62 &&
    Array.isArray(value.operations) &&
    value.operations.some((step) => record(step) && step.kind === 'architect')
  )
    return fail('v2–v61 旧版项目不能包含建筑师摧毁步骤。')
  if (
    rulesVersion < 61 &&
    Array.isArray(value.operations) &&
    value.operations.some(
      (step) => record(step) && step.kind === 'vaal' && step.outcome === 'reroll',
    )
  )
    return fail('v2–v60 旧版项目不能包含腐化顺序重选步骤。')
  const usesCorruption =
    (record(value.initialState) &&
      (Object.hasOwn(value.initialState, 'corruption') ||
        Object.hasOwn(value.initialState, 'secondCorruption') ||
        Object.hasOwn(value.initialState, 'twiceCorrupted'))) ||
    (Array.isArray(value.operations) &&
      value.operations.some(
        (step) =>
          record(step) &&
          (step.kind === 'vaal' || step.kind === 'architect') &&
          step.outcome === 'enchant',
      )) ||
    Object.hasOwn(value, 'corruptionSourceHash')
  if (usesCorruption && rulesVersion < 60)
    return fail('v2–v59 旧版项目不能包含独立腐化强化或其来源指纹。')
  const corruptionSourceHash = readCorruptionSourceHash(catalog)
  if (
    usesCorruption &&
    (corruptionSourceHash === null || value.corruptionSourceHash !== corruptionSourceHash)
  )
    return fail('腐化属性来源指纹与当前目录不一致。')
  if (
    rulesVersion < 59 &&
    ((record(value.initialState) && Object.hasOwn(value.initialState, 'corrupted')) ||
      (Array.isArray(value.operations) &&
        value.operations.some((step) => record(step) && step.kind === 'vaal')))
  )
    return fail('v2–v58 旧版项目不能包含腐化状态或瓦尔结果步骤。')

  let strategy: CraftStrategy | undefined
  if (Object.hasOwn(value, 'strategy')) {
    if (rulesVersion < 39) return fail('v2–v38 旧版项目不能包含条件制作指引。')
    const read = readCraftStrategy(value.strategy)
    if (!read.ok) return fail(read.error)
    if (
      rulesVersion < 65 &&
      read.value.rules.some(
        (rule) => rule.action.kind === 'currency' && isNewCatalysingCombination(rule.action.omen),
      )
    )
      return fail('v2–v64 旧版项目不能包含催化崇高组合指引。')

    if (
      rulesVersion < 64 &&
      read.value.rules.some(
        (rule) =>
          rule.action.kind === 'currency' &&
          (rule.action.omen === 'whittling_sinistral_erasure' ||
            rule.action.omen === 'whittling_dextral_erasure'),
      )
    )
      return fail('v2–v63 旧版项目不能包含消减与定向消抹组合指引。')
    if (
      rulesVersion < 55 &&
      read.value.rules.some((rule) =>
        craftStrategyLeaves(rule.conditions).some((condition) => condition.kind === 'quality'),
      )
    )
      return fail('v54 及更早项目不能包含品质条件，包括未执行规则和嵌套条件。')
    if (
      rulesVersion < 54 &&
      read.value.rules.some(
        (rule) => rule.action.kind === 'currency' && rule.action.omen === 'catalysing_exaltation',
      )
    )
      return fail('v2–v53 旧版项目不能包含催化崇高预兆指引。')
    if (
      rulesVersion < 49 &&
      read.value.rules.some((rule) =>
        craftStrategyLeaves(rule.conditions).some(
          (condition) =>
            condition.kind === 'item-property' &&
            Object.hasOwn(RESISTANCE_LABELS, condition.property),
        ),
      )
    )
      return fail('v48 及更早项目不能包含抗性合计条件。')
    if (
      rulesVersion < 48 &&
      read.value.rules.some((rule) =>
        craftStrategyLeaves(rule.conditions).some(
          (condition) => condition.kind === 'item-property',
        ),
      )
    )
      return fail('v47 及更早项目不能包含装备面板条件。')
    if (
      rulesVersion < 47 &&
      read.value.rules.some(
        (rule) => rule.action.kind === 'currency' && rule.action.omen === 'blessed',
      )
    )
      return fail('v46 及更早项目不能包含祝福预兆指引。')
    if (
      rulesVersion < 46 &&
      read.value.rules.some((rule) =>
        rule.conditions.some((condition) => ['all', 'any', 'not'].includes(condition.kind)),
      )
    )
      return fail('v45 及更早项目不能包含嵌套条件。')
    if (rulesVersion < 45 && read.value.rules.some((rule) => rule.onBlockedStageId !== undefined))
      return fail('v44 及更早项目不能包含无法执行时的阶段转向。')
    if (rulesVersion < 44 && read.value.rules.some((rule) => rule.action.kind === 'jump'))
      return fail('v43 及更早项目不能包含纯条件跳转。')
    if (rulesVersion < 43 && read.value.flow) return fail('v42 及更早项目不能包含分阶段流程。')
    const selectedTargets = read.value.rules.flatMap((rule) =>
      craftStrategyLeaves(rule.conditions).flatMap((condition) =>
        condition.kind === 'selected-targets' ? condition.modIds : [],
      ),
    )
    if (rulesVersion < 42 && selectedTargets.length)
      return fail('v39–v41 旧版指引不能包含指定目标组条件。')
    if (selectedTargets.some((id) => !catalog.modifiers.some((mod) => mod.id === id)))
      return fail('规则引用的目标词缀不在当前制作目录中。')
    if (
      rulesVersion < 41 &&
      read.value.rules.some(
        (rule) =>
          ['artificer', 'socket'].includes(rule.action.kind) ||
          craftStrategyLeaves(rule.conditions).some((condition) =>
            ['socket-count', 'open-sockets'].includes(condition.kind),
          ),
      )
    )
      return fail('v39–v40 旧版指引不能包含孔位动作或条件。')
    if (
      read.value.rules.some(
        (rule) =>
          rule.action.kind === 'socket' &&
          !catalog.augments?.some(
            (augment) => rule.action.kind === 'socket' && augment.id === rule.action.augmentId,
          ),
      )
    )
      return fail('指引符文不在当前镶嵌目录中。')
    if (
      rulesVersion < 40 &&
      read.value.rules.some(
        (rule) =>
          !['stop', 'currency'].includes(rule.action.kind) ||
          craftStrategyLeaves(rule.conditions).some((condition) =>
            ['affix-count', 'desecration-stage'].includes(condition.kind),
          ),
      )
    )
      return fail('v39 旧版指引不能包含特殊动作或阶段条件。')
    if (
      read.value.rules.some(
        (rule) =>
          rule.action.kind === 'essence' &&
          !catalog.essences?.some(
            (essence) => rule.action.kind === 'essence' && essence.id === rule.action.essenceId,
          ),
      )
    )
      return fail('指引精华不在当前制作目录中。')
    if (
      read.value.rules.some(
        (rule) =>
          rule.action.kind === 'liquid-emotion' &&
          !catalog.liquidEmotions?.some(
            (emotion) =>
              rule.action.kind === 'liquid-emotion' && emotion.id === rule.action.emotionId,
          ),
      )
    )
      return fail('指引液态情感不在当前制作目录中。')
    if (
      read.value.rules.some(
        (rule) =>
          rule.action.kind === 'alloy' &&
          !catalog.alloys?.alloys.some(
            (alloy) => rule.action.kind === 'alloy' && alloy.id === rule.action.alloyId,
          ),
      )
    )
      return fail('指引合金不在当前制作目录中。')
    strategy = read.value
  }
  let minimumTargetCount: number | undefined
  if (Object.hasOwn(value, 'minimumTargetCount')) {
    if (rulesVersion < 38) return fail('v2–v37 旧版项目不能包含部分目标数量条件。')
    if (
      typeof value.minimumTargetCount !== 'number' ||
      !Number.isInteger(value.minimumTargetCount) ||
      value.minimumTargetCount < 1 ||
      !Array.isArray(value.targetModIds) ||
      value.minimumTargetCount > value.targetModIds.length
    )
      return fail('部分目标数量必须是 1 至已选显式目标组数的整数。')
    minimumTargetCount = value.minimumTargetCount
  }

  if (
    rulesVersion < 54 &&
    Array.isArray(value.operations) &&
    value.operations.some((step) => record(step) && step.omen === 'catalysing_exaltation')
  )
    return fail('v2–v53 旧版项目不能包含催化崇高预兆，包括撤销位置之后的步骤。')
  if (
    rulesVersion < 47 &&
    Array.isArray(value.operations) &&
    value.operations.some((step) => record(step) && step.omen === 'blessed')
  )
    return fail('v46 及更早项目不能包含祝福预兆，包括撤销位置之后的步骤。')
  const numericGroups = [value.targetValues, value.targetImplicitValues]
  const usesEffectiveTargets = numericGroups.some(
    (groups) =>
      Array.isArray(groups) && groups.some((group) => record(group) && group.basis === 'effective'),
  )
  if (
    rulesVersion < 37 &&
    numericGroups.some(
      (groups) =>
        Array.isArray(groups) &&
        groups.some((group) => record(group) && Object.hasOwn(group, 'basis')),
    )
  )
    return fail('v2–v36 旧版项目不能包含有效值目标口径。')

  if (
    rulesVersion < 36 &&
    (Object.hasOwn(value, 'scalabilitySourceHash') ||
      (record(value.initialState) && Object.hasOwn(value.initialState, 'catalyst')))
  )
    return fail('v2–v35 旧版项目不能包含催化品质起点或缩放来源。')
  if (
    rulesVersion < 33 &&
    Array.isArray(value.operations) &&
    value.operations.some(
      (step) =>
        record(step) && isCraftOmen(step.omen) && CRAFT_OMEN_RULES[step.omen].addCount === 2,
    )
  )
    return fail('v2–v32 旧版项目不能包含强效崇高配置，包括撤销位置之后的步骤。')
  if (rulesVersion < 34 && Object.hasOwn(value, 'pricing'))
    return fail('v2–v33 旧版项目不能包含新版报价字段。')
  const pricing = Object.hasOwn(value, 'pricing') ? parseCraftPricing(value.pricing, catalog) : null
  if (pricing && !pricing.ok) return fail(pricing.error)
  const initialBaseId = record(value.initialState) ? value.initialState.baseId : null
  const usesJewel = catalog.bases.some((base) => base.id === initialBaseId && base.type === 'Jewel')
  if (
    rulesVersion < 71 &&
    usesJewel &&
    (Object.hasOwn(value, 'desecrationSourceHash') ||
      (record(value.initialState) &&
        (Object.hasOwn(value.initialState, 'pendingDesecration') ||
          (Array.isArray(value.initialState.affixes) &&
            value.initialState.affixes.some(
              (affix) => record(affix) && Object.hasOwn(affix, 'desecrated'),
            )))) ||
      (Array.isArray(value.operations) &&
        value.operations.some((step) => record(step) && isBoneOperationKind(step.kind))))
  )
    return fail('v2–v70 旧版项目不能包含珠宝亵渎状态或步骤。')
  if (
    rulesVersion < 70 &&
    usesJewel &&
    ((record(value.initialState) && Object.hasOwn(value.initialState, 'corrupted')) ||
      (Array.isArray(value.operations) &&
        value.operations.some(
          (step) => record(step) && (step.kind === 'vaal' || step.kind === 'architect'),
        )))
  )
    return fail('v2–v69 旧版项目不能包含腐化珠宝或其制作步骤，包括撤销位置之后的步骤。')
  if (
    rulesVersion < 67 &&
    catalog.bases.some((base) => base.id === initialBaseId && isRadiusJewel(base))
  )
    return fail('v2–v66 旧版项目不能包含失落珠宝制作起点。')
  const effectAction = (step: unknown) =>
    record(step) && step.kind === 'liquid-emotion' && step.emotionId === JEWEL_EFFECT_EMOTION_ID
  const targetIds = [
    ...(Array.isArray(value.targetModIds) ? value.targetModIds.filter(nonempty) : []),
    ...(Array.isArray(value.targetValues)
      ? value.targetValues.flatMap((entry) =>
          record(entry) && nonempty(entry.modId) ? [entry.modId] : [],
        )
      : []),
    ...(Array.isArray(value.targetAlternatives)
      ? value.targetAlternatives.flatMap((entry) =>
          record(entry)
            ? [
                ...(nonempty(entry.targetModId) ? [entry.targetModId] : []),
                ...(Array.isArray(entry.modIds) ? entry.modIds.filter(nonempty) : []),
              ]
            : [],
        )
      : []),
    ...(strategy?.rules.flatMap((rule) =>
      craftStrategyLeaves(rule.conditions).flatMap((condition) =>
        condition.kind === 'selected-targets' ? condition.modIds : [],
      ),
    ) ?? []),
  ]
  if (
    usesJewel &&
    rulesVersion < 71 &&
    targetIds.some((id) => catalog.modifiers.some((mod) => mod.id === id && mod.desecratedOnly))
  )
    return fail('v2–v70 旧版项目不能包含珠宝亵渎专属目标或条件。')
  const targetUsesJewelEffect = usesJewelEffect(catalog, {
    affixes: targetIds.map((modId) => ({ modId, lines: [] })),
  })
  let usesJewelEffects =
    targetUsesJewelEffect ||
    strategy?.rules.some((rule) => effectAction(rule.action)) === true ||
    (Array.isArray(value.operations) && value.operations.some(effectAction))
  if (rulesVersion < 53 && usesJewelEffects)
    return fail('v2–v52 旧版项目不能包含珠宝增效目标、指引或步骤，包括撤销位置之后的步骤。')
  const fluxBase = native ? catalog.bases.find((base) => base.id === initialBaseId) : undefined
  const fluxTargets = fluxBase ? fluxEligibleModIds(catalog, fluxBase).ordinary : null
  const craftedJewelIds = new Set(
    catalog.modifiers
      .filter((mod) => mod.jewelOnly && mod.craftedOnly && !fluxTargets?.has(mod.id))
      .map((mod) => mod.id),
  )
  const storedTargetSources = storedTargets
    ? targetProjectSourceUsage(catalog, initialBaseId, targetIds)
    : { essence: false, desecration: false, liquid: false, jewel: false }
  const targetUsesCraftedJewel =
    storedTargetSources.liquid ||
    (Array.isArray(value.targetModIds) &&
      value.targetModIds.some((id) => craftedJewelIds.has(String(id)))) ||
    (Array.isArray(value.targetAlternatives) &&
      value.targetAlternatives.some(
        (entry) =>
          record(entry) &&
          Array.isArray(entry.modIds) &&
          entry.modIds.some((id) => craftedJewelIds.has(String(id))),
      ))
  if (rulesVersion < 51 && targetUsesCraftedJewel)
    return fail('v2–v50 旧版项目不能包含新增珠宝工艺专属目标。')
  const usesLiquidEmotions =
    usesJewelEffects ||
    targetUsesCraftedJewel ||
    strategy?.rules.some((rule) => rule.action.kind === 'liquid-emotion') ||
    (Array.isArray(value.operations) &&
      value.operations.some((step) => record(step) && step.kind === 'liquid-emotion')) ||
    (usesJewel &&
      record(value.initialState) &&
      Array.isArray(value.initialState.affixes) &&
      value.initialState.affixes.some((affix) => record(affix) && Object.hasOwn(affix, 'crafted')))
  if (rulesVersion < 68) {
    const ancientAction = (step: unknown) =>
      record(step) &&
      step.kind === 'liquid-emotion' &&
      typeof step.emotionId === 'string' &&
      supportedRadiusLiquidEmotionId(step.emotionId)
    if (
      (usesLiquidEmotions &&
        catalog.bases.some((base) => base.id === initialBaseId && isRadiusJewel(base))) ||
      strategy?.rules.some((rule) => ancientAction(rule.action)) ||
      (Array.isArray(value.operations) && value.operations.some(ancientAction))
    )
      return fail('v2–v67 旧版项目不能包含远古液态情感、范围工艺起点或工艺目标。')
  }
  if (rulesVersion < 50 && (usesLiquidEmotions || Object.hasOwn(value, 'liquidEmotionSourceHash')))
    return fail('v2–v49 旧版项目不能包含液态情感步骤、指引、来源或珠宝工艺起点。')
  if (rulesVersion < 51) {
    const extendedAction = (step: unknown) =>
      record(step) &&
      step.kind === 'liquid-emotion' &&
      (initialBaseId === 'Diamond' ||
        typeof step.emotionId !== 'string' ||
        !supportedBasicLiquidEmotionId(step.emotionId))
    if (
      strategy?.rules.some((rule) => extendedAction(rule.action)) ||
      (Array.isArray(value.operations) && value.operations.some(extendedAction))
    )
      return fail('v2–v50 旧版项目不能包含新增工艺液态材料或钻石液态步骤。')
  }
  if (rulesVersion < 52) {
    const capacityAction = (step: unknown) =>
      record(step) &&
      (Object.hasOwn(step, 'resultKind') ||
        (step.kind === 'liquid-emotion' && step.emotionId === JEWEL_CAPACITY_EMOTION_ID))
    if (
      strategy?.rules.some((rule) => capacityAction(rule.action)) ||
      (Array.isArray(value.operations) && value.operations.some(capacityAction))
    )
      return fail('v2–v51 旧版项目不能包含珠宝增容材料或结果侧别，包括撤销位置之后的步骤。')
  }
  const liquidEmotionSourceHash = readLiquidEmotionSourceHash(catalog)
  const scalabilitySourceHash = statScalabilitySourceHash(catalog)
  const validateEffectState = (state: CraftState): string | null => {
    if (requiresRetainedCatalystProjectVersion(state, catalog)) {
      if (!retainedCatalyst)
        return '已有扩展催化品质及裂隙精华共存必须使用 v79 项目，包括未来历史。'
      const sourceHash = readEssenceSourceHash(catalog)
      if (sourceHash === null || value.essenceSourceHash !== sourceHash)
        return '项目精华来源指纹缺失或与当前目录不同，不能恢复已有扩展催化品质。'
    }
    if (
      rulesVersion < 69 &&
      state.catalyst !== undefined &&
      catalog.bases.some((base) => base.id === state.baseId && isRadiusJewel(base))
    )
      return 'v2–v68 旧版项目不能包含失落珠宝催化品质。'
    if (usesSovereignResistance(state)) {
      usesSovereignEffects = true
      if (
        rulesVersion < 66 ||
        alloyCatalogSignature === null ||
        value.alloyCatalogSignature !== alloyCatalogSignature
      )
        return '项目君王合金增效的规则版本或关系签名无效。'
      if (scalabilitySourceHash === null || value.scalabilitySourceHash !== scalabilitySourceHash)
        return '项目君王合金增效的属性缩放来源指纹缺失或与当前目录不同。'
    }
    if (!usesJewelEffect(catalog, state)) return null
    usesJewelEffects = true
    if (rulesVersion < 53) return 'v2–v52 旧版项目不能包含珠宝增效状态。'
    if (
      liquidEmotionSourceHash === null ||
      value.liquidEmotionSourceHash !== liquidEmotionSourceHash
    )
      return '项目珠宝增效状态的液态情感来源指纹缺失或与当前目录不同。'
    if (scalabilitySourceHash === null || value.scalabilitySourceHash !== scalabilitySourceHash)
      return '项目珠宝增效状态的属性缩放来源指纹缺失或与当前目录不同。'
    return null
  }
  // 输入、来源原文恢复结果和每个历史位置都核对，不能只依赖 crafted 标记或当前游标。
  const validateCapacityState = (state: CraftState): string | null => {
    if (
      rulesVersion < 68 &&
      catalog.bases.some((base) => base.id === state.baseId && isRadiusJewel(base)) &&
      (usesJewelCapacity(catalog, state) || state.affixes.some((affix) => affix.crafted))
    )
      return 'v2–v67 旧版项目不能包含范围工艺或超固有容量状态。'
    if (!usesJewelCapacity(catalog, state)) return null
    if (rulesVersion < 52) return 'v2–v51 旧版项目不能包含珠宝增容或超固有容量状态。'
    if (
      liquidEmotionSourceHash === null ||
      value.liquidEmotionSourceHash !== liquidEmotionSourceHash
    )
      return '项目珠宝增容状态的液态情感来源指纹缺失或与当前目录不同。'
    return null
  }
  if (
    (usesLiquidEmotions || Object.hasOwn(value, 'liquidEmotionSourceHash')) &&
    (liquidEmotionSourceHash === null || value.liquidEmotionSourceHash !== liquidEmotionSourceHash)
  )
    return fail('项目液态情感来源指纹缺失或与当前目录不同，不能恢复。')
  if (rulesVersion < 32 && (usesJewel || Object.hasOwn(value, 'jewelSourceHash')))
    return fail('v2–v31 旧版项目不能包含珠宝制作起点或来源。')
  const jewelSourceHash = readJewelSourceHash(catalog)
  if (
    (usesJewel ||
      storedTargetSources.jewel ||
      usesJewelEffects ||
      Object.hasOwn(value, 'jewelSourceHash')) &&
    ((!usesJewel && !storedTargetSources.jewel) ||
      jewelSourceHash === null ||
      value.jewelSourceHash !== jewelSourceHash)
  )
    return fail('项目珠宝来源指纹缺失或与当前目录不同，不能恢复。')
  if (
    rulesVersion < 31 &&
    Array.isArray(value.operations) &&
    value.operations.some((step) => record(step) && step.omen === 'light')
  )
    return fail('v2–v30 旧版项目不能包含光明预兆操作，包括撤销位置之后的步骤。')
  if (
    rulesVersion < 30 &&
    Array.isArray(value.operations) &&
    value.operations.some((step) => record(step) && step.omen === 'whittling')
  )
    return fail('v2–v29 旧版项目不能包含消减预兆操作，包括撤销位置之后的步骤。')
  if (rulesVersion < 29 && Object.hasOwn(value, 'targetFracturedModId'))
    return fail('v2–v28 旧版项目不能包含破裂目标要求。')
  if (rulesVersion < 28) {
    const initial = record(value.initialState) ? value.initialState : null
    const source =
      initial && typeof initial.sourceText === 'string' ? parseItem(initial.sourceText) : null
    if (
      (initial &&
        Array.isArray(initial.affixes) &&
        initial.affixes.some((affix) => record(affix) && Object.hasOwn(affix, 'fractured'))) ||
      (source?.ok &&
        (source.item.fractured ||
          source.item.mods.some((mod) => mod.states?.includes('fractured')))) ||
      (Array.isArray(value.operations) &&
        value.operations.some((operation) => record(operation) && operation.kind === 'fracture'))
    )
      return fail('v2–v27 旧版项目不能包含破裂状态、来源或未来破裂操作。')
  }
  if (rulesVersion < 23 && Object.hasOwn(value, 'targetImplicitValues'))
    return fail('v2–v22旧版项目不能包含固有属性目标字段。')
  if (rulesVersion < 7 && Object.hasOwn(value, 'importedSockets'))
    return fail('旧版项目不能包含导入孔位核对声明。')
  if (
    rulesVersion < 8 &&
    record(value.initialState) &&
    Object.hasOwn(value.initialState, 'runeSourceLines')
  )
    return fail('旧版项目不能包含符文来源效果。')
  if (rulesVersion < 13 && Object.hasOwn(value, 'targetAlternatives'))
    return fail('旧版项目不能包含替代档位目标。')
  if (rulesVersion === 2 && Object.hasOwn(value, 'targetValues'))
    return fail('旧版项目不能包含新数值目标。')
  if (
    rulesVersion < 9 &&
    (Object.hasOwn(value, 'importedQuality') ||
      (record(value.initialState) && Object.hasOwn(value.initialState, 'quality')))
  )
    return fail('旧版项目不能包含品质状态或导入品质声明。')
  if (
    rulesVersion < 21 &&
    ((record(value.initialState) && Object.hasOwn(value.initialState, 'pendingDesecration')) ||
      (Array.isArray(value.operations) &&
        value.operations.some((step) => record(step) && isBoneOperationKind(step.kind))))
  )
    return fail('v2–v20 旧版项目不能包含待揭示亵渎或骨骼揭示操作。')
  if (
    rulesVersion < 25 &&
    Array.isArray(value.operations) &&
    value.operations.some(
      (step) =>
        record(step) &&
        step.kind === 'desecrate' &&
        (Object.hasOwn(step, 'directionOmen') || Object.hasOwn(step, 'lichOmen')),
    )
  )
    return fail('旧规则项目不能包含骨骼施加预兆字段。')
  if (
    rulesVersion < 26 &&
    ((record(value.initialState) &&
      record(value.initialState.pendingDesecration) &&
      (Object.hasOwn(value.initialState.pendingDesecration, 'revealOmen') ||
        Object.hasOwn(value.initialState.pendingDesecration, 'rerollOptions'))) ||
      (Array.isArray(value.operations) &&
        value.operations.some(
          (step) =>
            record(step) &&
            (step.kind === 'desecration-reroll' ||
              Object.hasOwn(step, 'revealOmen') ||
              Object.hasOwn(step, 'rerollOptions')),
        )))
  )
    return fail('v2–v25旧版项目不能包含深渊回响或第二组揭示字段。')
  if (rulesVersion < 20) {
    const initial = record(value.initialState) ? value.initialState : undefined
    const parsedSource =
      typeof initial?.sourceText === 'string' ? parseItem(initial.sourceText) : null
    const exclusiveIds = new Set(
      catalog.modifiers.filter((mod) => mod.desecratedOnly).map((mod) => mod.id),
    )
    if (
      Object.hasOwn(value, 'desecrationSourceHash') ||
      (Array.isArray(initial?.affixes) &&
        initial.affixes.some(
          (affix) =>
            record(affix) &&
            (Object.hasOwn(affix, 'desecrated') || exclusiveIds.has(String(affix.modId))),
        )) ||
      (parsedSource?.ok &&
        parsedSource.item.mods.some((mod) => mod.states?.includes('desecrated'))) ||
      (Array.isArray(value.operations) &&
        value.operations.some(
          (step) =>
            record(step) &&
            ((Array.isArray(step.modIds) &&
              step.modIds.some((id) => exclusiveIds.has(String(id)))) ||
              exclusiveIds.has(String(step.removeModId)) ||
              (Array.isArray(step.rolls) &&
                step.rolls.some((roll) => record(roll) && exclusiveIds.has(String(roll.modId))))),
        ))
    )
      return fail('v2–v19 旧版项目不能包含亵渎来源、状态或专属词缀。')
  }
  if (rulesVersion < 15) {
    const initial = record(value.initialState) ? value.initialState : undefined
    const parsedSource =
      typeof initial?.sourceText === 'string' ? parseItem(initial.sourceText) : null
    if (
      Object.hasOwn(value, 'essenceSourceHash') ||
      (Array.isArray(initial?.affixes) &&
        initial.affixes.some((affix) => record(affix) && Object.hasOwn(affix, 'crafted'))) ||
      (Array.isArray(value.operations) &&
        value.operations.some((step) => record(step) && step.kind === 'essence')) ||
      (parsedSource?.ok && parsedSource.item.mods.some((mod) => mod.states?.includes('crafted')))
    )
      return fail('v2–v14 旧版项目不能包含精华操作、来源指纹或工艺状态。')
  }
  if (
    rulesVersion < 16 &&
    Array.isArray(value.operations) &&
    value.operations.some(
      (step) =>
        record(step) &&
        step.kind === 'essence' &&
        (Object.hasOwn(step, 'removeModId') ||
          (typeof step.essenceId === 'string' && essenceCraftMode(step.essenceId) === 'replace')),
    )
  )
    return fail('v2–v15 旧版项目不能包含替换精华或精华移除字段。')
  if (
    rulesVersion < 17 &&
    Array.isArray(value.operations) &&
    value.operations.some(
      (step) => record(step) && step.kind === 'essence' && Object.hasOwn(step, 'omen'),
    )
  )
    return fail('v2–v16 旧版项目不能包含精华预兆字段。')
  const legacy = rulesVersion <= 4
  if (
    legacy &&
    (Object.hasOwn(value, 'augmentSourceHash') ||
      (record(value.initialState) && Object.hasOwn(value.initialState, 'sockets')))
  )
    return fail('旧版项目不能包含镶嵌状态或来源。')
  if (!Array.isArray(value.operations) || value.operations.length > MAX_OPERATIONS)
    return fail('演练操作列表无效或超过 1000 步。')
  if (
    !validStrategyStartStep(strategy, value.strategyStartStep, value.operations.length) ||
    (Object.hasOwn(value, 'strategyStartStep') && (rulesVersion < 43 || !strategy?.flow))
  )
    return fail('分阶段流程的起点无效，或与项目版本不符。')
  if (
    typeof value.cursor !== 'number' ||
    !Number.isInteger(value.cursor) ||
    value.cursor < 0 ||
    value.cursor > value.operations.length
  )
    return fail('演练历史游标无效。')
  const initialInput = readState(
    value.initialState,
    native,
    skillSocketTargets,
    skillLevelDeclarations,
  )
  if (!initialInput) return fail('演练起点结构无效。')
  const initialEffectError = validateEffectState(initialInput)
  if (initialEffectError) return fail(initialEffectError)
  const initialCapacityError = validateCapacityState(initialInput)
  if (initialCapacityError) return fail(initialCapacityError)
  if (rulesVersion < 18 && initialInput.sourceText !== null) {
    const source = parseItem(initialInput.sourceText)
    if (
      source.ok &&
      source.item.blocks.some(
        (block) =>
          block.kind === 'skill' &&
          block.lines.some(
            (line) => readUnlevelledSkillName(line.raw, source.item.locale) !== null,
          ),
      )
    )
      return fail('v2–v17 旧版项目不能包含无等级授予技能来源装备。')
  }
  if (rulesVersion < 12) {
    if (initialInput.sourceText !== null) {
      const parsedLegacySource = parseItem(initialInput.sourceText)
      if (
        parsedLegacySource.ok &&
        parsedLegacySource.item.blocks.some((block) => block.kind === 'skill')
      )
        return fail('v2–v11 旧版项目不能包含授予技能来源装备。')
    } else {
      const legacyBase = catalog.bases.find((base) => base.id === initialInput.baseId)
      const patterns = legacyBase?.implicit?.split('\n') ?? []
      if (
        initialInput.implicitLines !== undefined &&
        JSON.stringify(initialInput.implicitLines) !== JSON.stringify(patterns)
      )
        return fail('v2–v11 旧版项目不能包含具体授予技能等级声明。')
    }
  }
  const initialBase = catalog.bases.find((base) => base.id === initialInput.baseId)
  if (rulesVersion < 27 && initialBase) {
    const newlyAccepted = (id: string) => {
      const mod = catalog.modifiers.find((entry) => entry.id === id)
      return (
        mod !== undefined &&
        hasGenesisModEligibility(initialBase, mod) &&
        !hasCraftModEligibility(initialBase, mod)
      )
    }
    if (
      initialInput.affixes.some(
        (affix) =>
          newlyAccepted(affix.modId) &&
          !(affix.crafted && isEssenceMappedMod(catalog, initialBase, affix.modId)),
      )
    )
      return fail('v2–v26 旧版项目不能包含已有 Genesis 词缀身份。')
    const targetIds = [
      ...(Array.isArray(value.targetModIds) ? value.targetModIds.filter(nonempty) : []),
      ...(Array.isArray(value.targetValues)
        ? value.targetValues.flatMap((entry) =>
            record(entry) && nonempty(entry.modId) ? [entry.modId] : [],
          )
        : []),
      ...(Array.isArray(value.targetAlternatives)
        ? value.targetAlternatives.flatMap((entry) =>
            record(entry)
              ? [
                  ...(nonempty(entry.targetModId) ? [entry.targetModId] : []),
                  ...(Array.isArray(entry.modIds) ? entry.modIds.filter(nonempty) : []),
                ]
              : [],
          )
        : []),
    ]
    if (
      targetIds.some(
        (id) =>
          newlyAccepted(id) &&
          !(rulesVersion >= 16 && isEssenceMappedMod(catalog, initialBase, id)),
      )
    )
      return fail('v2–v26 旧版项目不能包含 Genesis 目标或替代档位。')
  }
  if (rulesVersion < 22 && initialBase && isBeltCapacityBase(initialBase))
    return fail('v2–v21 旧版项目不能包含带特殊咒符容量的腰带起点。')
  if (
    rulesVersion < 19 &&
    initialBase !== undefined &&
    !['Body Armour', 'Helmet', 'Gloves', 'Boots', 'Focus', 'Shield', 'Buckler'].includes(
      initialBase.type,
    ) &&
    ((initialInput.sockets?.length ?? 0) > 0 ||
      Object.hasOwn(value, 'importedSockets') ||
      value.operations.some(
        (operation) =>
          record(operation) && (operation.kind === 'socket' || operation.kind === 'artificer'),
      ))
  )
    return fail('v2–v18 旧版武器项目不能包含孔位声明或镶嵌操作。')
  const legacyOffhand =
    rulesVersion < 11 &&
    initialBase !== undefined &&
    ['Focus', 'Shield', 'Buckler'].includes(initialBase.type)
  if (
    legacyOffhand &&
    ((initialInput.sockets?.length ?? 0) > 0 ||
      Object.hasOwn(value, 'importedSockets') ||
      value.operations.some(
        (operation) =>
          record(operation) && (operation.kind === 'socket' || operation.kind === 'artificer'),
      ))
  )
    return fail('v2–v10 旧版副手项目不能包含孔位声明或镶嵌操作。')
  let importedSockets: (string | null)[] | undefined
  if (Object.hasOwn(value, 'importedSockets')) {
    if (
      !Array.isArray(value.importedSockets) ||
      value.importedSockets.length > 10 ||
      !value.importedSockets.every((id) => id === null || nonempty(id))
    )
      return fail('导入孔位核对声明无效。')
    importedSockets = [...value.importedSockets]
  }
  let importedQuality: number | undefined
  if (
    (initialInput.catalyst !== undefined ||
      usesJewelEffects ||
      usesSovereignEffects ||
      usesEffectiveTargets ||
      Object.hasOwn(value, 'scalabilitySourceHash')) &&
    (scalabilitySourceHash === null || value.scalabilitySourceHash !== scalabilitySourceHash)
  )
    return fail('项目属性缩放来源指纹缺失或与当前目录不同。')
  if (Object.hasOwn(value, 'importedQuality')) {
    if (
      typeof value.importedQuality !== 'number' ||
      !Number.isInteger(value.importedQuality) ||
      value.importedQuality < 0 ||
      value.importedQuality > 30
    )
      return fail('导入品质声明无效。')
    importedQuality = value.importedQuality
  }
  const socketIds = [
    ...(initialInput.sockets ?? []),
    ...(importedSockets ?? []),
    ...value.operations.flatMap((operation) =>
      record(operation) && operation.kind === 'socket' && nonempty(operation.augmentId)
        ? [operation.augmentId]
        : [],
    ),
    ...(strategy?.rules.flatMap((rule) =>
      rule.action.kind === 'socket' ? [rule.action.augmentId] : [],
    ) ?? []),
  ]
  if (
    rulesVersion < 58 &&
    socketIds.some((id) => {
      const augment = catalog.augments?.find((entry) => entry.id === id)
      return augment !== undefined && isSupportedSoulCore(augment)
    })
  )
    return fail('v57 及更早项目不能包含基础魂核，包括起点、导入声明、未执行操作和指引。')
  if (
    rulesVersion < 57 &&
    socketIds.some((id) => {
      const augment = catalog.augments?.find((entry) => entry.id === id)
      return augment !== undefined && isExtendedWeaponRune(augment)
    })
  )
    return fail('v56 及更早项目不能包含新增武器符文效果，包括起点、导入声明、未执行操作和指引。')
  if (
    rulesVersion < 56 &&
    socketIds.some((id) => {
      const augment = catalog.augments?.find((entry) => entry.id === id)
      return augment !== undefined && isUtilityArmourRune(augment)
    })
  )
    return fail(
      'v55 及更早项目不能包含新增生命、魔力、属性等防具符文，包括起点、未执行操作和指引。',
    )
  if (rulesVersion < 10) {
    const usesIron = socketIds.some((id) => {
      if (id === null) return false
      const augment = catalog.augments?.find((entry) => entry.id === id)
      if (!augment || !isSupportedArmourRune(augment)) return false
      return (parseRuneEffectTotals(augment.lines)?.Defences ?? 0) > 0
    })
    if (usesIron) return fail('v2–v9 旧版项目不能包含钢铁符文或其镶嵌操作。')
  }
  const usesSockets =
    strategy?.rules.some(
      (rule) =>
        rule.action.kind === 'socket' ||
        rule.action.kind === 'artificer' ||
        rule.action.kind === 'extraction' ||
        rule.action.kind === 'masterwork',
    ) ||
    importedSockets !== undefined ||
    initialInput.sockets !== undefined ||
    value.operations.some(
      (step) =>
        record(step) &&
        (step.kind === 'socket' ||
          step.kind === 'artificer' ||
          step.kind === 'extraction' ||
          step.kind === 'masterwork'),
    )
  const augmentSourceHash = catalog._meta.sources.find(
    (source) => source.path === 'src/Data/ModRunes.lua',
  )?.sha256
  if (usesSockets || Object.hasOwn(value, 'augmentSourceHash')) {
    if (
      typeof augmentSourceHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(augmentSourceHash) ||
      value.augmentSourceHash !== augmentSourceHash
    )
      return fail('项目镶嵌物来源指纹缺失或与当前目录不同，不能恢复。')
  }
  const usesEssences =
    requiresRetainedCatalystProjectVersion(initialInput, catalog) ||
    storedTargetSources.essence ||
    strategy?.rules.some((rule) => rule.action.kind === 'essence') ||
    value.operations.some((step) => record(step) && step.kind === 'essence')
  const essenceSourceHash = readEssenceSourceHash(catalog)
  if (usesEssences || Object.hasOwn(value, 'essenceSourceHash')) {
    if (essenceSourceHash === null || value.essenceSourceHash !== essenceSourceHash)
      return fail('项目精华来源指纹缺失或与当前目录不同，不能恢复。')
  }
  const usesDesecration =
    storedTargetSources.desecration ||
    strategy?.rules.some(
      (rule) => rule.action.kind === 'desecrate' || rule.action.kind === 'reveal',
    ) ||
    initialInput.affixes.some((affix) => affix.desecrated) ||
    value.operations.some((step) => record(step) && isBoneOperationKind(step.kind))
  const desecrationSourceHash = readDesecrationSourceHash(catalog)
  if (usesDesecration || Object.hasOwn(value, 'desecrationSourceHash')) {
    if (desecrationSourceHash === null || value.desecrationSourceHash !== desecrationSourceHash)
      return fail('项目亵渎来源指纹缺失或与当前目录不同，不能恢复。')
  }
  const initial = validateInitial(
    initialInput,
    rulesVersion === 15
      ? {
          ...catalog,
          essences: (catalog.essences ?? []).filter(
            (essence) => essenceCraftMode(essence.id) === 'upgrade',
          ),
        }
      : catalog,
    dictionary,
    importedSockets,
    importedQuality,
    rulesVersion < 9,
    native,
  )
  if (!initial.ok) return initial
  const restoredEffectError = validateEffectState(initial.value)
  if (restoredEffectError) return fail(restoredEffectError)
  const restoredCapacityError = validateCapacityState(initial.value)
  if (restoredCapacityError) return fail(restoredCapacityError)
  if (
    rulesVersion < 51 &&
    initial.value.affixes.some((affix) =>
      catalog.modifiers.some((mod) => mod.id === affix.modId && mod.craftedOnly),
    )
  )
    return fail('v2–v50 旧版项目不能包含新增珠宝工艺专属起点。')
  const unsupportedLegacyAmplification = (state: CraftState) =>
    rulesVersion < 35 &&
    (state.sockets?.length ?? 0) > 0 &&
    state.affixes.some((affix) => isHorrorSocketAffix(catalog, state, affix))
  // 旧版导入会对零孔也检查 socketCapacity；历史中零孔再加恐惧工艺则原本合法。
  if (
    unsupportedLegacyAmplification(initial.value) ||
    (rulesVersion < 35 &&
      initial.value.sockets !== undefined &&
      initial.value.affixes.some((affix) => isHorrorSocketAffix(catalog, initial.value, affix)))
  )
    return fail('v2–v34 旧版项目不能包含恐惧精华镶嵌增效状态。')
  // 旧目标沿用当时的普通/精华身份，不因新版 Genesis 保留目标释放工艺槽。
  const legacyTargetCatalog =
    rulesVersion < 27
      ? {
          ...catalog,
          ...(rulesVersion < 16 ? { essences: [] } : {}),
          bases: catalog.bases.map((base) => ({
            ...base,
            tags: base.tags.filter(
              (tag) => tag !== 'genesis_tree_caster' && tag !== 'genesis_tree_minion',
            ),
          })),
        }
      : catalog
  // 旧目标保留已开放液态身份，按版本移除新增材料。
  const targetCatalog =
    rulesVersion < 68
      ? {
          ...legacyTargetCatalog,
          liquidEmotions: (legacyTargetCatalog.liquidEmotions ?? []).filter(
            (emotion) =>
              !emotion.radiusJewel &&
              (rulesVersion >= 53 || emotion.id !== JEWEL_EFFECT_EMOTION_ID) &&
              (rulesVersion >= 52 || emotion.id !== JEWEL_CAPACITY_EMOTION_ID),
          ),
        }
      : legacyTargetCatalog
  let targetModIds: string[] | undefined
  if (Object.hasOwn(value, 'targetModIds')) {
    if (!Array.isArray(value.targetModIds) || !value.targetModIds.every(nonempty))
      return fail('制作目标列表无效。')
    const targets = native
      ? { ok: true as const, value: value.targetModIds as string[] }
      : validateCraftTargets(
          targetCatalog,
          initial.value.baseId,
          value.targetModIds,
          minimumTargetCount,
        )
    if (!targets.ok) return fail(`制作目标无效：${targets.error}`)
    targetModIds = targets.value
  }
  let targetAlternatives: CraftTargetAlternative[] | undefined
  if (Object.hasOwn(value, 'targetAlternatives')) {
    const accepted = native
      ? { ok: true as const, value: value.targetAlternatives as CraftTargetAlternative[] }
      : validateCraftTargetAlternatives(
          targetCatalog,
          initial.value.baseId,
          targetModIds ?? [],
          value.targetAlternatives,
          minimumTargetCount,
        )
    if (!accepted.ok) return fail(`替代档位无效：${accepted.error}`)
    targetAlternatives = accepted.value
  }
  if (
    rulesVersion < 24 &&
    [...(targetModIds ?? []), ...(targetAlternatives ?? []).flatMap((entry) => entry.modIds)].some(
      (id) => catalog.modifiers.find((mod) => mod.id === id)?.desecratedOnly,
    )
  )
    return fail('旧规则项目不能包含亵渎专属目标或替代档位。')
  let targetFracturedModId: string | undefined
  if (Object.hasOwn(value, 'targetFracturedModId')) {
    const fracture = native
      ? { ok: true as const, value: value.targetFracturedModId as string }
      : validateCraftFractureTarget(
          catalog,
          targetModIds ?? [],
          targetAlternatives ?? [],
          value.targetFracturedModId,
        )
    if (!fracture.ok) return fail(fracture.error)
    targetFracturedModId = fracture.value
    const combined = native
      ? { ok: true as const }
      : validateCraftTargets(
          targetCatalog,
          initial.value.baseId,
          targetModIds ?? [],
          minimumTargetCount,
          targetFracturedModId,
        )
    if (!combined.ok) return fail(combined.error)
  }
  let targetValues: CraftTargetValues[] | undefined
  if (Object.hasOwn(value, 'targetValues')) {
    const checkedValues = native
      ? { ok: true as const, value: value.targetValues as CraftTargetValues[] }
      : storedTargets
        ? validateStoredCraftTargetValues(
            targetCatalog,
            initial.value.baseId,
            targetModIds ?? [],
            value.targetValues,
            targetAlternatives,
            minimumTargetCount,
          )
        : validateCraftTargetValues(
            targetCatalog,
            initial.value.baseId,
            targetModIds ?? [],
            value.targetValues,
            targetAlternatives,
            initial.value,
            minimumTargetCount,
          )
    if (!checkedValues.ok) return fail(`数值目标无效：${checkedValues.error}`)
    targetValues = checkedValues.value
  }
  if (!native && usesJewel && (targetModIds?.length ?? 0) > 0) {
    const ids = targetModIds ?? []
    const required = minimumTargetCount ?? ids.length
    // 替代档位与主组同侧同冲突组，只枚举主组，不能把多个备选误算成已有属性。
    let inherentCombination = false
    for (let mask = 1; mask < 2 ** ids.length; mask++) {
      const selected = ids.filter((_, index) => (mask & (1 << index)) !== 0)
      if (
        selected.length !== required ||
        (targetFracturedModId !== undefined && !selected.includes(targetFracturedModId))
      )
        continue
      const counts = { prefix: 0, suffix: 0 }
      for (const id of selected) {
        const mod = catalog.modifiers.find((entry) => entry.id === id)
        if (mod) counts[mod.kind]++
      }
      if (
        counts.prefix <= 2 &&
        counts.suffix <= 2 &&
        validateCraftTargets(targetCatalog, initial.value.baseId, selected).ok
      ) {
        inherentCombination = true
        break
      }
    }
    if (!inherentCombination) {
      if (rulesVersion < 52) return fail('v2–v51 旧版项目不能包含超固有容量的珠宝目标组合。')
      if (
        rulesVersion < 68 &&
        catalog.bases.some((base) => base.id === initial.value.baseId && isRadiusJewel(base))
      )
        return fail('v2–v67 旧版项目不能包含超固有容量的范围珠宝目标组合。')
      if (
        liquidEmotionSourceHash === null ||
        value.liquidEmotionSourceHash !== liquidEmotionSourceHash
      )
        return fail('项目珠宝增容目标的液态情感来源指纹缺失或与当前目录不同。')
    }
  }
  const operations: CraftStep[] = []
  let targetImplicitValues: CraftImplicitTargetValues[] | undefined
  if (Object.hasOwn(value, 'targetImplicitValues')) {
    const implicit = storedTargets
      ? validateStoredCraftImplicitTargets(
          catalog,
          initial.value.baseId,
          value.targetImplicitValues,
        )
      : validateCraftImplicitTargets(
          catalog,
          initial.value.baseId,
          value.targetImplicitValues,
          initial.value,
        )
    if (!implicit.ok) return fail(`固有目标无效：${implicit.error}`)
    targetImplicitValues = implicit.value
  }
  const states: CraftState[] = [initial.value]
  let current = initial.value
  for (const [index, input] of value.operations.entries()) {
    if (rulesVersion < 14 && record(input) && Object.hasOwn(input, 'omen'))
      return fail('旧版项目不能包含预兆操作字段。')
    if (rulesVersion === 5 && record(input) && input.kind === 'artificer')
      return fail('旧版项目不能包含巧匠石打孔操作。')
    if (legacy && record(input) && Object.hasOwn(input, 'kind'))
      return fail('旧版项目不能包含镶嵌操作。')
    if (
      rulesVersion <= 3 &&
      record(input) &&
      typeof input.currency === 'string' &&
      !ORIGINAL_CURRENCIES.has(input.currency)
    )
      return fail('旧版项目不能包含高级或完美通货。')
    if (
      rulesVersion === 2 &&
      record(input) &&
      (input.currency === 'divine' ||
        Object.hasOwn(input, 'rolls') ||
        Object.hasOwn(input, 'implicitValues'))
    )
      return fail('旧版项目不能包含新数值操作。')
    // applyCraftStep 自身严格检查每种操作的字段及实例断言；旧入口仍只接受旧结构。
    const operation = native
      ? readNativeOperation(input, perfectFlux, extraction, runeforge, masterwork, skillSockets)
      : readOperation(input)
    if (!operation) return fail(`第 ${index + 1} 步操作结构无效。`)
    if (
      rulesVersion < 72 &&
      current.pendingDesecration &&
      'kind' in operation &&
      operation.kind === 'liquid-emotion'
    )
      return fail('旧版项目不能包含未揭示期间的液态情感操作。')
    const next = applyCraftStep(catalog, current, operation)
    if (!next.ok) return fail(`第 ${index + 1} 步无法回放：${next.error}`)
    const effectError = validateEffectState(next.value)
    if (effectError) return fail(`第 ${index + 1} 步无法回放：${effectError}`)
    const capacityError = validateCapacityState(next.value)
    if (capacityError) return fail(`第 ${index + 1} 步无法回放：${capacityError}`)
    if (unsupportedLegacyAmplification(next.value))
      return fail(`第 ${index + 1} 步包含旧版不支持的恐惧精华镶嵌增效。`)
    operations.push(operation)
    current = next.value
    states.push(current)
  }
  return {
    ok: true,
    value: {
      project: {
        schemaVersion: 1,
        sourceCommit: catalog._meta.sourceCommit,
        rulesVersion: CRAFT_RULES_VERSION,
        ...(usesCorruption && corruptionSourceHash ? { corruptionSourceHash } : {}),
        ...((initialInput.catalyst !== undefined ||
          usesJewelEffects ||
          usesSovereignEffects ||
          usesEffectiveTargets ||
          Object.hasOwn(value, 'scalabilitySourceHash')) &&
        scalabilitySourceHash
          ? { scalabilitySourceHash }
          : {}),
        initialState: initial.value,
        operations,
        cursor: value.cursor,
        ...(importedSockets === undefined ? {} : { importedSockets }),
        ...(importedQuality === undefined ? {} : { importedQuality }),
        ...((usesSockets || Object.hasOwn(value, 'augmentSourceHash')) &&
        augmentSourceHash !== undefined
          ? { augmentSourceHash }
          : {}),
        ...((usesEssences || Object.hasOwn(value, 'essenceSourceHash')) &&
        essenceSourceHash !== null
          ? { essenceSourceHash }
          : {}),
        ...((usesDesecration || Object.hasOwn(value, 'desecrationSourceHash')) &&
        desecrationSourceHash !== null
          ? { desecrationSourceHash }
          : {}),
        ...(targetModIds === undefined ? {} : { targetModIds }),
        ...(minimumTargetCount === undefined ? {} : { minimumTargetCount }),
        ...(strategy === undefined ? {} : { strategy }),
        ...(strategy?.flow ? { strategyStartStep: value.strategyStartStep as number } : {}),
        ...((usesJewel || storedTargetSources.jewel) && jewelSourceHash !== null
          ? { jewelSourceHash }
          : {}),
        ...((usesLiquidEmotions ||
          usesJewelEffects ||
          Object.hasOwn(value, 'liquidEmotionSourceHash')) &&
        liquidEmotionSourceHash !== null
          ? { liquidEmotionSourceHash }
          : {}),
        ...(needsAlloyCatalog && alloyCatalogSignature !== null ? { alloyCatalogSignature } : {}),
        ...(pricing?.ok ? { pricing: pricing.value } : {}),
        ...(targetFracturedModId === undefined ? {} : { targetFracturedModId }),
        ...(targetValues === undefined ? {} : { targetValues }),
        ...(targetImplicitValues === undefined ? {} : { targetImplicitValues }),
        ...(targetAlternatives === undefined ? {} : { targetAlternatives }),
      },
      states,
    },
  }
}

export function serializeCraftProject(project: CraftProject): string {
  if (requiresAmuletCatalystProjectVersion(project))
    throw new Error('技能项链催化品质必须使用 v105 项目，包括起点、完整未来和嵌套未执行状态。')
  if (requiresAmuletSkillLevelProjectVersion(project))
    throw new Error('技能项链等级制作必须使用 v104 项目，包括起点、完整未来、目标和未执行指引。')
  if (requiresAmuletSkillSocketsProjectVersion(project))
    throw new Error('技能项链辅助孔必须使用 v103 项目，包括起点、完整未来、目标和未执行指引。')
  if (requiresSkillVariantAmuletProjectVersion(project))
    throw new Error('技能变体项链必须使用 v102 项目，包括起点、完整未来和嵌套未执行结构。')
  if (requiresSkillLevelDeclarationProjectVersion(project))
    throw new Error('装备最高技能等级起点声明必须使用 v101 项目，包括完整未来和嵌套未执行结构。')
  if (requiresSkillSocketTargetProjectVersion(project))
    throw new Error('装备技能辅助孔起点声明与目标必须使用 v100 项目。')
  if (requiresSkillSocketsProjectVersion(project))
    throw new Error('装备技能辅助孔必须使用 v99 项目，包括起点、完整未来、嵌套未执行指引及报价。')
  if (requiresWeightedPropertyProjectVersion(project))
    throw new Error('面板加权合计条件必须使用 v98 项目，包括完整未来和嵌套未执行指引。')
  if (requiresGrantedSkillTargetProjectVersion(project))
    throw new Error('装备固有技能目标必须使用 v97 项目，包括起点、目标、完整未来和未执行指引。')
  if (requiresRuneforgeProjectVersion(project))
    throw new Error('锻造操作、指引及 Verisium 报价必须使用 v82 项目。')
  if (requiresCorruptionStrategyProjectVersion(project))
    throw new Error('腐化材料指引及腐化状态条件必须使用 v78 项目。')
  if (requiresExtractionProjectVersion(project))
    throw new Error('萃取石及相关指引或报价必须使用 v77 项目。')
  if (requiresPerfectFluxProjectVersion(project))
    throw new Error('完美溶剂、装备技能结果及相关指引或报价必须使用 v76 项目。')
  if (hasAffixIdentityFields(project)) throw new Error('v72 项目尚不支持词缀实例字段，不能序列化。')
  if (
    !validStrategyStartStep(
      project.strategy,
      project.strategyStartStep,
      project.operations.length,
    ) ||
    (Object.hasOwn(project, 'strategyStartStep') &&
      (project.rulesVersion !== CRAFT_RULES_VERSION || !project.strategy?.flow))
  )
    throw new Error('阶段流程起点无效，不能序列化。')
  if (
    Object.hasOwn(project, 'strategy') &&
    (project.rulesVersion !== CRAFT_RULES_VERSION || !readCraftStrategy(project.strategy).ok)
  )
    throw new Error('条件制作指引或项目版本无效，不能序列化。')
  if (
    Object.hasOwn(project, 'minimumTargetCount') &&
    (project.rulesVersion !== CRAFT_RULES_VERSION ||
      typeof project.minimumTargetCount !== 'number' ||
      !Number.isInteger(project.minimumTargetCount) ||
      project.minimumTargetCount < 1 ||
      !Array.isArray(project.targetModIds) ||
      project.minimumTargetCount > project.targetModIds.length)
  )
    throw new Error('部分目标数量或项目版本无效，不能序列化。')

  if (
    Object.hasOwn(project, 'targetFracturedModId') &&
    (project.rulesVersion !== CRAFT_RULES_VERSION ||
      !nonempty(project.targetFracturedModId) ||
      !Array.isArray(project.targetModIds) ||
      !project.targetModIds.includes(project.targetFracturedModId))
  )
    throw new Error('破裂目标字段或项目版本无效，不能序列化。')
  if (Object.hasOwn(project, 'targetImplicitValues')) {
    const targets = readCraftImplicitTargets(project.targetImplicitValues)
    if (!targets.ok || project.rulesVersion !== CRAFT_RULES_VERSION)
      throw new Error('固有目标字段或项目版本无效，不能序列化。')
  }
  if (
    Object.hasOwn(project.initialState, 'pendingDesecration') &&
    !isPendingDesecration(project.initialState.pendingDesecration)
  )
    throw new Error('待揭示亵渎字段无效，不能序列化项目。')
  for (const step of project.operations) {
    if ('kind' in step && step.kind === 'fracture' && !isFractureCraftOperation(step))
      throw new Error('破裂操作字段无效，不能序列化项目。')
  }
  for (const step of project.operations) {
    if ('kind' in step && isBoneOperationKind(step.kind) && !isBoneCraftOperation(step))
      throw new Error('骨骼或揭示操作字段无效，不能序列化项目。')
    if ('kind' in step && step.kind === 'alloy' && !isAlloyCraftOperation(step))
      throw new Error('合金操作字段无效，不能序列化项目。')
    if ('kind' in step && step.kind === 'liquid-emotion' && !readOperation(step))
      throw new Error('液态情感操作字段无效，不能序列化项目。')
  }
  // JSON 会丢弃 undefined；先拒绝显式非法来源，防止字段门禁被序列化绕过。
  for (const affix of project.initialState.affixes) {
    if (Object.hasOwn(affix, 'fractured') && affix.fractured !== true)
      throw new Error('破裂标记必须为 true，不能序列化项目。')
    if (Object.hasOwn(affix, 'desecrated') && affix.desecrated !== true)
      throw new Error('亵渎来源字段无效，不能序列化项目。')
  }
  // 预兆同样不能因序列化而丢失非法声明。
  for (const step of project.operations) {
    if (
      'kind' in step &&
      step.kind === 'essence' &&
      Object.hasOwn(step, 'omen') &&
      !isEssenceOmen(step.omen)
    )
      throw new Error('精华预兆字段无效，不能序列化项目。')
  }
  if (Object.hasOwn(project, 'pricing') && !parseCraftPricing(project.pricing).ok)
    throw new Error('报价字段无效，不能序列化项目。')
  return JSON.stringify(project, null, 2)
}

import { corruptionSourceHash as readCorruptionSourceHash } from './corruptionSource'
