import { inspectCraftAlloys } from './alloys'
import { buildInitialBeltImplicitLines, isBeltCapacityBase } from './beltImplicits'
import { PENDING_DESECRATION_MESSAGE } from './boneRules'
import {
  type CatalogMod,
  type CraftCatalog,
  hasGenesisModEligibility,
  inspectModPool,
} from './catalog'
import { isPlainProjectJSON } from './craftProjectJSON'
import { desecrationSourceHash } from './desecration'
import { matchesTargetInterval, minimumCraftTargetRolls } from './effectiveTargetValues'
import { essenceSourceHash, inspectEssences, supportedEssenceId } from './essences'
import { validateCraftFractureTarget } from './fractureTargets'
import {
  analyzeCraftImplicitTargets,
  type CraftImplicitTargetStatus,
  type CraftImplicitTargetValues,
  craftImplicitTargetCandidates,
  implicitTargetRolls,
} from './implicitTargets'
import { inspectLiquidEmotions } from './liquidEmotions'
import { craftModsConflict } from './modConflicts'
import { inspectNumericLines } from './numeric'
import { CRAFT_OMEN_RULES, type CraftOmen, craftOmenError, isCraftOmen } from './omens'
import {
  CRAFT_CURRENCY_LABELS,
  CRAFT_CURRENCY_RULES,
  type CraftAffix,
  type CraftCurrency,
  type CraftResult,
  type CraftState,
  craftCandidates,
  createCraftState,
  prepareCraftOperation,
  type RemovalCraftCurrency,
  removableCraftAffixes,
} from './rehearsal'
import { inspectCraftTargetInstances, lostCraftTargetIds } from './targetProgress'
import { readCraftTargetValue } from './targetValueValidation'

export interface CraftTargetBound {
  index: number
  min?: number
  max?: number
}

export interface CraftTargetAlternative {
  targetModId: string
  modIds: string[]
}

export interface CraftTargetValues {
  /** 未声明时沿用基础值；有效值阈值随品质变化重新判断。 */
  basis?: 'effective'
  modId: string
  bounds: CraftTargetBound[]
}

export interface CraftAdviceStep {
  lostImplicitLineIndexes?: number[]
  targetImplicitLineIndexes?: number[]
  rerolledImplicitLineIndexes?: number[]
  omen?: CraftOmen
  currency: CraftCurrency
  removeModId?: string
  removeAffixId?: string
  /** 本步骤分别可选的目标，不代表可以同时生成。 */
  targetModIds: string[]
  lostTargetIds: string[]
  /** 神圣会同时重掷的已有数值目标，包含当前已达成的条件。 */
  rerolledTargetIds?: string[]
  randomRemovalRisk: boolean
  clearsAll: boolean
  remainingChoices: number
}

interface CraftTargetStatus {
  matchedAffixId?: string
  fracture?: { required: true; matched: boolean }
  modId: string
  present: boolean
  matched: boolean
  numeric: (CraftTargetBound & {
    actual: number | null
    actualRange?: { min: number; max: number }
    matched: boolean
  })[]
  reasons: string[]
}

export interface CraftAdvice {
  implicitTargets?: CraftImplicitTargetStatus[]
  targets: (CraftTargetStatus & { alternatives?: CraftTargetStatus[] })[]
  steps: CraftAdviceStep[]
}

/** 固有条件及指定破裂组是必选项，显式替代档位已由每个主组归并。 */
export function craftTargetsSatisfied(
  advice: CraftAdvice,
  minimumTargetCount?: number,
  fracturedTargetId?: string,
): boolean {
  const required = minimumTargetCount ?? advice.targets.length
  return (
    Number.isInteger(required) &&
    required >= 0 &&
    required <= advice.targets.length &&
    advice.targets.filter((target) => target.matched).length >= required &&
    (advice.implicitTargets ?? []).every((target) => target.matched) &&
    (fracturedTargetId === undefined ||
      advice.targets.some(
        (target) =>
          target.modId === fracturedTargetId && target.matched && target.fracture?.matched,
      ))
  )
}

function targetPools(catalog: CraftCatalog, baseId: string) {
  const base = catalog.bases.find((entry) => entry.id === baseId)
  const ordinary = new Set(
    base === undefined ? [] : inspectModPool(base, catalog.modifiers, 100).map(({ mod }) => mod.id),
  )
  const essence = new Set(
    base === undefined || essenceSourceHash(catalog) === null
      ? []
      : inspectEssences(catalog, base)
          .filter(
            (entry) =>
              supportedEssenceId(entry.essence.id) &&
              entry.mod !== null &&
              inspectNumericLines(entry.mod.lines).ok,
          )
          .map((entry) => entry.modId),
  )
  const desecrated = new Set(
    base && desecrationSourceHash(catalog) !== null
      ? inspectModPool(base, catalog.modifiers, 100, [], [], 'desecrated')
          .filter(
            (entry) =>
              entry.mod.desecratedOnly &&
              entry.reasons.length === 0 &&
              inspectNumericLines(entry.mod.lines).ok,
          )
          .map((entry) => entry.mod.id)
      : [],
  )
  const genesis = new Set(
    base
      ? catalog.modifiers.filter((mod) => hasGenesisModEligibility(base, mod)).map((mod) => mod.id)
      : [],
  )
  const liquid = new Set(
    base
      ? inspectLiquidEmotions(catalog, base)
          .filter((entry) => entry.reason === null)
          .flatMap((entry) => entry.outcomes)
          .filter((mod) => inspectNumericLines(mod.lines).ok)
          .map((mod) => mod.id)
      : [],
  )
  const alloy = new Set(
    base
      ? inspectCraftAlloys(catalog, base).flatMap((entry) =>
          entry.mod && inspectNumericLines(entry.mod.lines).ok ? [entry.mod.id] : [],
        )
      : [],
  )
  return { ordinary, essence, liquid, alloy, desecrated, genesis }
}

/** 目标资格使用既有物等100假想状态；腰带也必须构造合法完整固有行。 */
function targetImplicitLines(catalog: CraftCatalog, baseId: string): { implicitLines?: string[] } {
  const base = catalog.bases.find((entry) => entry.id === baseId)
  if (!base || !isBeltCapacityBase(base)) return {}
  const initial = buildInitialBeltImplicitLines(base, 100, 1)
  return initial.ok ? { implicitLines: initial.value } : {}
}

/** 目标资格独立于普通通货生成池，精华只授权当前基底的精确已解析保证属性。 */
export function craftTargetCandidates(catalog: CraftCatalog, baseId: string): CatalogMod[] {
  const { ordinary, essence, liquid, alloy, desecrated, genesis } = targetPools(catalog, baseId)
  return catalog.modifiers.filter(
    (mod) =>
      (ordinary.has(mod.id) ||
        essence.has(mod.id) ||
        liquid.has(mod.id) ||
        alloy.has(mod.id) ||
        desecrated.has(mod.id) ||
        genesis.has(mod.id)) &&
      createCraftState(catalog, {
        baseId,
        itemLevel: 100,
        rarity: 'rare',
        sourceText: null,
        ...targetImplicitLines(catalog, baseId),
        affixes: [
          {
            modId: mod.id,
            lines: [...mod.lines],
            ...(desecrated.has(mod.id)
              ? { desecrated: true }
              : !ordinary.has(mod.id) && !genesis.has(mod.id)
                ? { crafted: true }
                : {}),
          },
        ],
      }).ok,
  )
}

export function validateCraftTargets(
  catalog: CraftCatalog,
  baseId: string,
  ids: readonly string[],
  minimumTargetCount?: number,
  requiredTargetId?: string,
): CraftResult<string[]> {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string'))
    return { ok: false, error: '制作目标必须是词缀 ID 字符串数组。' }
  if (ids.length > 6) return { ok: false, error: '制作目标最多包含六组词缀。' }
  if (new Set(ids).size !== ids.length) return { ok: false, error: '制作目标不能包含重复词缀 ID。' }
  if (
    minimumTargetCount !== undefined &&
    (!Number.isInteger(minimumTargetCount) ||
      minimumTargetCount < 1 ||
      minimumTargetCount > ids.length)
  )
    return { ok: false, error: '至少达成数量必须是 1 至已选显式目标组数的整数。' }
  if (requiredTargetId !== undefined && !ids.includes(requiredTargetId))
    return { ok: false, error: '必选破裂组必须是已选显式目标。' }
  const byId = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  const { ordinary, essence, liquid, alloy, desecrated, genesis } = targetPools(catalog, baseId)
  const affixes: CraftAffix[] = []
  for (const id of ids) {
    const mod = byId.get(id)
    if (mod === undefined) return { ok: false, error: `目标词缀 ${id} 不在制作目录中。` }
    if (mod.desecratedOnly && !desecrated.has(id))
      return { ok: false, error: '专属目标缺少可信亵渎来源或当前基底资格。' }
    const crafted =
      !mod.desecratedOnly &&
      !ordinary.has(id) &&
      !genesis.has(id) &&
      (essence.has(id) || liquid.has(id) || alloy.has(id))
    affixes.push({
      modId: mod.id,
      lines: [...mod.lines],
      ...(crafted ? { crafted: true } : {}),
      ...(mod.desecratedOnly ? { desecrated: true } : {}),
    })
  }
  // 目标按稀有装备容量校验；已有词缀校验不限制生成物等，适用于高物等目标。
  const check = (selected: CraftAffix[]) =>
    createCraftState(catalog, {
      baseId,
      itemLevel: 100,
      rarity: 'rare',
      affixes: selected,
      sourceText: null,
      ...targetImplicitLines(catalog, baseId),
    })
  if (minimumTargetCount !== undefined && minimumTargetCount < ids.length) {
    const groups = affixes.map((affix) => byId.get(affix.modId)?.group)
    if (new Set(groups).size !== groups.length)
      return { ok: false, error: '同一词缀冲突组只能作为一个目标，请使用替代档位。' }
    for (const affix of affixes) {
      const single = check([affix])
      if (!single.ok) return single
    }
    for (let mask = 1; mask < 2 ** affixes.length; mask++) {
      const selected = affixes.filter((_, index) => (mask & (1 << index)) !== 0)
      if (
        selected.length === minimumTargetCount &&
        (requiredTargetId === undefined ||
          selected.some((affix) => affix.modId === requiredTargetId)) &&
        check(selected).ok
      )
        return { ok: true, value: [...ids] }
    }
    return {
      ok: false,
      error:
        requiredTargetId === undefined
          ? '当前基底的容量或冲突规则无法同时容纳要求数量的目标组。'
          : '不存在包含必选破裂组、且满足要求数量的合法目标组合。',
    }
  }
  const checked = check(affixes)
  return checked.ok ? { ok: true, value: [...ids] } : checked
}

function hasOnlyKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key))
  )
}

export function validateCraftTargetAlternatives(
  catalog: CraftCatalog,
  baseId: string,
  ids: readonly string[],
  alternatives: unknown,
  minimumTargetCount?: number,
): CraftResult<CraftTargetAlternative[]> {
  const targets = validateCraftTargets(catalog, baseId, ids, minimumTargetCount)
  if (!targets.ok) return targets
  if (!Array.isArray(alternatives) || alternatives.length > 6)
    return { ok: false, error: '替代档位必须是最多六组的数组。' }
  const byId = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  const seen = new Set<string>()
  const result: CraftTargetAlternative[] = []
  for (const entry of alternatives) {
    if (
      !hasOnlyKeys(entry, ['targetModId', 'modIds']) ||
      typeof entry.targetModId !== 'string' ||
      !targets.value.includes(entry.targetModId) ||
      seen.has(entry.targetModId) ||
      !Array.isArray(entry.modIds) ||
      entry.modIds.length < 1 ||
      entry.modIds.length > 31 ||
      !entry.modIds.every((id): id is string => typeof id === 'string') ||
      new Set(entry.modIds).size !== entry.modIds.length ||
      entry.modIds.includes(entry.targetModId)
    )
      return {
        ok: false,
        error: '替代档位必须关联唯一的主目标，并包含 1–31 个不重复的其他词缀 ID。',
      }
    const primary = byId.get(entry.targetModId)
    for (const id of entry.modIds) {
      const mod = byId.get(id)
      if (mod === undefined || mod.kind !== primary?.kind || mod.group !== primary.group)
        return { ok: false, error: '替代档位必须与主目标属于同一词缀类型和冲突组。' }
      const checked = validateCraftTargets(
        catalog,
        baseId,
        ids.map((target) => (target === entry.targetModId ? id : target)),
        minimumTargetCount,
      )
      if (!checked.ok) return checked
    }
    seen.add(entry.targetModId)
    result.push({ targetModId: entry.targetModId, modIds: [...entry.modIds] })
  }
  return { ok: true, value: result }
}

export function validateCraftTargetValues(
  catalog: CraftCatalog,
  baseId: string,
  ids: readonly string[],
  values: unknown,
  alternatives: readonly CraftTargetAlternative[] = [],
  state?: CraftState,
  minimumTargetCount?: number,
): CraftResult<CraftTargetValues[]> {
  return readTargetValues(catalog, baseId, ids, values, alternatives, minimumTargetCount, { state })
}

/** 只校验可持久化条件；实际品质、增效和属性行对应由运行时入口验证。 */
export function validateStoredCraftTargetValues(
  catalog: CraftCatalog,
  baseId: string,
  ids: readonly string[],
  values: unknown,
  alternatives: readonly CraftTargetAlternative[] = [],
  minimumTargetCount?: number,
): CraftResult<CraftTargetValues[]> {
  try {
    if (!isPlainProjectJSON({ ids, values, alternatives }))
      return { ok: false, error: '存储数值目标必须只包含自有、可枚举的数据字段。' }
  } catch {
    return { ok: false, error: '存储数值目标对象无法安全检查。' }
  }
  return readTargetValues(catalog, baseId, ids, values, alternatives, minimumTargetCount)
}

function readTargetValues(
  catalog: CraftCatalog,
  baseId: string,
  ids: readonly string[],
  values: unknown,
  alternatives: readonly CraftTargetAlternative[],
  minimumTargetCount?: number,
  runtime?: { state: CraftState | undefined },
): CraftResult<CraftTargetValues[]> {
  const targets = validateCraftTargets(catalog, baseId, ids, minimumTargetCount)
  if (!targets.ok) return targets
  const accepted = validateCraftTargetAlternatives(
    catalog,
    baseId,
    ids,
    alternatives,
    minimumTargetCount,
  )
  if (!accepted.ok) return accepted
  const acceptedIds = new Set([
    ...targets.value,
    ...accepted.value.flatMap((entry) => entry.modIds),
  ])
  if (!Array.isArray(values) || values.length > 192)
    return { ok: false, error: '数值目标必须是最多 192 项条件的数组。' }
  const seen = new Set<string>()
  const result: CraftTargetValues[] = []
  for (const value of values) {
    if (
      !hasOnlyKeys(value, ['modId', 'bounds', 'basis']) ||
      (Object.hasOwn(value, 'basis') && value.basis !== 'effective') ||
      typeof value.modId !== 'string' ||
      !acceptedIds.has(value.modId) ||
      seen.has(value.modId) ||
      !Array.isArray(value.bounds) ||
      value.bounds.length < 1 ||
      value.bounds.length > 32
    )
      return { ok: false, error: '数值目标必须关联唯一的已选词缀，并包含 1–32 个条件。' }
    const checked = readCraftTargetValue(catalog, baseId, value, runtime)
    if (!checked.ok) return checked
    seen.add(value.modId)
    result.push(checked.value)
  }
  return { ok: true, value: result }
}

function stepPriority(step: CraftAdviceStep): number {
  if (step.currency === 'annulment') return 3
  if (CRAFT_CURRENCY_RULES[step.currency].base === 'chaos') return 2
  if (step.clearsAll) return 1
  return 0
}

export function analyzeCraftTargets(
  catalog: CraftCatalog,
  state: CraftState,
  ids: readonly string[],
  targetValues: readonly CraftTargetValues[] = [],
  alternatives: readonly CraftTargetAlternative[] = [],
  omen?: CraftOmen,
  implicitValues: readonly CraftImplicitTargetValues[] = [],
  fracturedTargetId?: string,
  minimumTargetCount?: number,
): CraftResult<CraftAdvice> {
  if (omen !== undefined && !isCraftOmen(omen))
    return { ok: false, error: '预兆必须是当前支持的制作配置。' }
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const validated = validateCraftTargets(
    catalog,
    state.baseId,
    ids,
    minimumTargetCount,
    fracturedTargetId,
  )
  if (!validated.ok) return validated
  const values = validateCraftTargetValues(
    catalog,
    state.baseId,
    validated.value,
    targetValues,
    alternatives,
    state,
    minimumTargetCount,
  )
  if (!values.ok) return values
  if (fracturedTargetId !== undefined) {
    const fracture = validateCraftFractureTarget(
      catalog,
      validated.value,
      alternatives,
      fracturedTargetId,
    )
    if (!fracture.ok) return fracture
  }
  const current = checked.value
  const implicitAnalysis = analyzeCraftImplicitTargets(catalog, current, implicitValues)
  if (!implicitAnalysis.ok) return implicitAnalysis
  const implicitFields = implicitValues.length ? { implicitTargets: implicitAnalysis.value } : {}
  const base = catalog.bases.find((entry) => entry.id === current.baseId)
  if (base === undefined) return { ok: false, error: '当前基底不在制作目录中。' }
  const byId = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  const existing = current.affixes.flatMap((affix) => {
    const mod = byId.get(affix.modId)
    return mod === undefined ? [] : [mod]
  })
  const existingIds = new Set(existing.map((mod) => mod.id))
  const groups = existing.map((mod) => mod.group)
  const pool = new Set(
    inspectModPool(
      base,
      catalog.modifiers,
      current.itemLevel,
      groups,
      existing.flatMap((mod) => mod.addsTags),
    ).map(({ mod }) => mod.id),
  )
  const candidates = new Set(craftCandidates(catalog, current).map((mod) => mod.id))
  const staticPools = targetPools(catalog, state.baseId)
  const fractureMemberIds = new Set([
    fracturedTargetId,
    ...(alternatives.find((entry) => entry.targetModId === fracturedTargetId)?.modIds ?? []),
  ])
  const inspectTarget = (modId: string, fractureRequired = false): CraftTargetStatus => {
    const present = existingIds.has(modId)
    const reasons: string[] = []
    const mod = byId.get(modId)
    const goal = values.value.find((entry) => entry.modId === modId)
    const instances = inspectCraftTargetInstances(catalog, current, modId, goal, fractureRequired)
    const selected = instances.find((entry) => entry.matched) ?? instances[0]
    const affix = selected?.affix
    const fractureReasons: string[] = []
    const fracture = fractureRequired
      ? { fracture: { required: true as const, matched: affix?.fractured === true } }
      : {}
    if (fractureRequired && !affix?.fractured) {
      if (current.affixes.some((entry) => entry.fractured && !fractureMemberIds.has(entry.modId)))
        fractureReasons.push('当前装备已破裂其他组；一件装备只能有一组破裂属性。')
      else if (affix?.desecrated)
        fractureReasons.push('此普通目标当前带亵渎标记，当前状态不能破裂。')
      else fractureReasons.push('此目标要求破裂，当前尚未锁定。')
    }
    const bounds = goal?.bounds ?? []
    const numeric = bounds.map((bound) => {
      const interval = selected?.actual?.[bound.index] ?? null
      const value = interval && interval.min === interval.max ? interval.min : null
      const matched = present && matchesTargetInterval(interval, bound)
      if (present && !matched) {
        if (!interval) reasons.push(`第 ${bound.index + 1} 个实际数值未知，无法判断条件是否达成。`)
        else {
          const displayed =
            interval.min === interval.max ? String(interval.min) : `${interval.min}–${interval.max}`
          if (bound.min !== undefined && interval.min < bound.min)
            reasons.push(`第 ${bound.index + 1} 个实际数值 ${displayed} 低于下限 ${bound.min}。`)
          if (bound.max !== undefined && interval.max > bound.max)
            reasons.push(`第 ${bound.index + 1} 个实际数值 ${displayed} 高于上限 ${bound.max}。`)
        }
      }
      return {
        ...bound,
        actual: value,
        matched,
        ...(interval && interval.min !== interval.max ? { actualRange: interval } : {}),
      }
    })
    if (
      mod &&
      numeric.some((entry) => !entry.matched) &&
      minimumCraftTargetRolls(catalog, current, mod, goal, affix?.lines) === null
    )
      reasons.push('当前品质与基础范围或显示网格无法达到该数值条件。')
    if (affix?.fractured && numeric.some((entry) => !entry.matched))
      reasons.push('破裂属性已锁定，不能通过神圣重掷或移除重造达到数值条件。')
    if (!present && mod !== undefined) {
      if (
        staticPools.genesis.has(modId) &&
        !staticPools.ordinary.has(modId) &&
        !staticPools.essence.has(modId) &&
        !staticPools.liquid.has(modId)
      )
        return {
          modId,
          present: false,
          matched: false,
          numeric,
          ...fracture,
          reasons: [
            ...reasons,
            ...fractureReasons,
            '此 Genesis Tree 专属目标尚不支持新增；可导入已有属性后保留或调整数值。',
          ],
        }
      const liquidOnly = !staticPools.ordinary.has(modId) && staticPools.liquid.has(modId)
      const essenceOnly = !staticPools.ordinary.has(modId) && staticPools.essence.has(modId)
      if (mod.level > current.itemLevel)
        reasons.push(
          essenceOnly || liquidOnly
            ? `该${liquidOnly ? '液态情感' : '精华'}目标在当前低物等装备上的交互尚未验证，暂不支持演练。`
            : `需要物品等级 ${mod.level}，当前为 ${current.itemLevel}。`,
        )
      const lockedConflict = current.affixes.some((affix) => {
        const entry = byId.get(affix.modId)
        return affix.fractured && entry !== undefined && craftModsConflict(entry, mod)
      })
      if (groups.includes(mod.group))
        reasons.push(
          lockedConflict
            ? '当前装备已有同组破裂词缀，无法通过移除腾出目标位置。'
            : '当前装备已有同组词缀，需要先移除才能选择该精确档位。',
        )
      else if (existing.some((entry) => craftModsConflict(entry, mod)))
        reasons.push(
          lockedConflict
            ? '当前装备已有互斥的破裂词缀，无法通过移除腾出目标位置。'
            : '当前装备已有互斥的技能等级词缀，需要先移除冲突词缀。',
        )
      if (mod.desecratedOnly) {
        reasons.push('此目标需要骨骼亵渎与揭示，普通通货不能生成。')
        if (current.rarity !== 'rare') reasons.push('请先将装备提升为稀有。')
        if (existing.filter((entry) => entry.kind === mod.kind).length >= 3)
          reasons.push('目标所在前后缀位置已满，需要通过移除腾出亵渎占位。')
        if (current.affixes.some((affix) => affix.desecrated))
          reasons.push('唯一亵渎位置已占用，需先移除已有亵渎词缀。')
      }
      const pendingLiquid =
        current.pendingDesecration &&
        !current.pendingDesecration.options &&
        staticPools.liquid.has(modId)
      if (current.pendingDesecration && !pendingLiquid) reasons.push(PENDING_DESECRATION_MESSAGE)
      if (pendingLiquid && !liquidOnly)
        reasons.push('未揭示阶段的此目标使用对应液态情感演练，普通通货仍需先揭示。')
      else if (liquidOnly) reasons.push('此目标需要对应液态情感的保证属性，普通通货不能生成。')
      else if (essenceOnly) reasons.push('此目标需要对应精华的保证属性，普通通货不能生成。')
      else if (!mod.desecratedOnly && !pool.has(modId))
        reasons.push('当前词缀产生的动态标签阻止生成此目标。')
      if (reasons.length === 0 && !candidates.has(modId)) {
        reasons.push(
          current.rarity === 'normal'
            ? '普通装备需先使用通货提升稀有度。'
            : `当前${mod.kind === 'prefix' ? '前缀' : '后缀'}位置已满，需要${current.rarity === 'magic' ? '提升稀有度或' : ''}先移除词缀。`,
        )
      }
      if (bounds.length > 0) reasons.push('当前装备尚未包含此精确词缀，数值条件未达成。')
    }
    return {
      modId,
      present,
      matched: selected?.matched === true,
      ...(selected?.matched && affix?.affixId !== undefined
        ? { matchedAffixId: affix.affixId }
        : {}),
      ...fracture,
      numeric,
      reasons: [...reasons, ...fractureReasons],
    }
  }
  const targets: CraftAdvice['targets'] = validated.value.map((modId) => {
    const fractureRequired = modId === fracturedTargetId
    const primary = inspectTarget(modId, fractureRequired)
    const accepted = alternatives.find((entry) => entry.targetModId === modId)
    if (accepted === undefined) return primary
    const members = [primary, ...accepted.modIds.map((id) => inspectTarget(id, fractureRequired))]
    const matchedAffixId = members.find((member) => member.matched)?.matchedAffixId
    return {
      ...primary,
      present: members.some((member) => member.present),
      matched: members.some((member) => member.matched),
      ...(matchedAffixId === undefined ? {} : { matchedAffixId }),
      ...(fractureRequired
        ? {
            reasons: members.find((member) => member.present)?.reasons ?? primary.reasons,
            fracture: {
              required: true as const,
              matched: members.some((member) => member.fracture?.matched),
            },
          }
        : {}),
      alternatives: members,
    }
  })
  if (current.pendingDesecration)
    return { ok: true, value: { targets, steps: [], ...implicitFields } }
  if (
    craftTargetsSatisfied(
      { targets, steps: [], ...implicitFields },
      minimumTargetCount,
      fracturedTargetId,
    )
  )
    return { ok: true, value: { targets, steps: [], ...implicitFields } }
  const missing = targets
    .filter((target) => !target.present)
    .flatMap((target) => target.alternatives ?? [target])
    .map((target) => target.modId)
  // 组内任一候选能直接添加，就无需为同组其他档位先剥离。
  const directlyAvailable = new Set(
    targets
      .filter((target) => !target.present)
      .flatMap((target) => {
        const members = target.alternatives ?? [target]
        return members.some((member) => candidates.has(member.modId))
          ? members.map((member) => member.modId)
          : []
      }),
  )
  const presentTargets = targets
    .flatMap((target) => target.alternatives ?? [target])
    .filter((target) => target.present)
  const presentIds = presentTargets.map((target) => target.modId)
  const steps: CraftAdviceStep[] = []
  const numericTargets = presentTargets.filter(
    (target) =>
      target.numeric.length > 0 &&
      current.affixes.some((affix) => affix.modId === target.modId && !affix.fractured),
  )
  const unmetNumericIds = numericTargets
    .filter((target) => target.numeric.some((bound) => !bound.matched))
    .filter((target) => {
      if (minimumTargetCount === undefined || minimumTargetCount === ids.length) return true
      const mod = byId.get(target.modId)
      return (
        mod !== undefined &&
        current.affixes.some(
          (affix) =>
            affix.modId === target.modId &&
            !affix.fractured &&
            minimumCraftTargetRolls(
              catalog,
              current,
              mod,
              values.value.find((value) => value.modId === target.modId),
              affix.lines,
            ) !== null,
        )
      )
    })
    .map((target) => target.modId)
  const unmetImplicit = implicitAnalysis.value
    .filter((target) => !target.matched)
    .map((target) => target.lineIndex)
  const implicitRolls = implicitValues.length
    ? implicitTargetRolls(catalog, current, implicitValues)
    : null
  const implicitCandidates = implicitValues.length
    ? craftImplicitTargetCandidates(catalog, current)
    : null
  const canPreserveImplicit =
    implicitRolls === null ||
    implicitRolls.ok ||
    (omen !== 'blessed' &&
      unmetNumericIds.length > 0 &&
      implicitTargetRolls(
        catalog,
        current,
        implicitValues.filter((value) =>
          implicitAnalysis.value.some(
            (target) => target.lineIndex === value.lineIndex && target.matched,
          ),
        ),
      ).ok)
  const explicitRollsPossible = current.affixes.every((affix) => {
    if (affix.fractured) return true
    const mod = byId.get(affix.modId)
    return (
      (mod !== undefined &&
        minimumCraftTargetRolls(
          catalog,
          current,
          mod,
          values.value.find((value) => value.modId === affix.modId),
          affix.lines,
        ) !== null) ||
      (mod !== undefined &&
        minimumTargetCount !== undefined &&
        minimumTargetCount < ids.length &&
        !fractureMemberIds.has(mod.id) &&
        minimumCraftTargetRolls(catalog, current, mod, undefined, affix.lines) !== null)
    )
  })
  if (
    (omen === undefined || omen === 'blessed') &&
    ((omen !== 'blessed' && unmetNumericIds.length > 0) || unmetImplicit.length > 0) &&
    canPreserveImplicit &&
    (omen === 'blessed' || explicitRollsPossible) &&
    prepareCraftOperation(catalog, current, 'divine', undefined, omen).ok
  ) {
    steps.push({
      currency: 'divine',
      ...(omen ? { omen } : {}),
      targetModIds: omen === 'blessed' ? [] : unmetNumericIds,
      rerolledTargetIds: omen === 'blessed' ? [] : numericTargets.map((target) => target.modId),
      lostTargetIds: [],
      randomRemovalRisk: false,
      clearsAll: false,
      remainingChoices: 0,
      ...(implicitValues.length
        ? {
            targetImplicitLineIndexes: implicitRolls?.ok ? unmetImplicit : [],
            rerolledImplicitLineIndexes: implicitAnalysis.value
              .filter(
                (target) =>
                  implicitCandidates?.ok &&
                  implicitCandidates.value.some(
                    (candidate) => candidate.lineIndex === target.lineIndex && candidate.rerollable,
                  ),
              )
              .map((target) => target.lineIndex),
          }
        : {}),
    })
  }
  for (const currency of Object.keys(CRAFT_CURRENCY_LABELS) as CraftCurrency[]) {
    // 神圣已单独分析；其余步骤只推进尚无已接受档位的目标组。
    if (currency === 'divine' || craftOmenError(omen, currency) !== null) continue
    const randomRemovalRisk =
      CRAFT_CURRENCY_RULES[currency].base === 'chaos' || currency === 'annulment'
    const removable = randomRemovalRisk
      ? removableCraftAffixes(catalog, current, currency as RemovalCraftCurrency, omen)
      : null
    const removals = removable === null ? [undefined] : removable.ok ? removable.value : []
    for (const removed of removals) {
      const selector =
        removed === undefined
          ? undefined
          : {
              modId: removed.modId,
              ...(removed.affixId === undefined ? {} : { affixId: removed.affixId }),
            }
      const prepared = prepareCraftOperation(catalog, current, currency, selector, omen)
      if (!prepared.ok) continue
      let next = prepared.value.state
      if (currency === 'annulment') {
        // 剥离本身不添加词缀；只在下一次增幅/崇高能选择目标时提示腾出位置。
        const followup = prepareCraftOperation(
          catalog,
          next,
          next.rarity === 'magic' ? 'augmentation' : 'exalted',
        )
        if (!followup.ok) continue
        next = followup.value.state
      }
      const available = new Set(
        craftCandidates(
          catalog,
          next,
          currency === 'annulment'
            ? next.rarity === 'magic'
              ? 'augmentation'
              : 'exalted'
            : currency,
          currency === 'annulment' ? undefined : omen,
        ).map((mod) => mod.id),
      )
      // 剥离只提示真正解除阻碍的目标，避免为本来能直接添加的目标先删词缀。
      const targetModIds = missing.filter((id) => {
        if (!available.has(id) || (currency === 'annulment' && directlyAvailable.has(id)))
          return false
        const mod = byId.get(id)
        return (
          mod !== undefined &&
          minimumCraftTargetRolls(
            catalog,
            next,
            mod,
            values.value.find((goal) => goal.modId === id),
          ) !== null
        )
      })
      if (targetModIds.length === 0) continue
      const lost = new Set(
        lostCraftTargetIds(
          catalog,
          current,
          prepared.value.state,
          validated.value,
          validated.value.map((id) => [
            id,
            ...(alternatives.find((entry) => entry.targetModId === id)?.modIds ?? []),
          ]),
          values.value,
          fracturedTargetId,
        ),
      )
      const lostTargetIds = presentIds.filter((id) => lost.has(id))
      const qualityChanged = current.catalyst?.quality !== prepared.value.state.catalyst?.quality
      const afterImplicit = qualityChanged
        ? analyzeCraftImplicitTargets(catalog, next, implicitValues)
        : null
      const lostImplicitLineIndexes =
        qualityChanged && implicitAnalysis.ok
          ? implicitAnalysis.value
              .filter(
                (target) =>
                  target.matched &&
                  (!afterImplicit?.ok ||
                    !afterImplicit.value.some(
                      (entry) => entry.lineIndex === target.lineIndex && entry.matched,
                    )),
              )
              .map((target) => target.lineIndex)
          : []
      steps.push({
        currency,
        ...(omen === undefined ? {} : { omen }),
        ...(removed === undefined ? {} : { removeModId: removed.modId }),
        ...(removed?.affixId === undefined ? {} : { removeAffixId: removed.affixId }),
        targetModIds,
        lostTargetIds,
        ...(lostImplicitLineIndexes.length > 0 ? { lostImplicitLineIndexes } : {}),
        randomRemovalRisk:
          randomRemovalRisk &&
          (!omen ||
            (!CRAFT_OMEN_RULES[omen].lowestLevel && omen !== 'light') ||
            (removable?.ok === true && removable.value.length > 1)),
        clearsAll: currency === 'alchemy',
        remainingChoices: prepared.value.count,
      })
    }
  }
  steps.sort(
    (a, b) => a.lostTargetIds.length - b.lostTargetIds.length || stepPriority(a) - stepPriority(b),
  )
  return { ok: true, value: { targets, steps, ...implicitFields } }
}
