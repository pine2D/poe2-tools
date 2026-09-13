import { readStatAnnotations } from './annotations'
import { isBeltCapacityBase, resolveCraftImplicitPatterns } from './beltImplicits'
import {
  clonePendingDesecration,
  isBoneCraftOperation,
  isBoneOperationKind,
  isPendingDesecration,
} from './boneRules'
import { type CraftCatalog, hasCraftModEligibility, hasGenesisModEligibility } from './catalog'
import { isCatalystQuality } from './catalystQuality'
import { type CraftPricing, parseCraftPricing } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { type CraftStrategy, readCraftStrategy } from './craftStrategy'
import { desecrationSourceHash as readDesecrationSourceHash } from './desecration'
import { isEssenceOmen } from './essenceOmens'
import {
  essenceCraftMode,
  isEssenceMappedMod,
  essenceSourceHash as readEssenceSourceHash,
} from './essences'
import { type ItemDictionary, inspectItem } from './export'
import { isFractureCraftOperation } from './fracture'
import { validateCraftFractureTarget } from './fractureTargets'
import {
  matchesGrantedSkillImplicitLines,
  readBaseGrantedSkills,
  readUnlevelledSkillName,
} from './grantedSkills'
import {
  type CraftImplicitTargetValues,
  readCraftImplicitTargets,
  validateCraftImplicitTargets,
} from './implicitTargets'
import { jewelSourceHash as readJewelSourceHash } from './jewels'
import { CRAFT_OMEN_RULES, type CraftOmen, isCraftOmen } from './omens'
import { parseItem } from './parse'
import {
  CRAFT_CURRENCY_LABELS,
  type CraftCurrency,
  type CraftOperation,
  type CraftResult,
  type CraftState,
  createCraftState,
} from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { isSupportedArmourRune, parseRuneEffectTotals } from './runeEffects'
import { isHorrorSocketAffix } from './socketAmplification'
import { statScalabilitySourceHash } from './statScalability'
import {
  type CraftTargetAlternative,
  type CraftTargetValues,
  validateCraftTargetAlternatives,
  validateCraftTargets,
  validateCraftTargetValues,
} from './targets'

export const CRAFT_RULES_VERSION = 'basic-2026-09-12-v42'
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
  augmentSourceHash?: string
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
  return String(version) === match[1] && version >= 2 && version <= 42 ? version : null
}

function readState(value: unknown): CraftState | null {
  if (
    !record(value) ||
    !exactKeys(value, [
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
  if (!Array.isArray(value.affixes) || value.affixes.length > 6) return null
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
      !exactKeys(affix, ['modId', 'lines', 'crafted', 'desecrated', 'fractured']) ||
      (Object.hasOwn(affix, 'crafted') && affix.crafted !== true) ||
      (Object.hasOwn(affix, 'desecrated') && affix.desecrated !== true) ||
      (Object.hasOwn(affix, 'fractured') && affix.fractured !== true) ||
      !nonempty(affix.modId) ||
      !Array.isArray(affix.lines) ||
      !affix.lines.every(nonempty)
    )
      return null
    affixes.push({
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
    baseId: value.baseId,
    itemLevel: value.itemLevel,
    rarity: value.rarity as CraftState['rarity'],
    affixes,
    sourceText: value.sourceText,
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
    if (value.kind === 'essence')
      return exactKeys(value, ['kind', 'essenceId', 'values', 'removeModId', 'omen']) &&
        (!Object.hasOwn(value, 'omen') || isEssenceOmen(value.omen)) &&
        nonempty(value.essenceId) &&
        numericValues(value.values) &&
        (!Object.hasOwn(value, 'removeModId') || nonempty(value.removeModId))
        ? {
            kind: 'essence',
            essenceId: value.essenceId,
            ...(isEssenceOmen(value.omen) ? { omen: value.omen } : {}),
            values: [...value.values],
            ...(typeof value.removeModId === 'string' ? { removeModId: value.removeModId } : {}),
          }
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
    if (!Array.isArray(value.rolls) || value.rolls.length > 6) return null
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

function validateInitial(
  state: CraftState,
  catalog: CraftCatalog,
  dictionary: ItemDictionary,
  importedSockets?: readonly (string | null)[],
  importedQuality?: number,
  legacy = false,
): CraftResult<CraftState> {
  if (Object.hasOwn(state, 'pendingDesecration'))
    return { ok: false, error: '项目起点不能预装待揭示亵渎；必须从已支持的起点回放骨骼操作。' }
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (state.sourceText === null) {
    if (state.catalyst && state.catalyst.declared !== true)
      return { ok: false, error: '搜索起点的催化品质需要明确声明。' }
    if (importedSockets !== undefined)
      return { ok: false, error: '孔位核对声明必须关联来源原文，不能用于空白起点。' }
    if (importedQuality !== undefined)
      return { ok: false, error: '导入品质声明必须关联来源原文，不能用于空白起点。' }
    if (state.sockets?.some((id) => id !== null))
      return { ok: false, error: '空白项目起点只能设定已有空孔，不能预设镶嵌物。' }
    const patterns =
      catalog.bases.find((base) => base.id === state.baseId)?.implicit?.split('\n') ?? []
    if (state.implicitLines !== undefined) {
      const blankBase = catalog.bases.find((base) => base.id === state.baseId)
      if (blankBase === undefined) return { ok: false, error: '空白项目基底不存在。' }
      const skillIndexes = new Set(readBaseGrantedSkills(blankBase).map((skill) => skill.lineIndex))
      const implicit = resolveCraftImplicitPatterns(blankBase, state)
      if (!implicit.ok) return implicit
      const belt = implicit.value.charm
      const initialPatterns = belt ? implicit.value.patterns : patterns
      if (
        state.implicitLines.length !== initialPatterns.length ||
        initialPatterns.some((pattern, index) => {
          const actual = state.implicitLines?.[index]
          if (belt?.lineIndex === index) return false
          return (
            actual === undefined ||
            (skillIndexes.has(index)
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
  const restored = importCraftState(
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
    restored.value.rarity !== state.rarity ||
    restored.value.itemLevel !== state.itemLevel ||
    JSON.stringify(restored.value.affixes) !== JSON.stringify(state.affixes)
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
  return restored
}

/** 保存格式只包含起点和操作；恢复时回放所有步骤，不能信任外来派生快照。 */
export function parseCraftProject(
  text: string,
  catalog: CraftCatalog,
  dictionary: ItemDictionary = {},
): CraftResult<RestoredCraftProject> {
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
      'targetFracturedModId',
      'targetValues',
      'targetImplicitValues',
      'targetAlternatives',
      'augmentSourceHash',
      'essenceSourceHash',
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
  if (value.sourceCommit !== catalog._meta.sourceCommit)
    return fail('项目与当前制作目录快照不同，不能混用。')
  const rulesVersion = readRulesVersion(value.rulesVersion)
  if (rulesVersion === null) return fail('项目与当前通货规则版本不同，暂不能恢复。')
  let strategy: CraftStrategy | undefined
  if (Object.hasOwn(value, 'strategy')) {
    if (rulesVersion < 39) return fail('v2–v38 旧版项目不能包含条件制作指引。')
    const read = readCraftStrategy(value.strategy)
    if (!read.ok) return fail(read.error)
    const selectedTargets = read.value.rules.flatMap((rule) =>
      rule.conditions.flatMap((condition) =>
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
          rule.conditions.some((condition) =>
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
          rule.conditions.some((condition) =>
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
  if (rulesVersion < 32 && (usesJewel || Object.hasOwn(value, 'jewelSourceHash')))
    return fail('v2–v31 旧版项目不能包含珠宝制作起点或来源。')
  const jewelSourceHash = readJewelSourceHash(catalog)
  if (
    (usesJewel || Object.hasOwn(value, 'jewelSourceHash')) &&
    (!usesJewel || jewelSourceHash === null || value.jewelSourceHash !== jewelSourceHash)
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
    typeof value.cursor !== 'number' ||
    !Number.isInteger(value.cursor) ||
    value.cursor < 0 ||
    value.cursor > value.operations.length
  )
    return fail('演练历史游标无效。')
  const initialInput = readState(value.initialState)
  if (!initialInput) return fail('演练起点结构无效。')
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
  const scalabilitySourceHash = statScalabilitySourceHash(catalog)
  if (
    (initialInput.catalyst !== undefined ||
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
  if (rulesVersion < 10) {
    const ids = [
      ...(initialInput.sockets ?? []),
      ...(importedSockets ?? []),
      ...value.operations.flatMap((operation) =>
        record(operation) && operation.kind === 'socket' && nonempty(operation.augmentId)
          ? [operation.augmentId]
          : [],
      ),
    ]
    const usesIron = ids.some((id) => {
      if (id === null) return false
      const augment = catalog.augments?.find((entry) => entry.id === id)
      if (!augment || !isSupportedArmourRune(augment)) return false
      return (parseRuneEffectTotals(augment.lines)?.Defences ?? 0) > 0
    })
    if (usesIron) return fail('v2–v9 旧版项目不能包含钢铁符文或其镶嵌操作。')
  }
  const usesSockets =
    strategy?.rules.some(
      (rule) => rule.action.kind === 'socket' || rule.action.kind === 'artificer',
    ) ||
    importedSockets !== undefined ||
    initialInput.sockets !== undefined ||
    value.operations.some(
      (step) => record(step) && (step.kind === 'socket' || step.kind === 'artificer'),
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
    strategy?.rules.some((rule) => rule.action.kind === 'essence') ||
    value.operations.some((step) => record(step) && step.kind === 'essence')
  const essenceSourceHash = readEssenceSourceHash(catalog)
  if (usesEssences || Object.hasOwn(value, 'essenceSourceHash')) {
    if (essenceSourceHash === null || value.essenceSourceHash !== essenceSourceHash)
      return fail('项目精华来源指纹缺失或与当前目录不同，不能恢复。')
  }
  const usesDesecration =
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
  )
  if (!initial.ok) return initial
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
  const targetCatalog =
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
  let targetModIds: string[] | undefined
  if (Object.hasOwn(value, 'targetModIds')) {
    if (!Array.isArray(value.targetModIds) || !value.targetModIds.every(nonempty))
      return fail('制作目标列表无效。')
    const targets = validateCraftTargets(
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
    const accepted = validateCraftTargetAlternatives(
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
    const fracture = validateCraftFractureTarget(
      catalog,
      targetModIds ?? [],
      targetAlternatives ?? [],
      value.targetFracturedModId,
    )
    if (!fracture.ok) return fail(fracture.error)
    targetFracturedModId = fracture.value
    const combined = validateCraftTargets(
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
    const checkedValues = validateCraftTargetValues(
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
  const operations: CraftStep[] = []
  let targetImplicitValues: CraftImplicitTargetValues[] | undefined
  if (Object.hasOwn(value, 'targetImplicitValues')) {
    const implicit = validateCraftImplicitTargets(
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
    const operation = readOperation(input)
    if (!operation) return fail(`第 ${index + 1} 步操作结构无效。`)
    const next = applyCraftStep(catalog, current, operation)
    if (!next.ok) return fail(`第 ${index + 1} 步无法回放：${next.error}`)
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
        ...((initialInput.catalyst !== undefined ||
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
        ...(usesJewel && jewelSourceHash !== null ? { jewelSourceHash } : {}),
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
