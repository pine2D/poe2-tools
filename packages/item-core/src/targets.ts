import { buildInitialBeltImplicitLines, isBeltCapacityBase } from './beltImplicits'
import { PENDING_DESECRATION_MESSAGE } from './boneRules'
import {
  type CatalogMod,
  type CraftCatalog,
  hasGenesisModEligibility,
  inspectModPool,
} from './catalog'
import { desecrationSourceHash } from './desecration'
import { essenceSourceHash, inspectEssences, supportedEssenceId } from './essences'
import {
  analyzeCraftImplicitTargets,
  type CraftImplicitTargetStatus,
  type CraftImplicitTargetValues,
  craftImplicitTargetCandidates,
  implicitTargetRolls,
} from './implicitTargets'
import { craftModsConflict } from './modConflicts'
import { inspectNumericLines, readNumericValues } from './numeric'
import { CRAFT_OMEN_RULES, type CraftOmen, isCraftOmen } from './omens'
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
import { minimumTargetRolls } from './targetRolls'

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
  modId: string
  bounds: CraftTargetBound[]
}

export interface CraftAdviceStep {
  targetImplicitLineIndexes?: number[]
  rerolledImplicitLineIndexes?: number[]
  omen?: CraftOmen
  currency: CraftCurrency
  removeModId?: string
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
  modId: string
  present: boolean
  matched: boolean
  numeric: (CraftTargetBound & { actual: number | null; matched: boolean })[]
  reasons: string[]
}

export interface CraftAdvice {
  implicitTargets?: CraftImplicitTargetStatus[]
  targets: (CraftTargetStatus & { alternatives?: CraftTargetStatus[] })[]
  steps: CraftAdviceStep[]
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
  return { ordinary, essence, desecrated, genesis }
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
  const { ordinary, essence, desecrated, genesis } = targetPools(catalog, baseId)
  return catalog.modifiers.filter(
    (mod) =>
      (ordinary.has(mod.id) ||
        essence.has(mod.id) ||
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
): CraftResult<string[]> {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string'))
    return { ok: false, error: '制作目标必须是词缀 ID 字符串数组。' }
  if (ids.length > 6) return { ok: false, error: '制作目标最多包含六组词缀。' }
  if (new Set(ids).size !== ids.length) return { ok: false, error: '制作目标不能包含重复词缀 ID。' }
  const byId = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  const { ordinary, essence, desecrated, genesis } = targetPools(catalog, baseId)
  const affixes: CraftAffix[] = []
  for (const id of ids) {
    const mod = byId.get(id)
    if (mod === undefined) return { ok: false, error: `目标词缀 ${id} 不在制作目录中。` }
    if (mod.desecratedOnly && !desecrated.has(id))
      return { ok: false, error: '专属目标缺少可信亵渎来源或当前基底资格。' }
    const crafted = !mod.desecratedOnly && !ordinary.has(id) && !genesis.has(id) && essence.has(id)
    affixes.push({
      modId: mod.id,
      lines: [...mod.lines],
      ...(crafted ? { crafted: true } : {}),
      ...(mod.desecratedOnly ? { desecrated: true } : {}),
    })
  }
  // 目标按稀有装备容量校验；已有词缀校验不限制生成物等，适用于高物等目标。
  const checked = createCraftState(catalog, {
    baseId,
    itemLevel: 100,
    rarity: 'rare',
    affixes,
    sourceText: null,
    ...targetImplicitLines(catalog, baseId),
  })
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
): CraftResult<CraftTargetAlternative[]> {
  const targets = validateCraftTargets(catalog, baseId, ids)
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
): CraftResult<CraftTargetValues[]> {
  const targets = validateCraftTargets(catalog, baseId, ids)
  if (!targets.ok) return targets
  const accepted = validateCraftTargetAlternatives(catalog, baseId, ids, alternatives)
  if (!accepted.ok) return accepted
  const acceptedIds = new Set([
    ...targets.value,
    ...accepted.value.flatMap((entry) => entry.modIds),
  ])
  if (!Array.isArray(values) || values.length > 192)
    return { ok: false, error: '数值目标必须是最多 192 项条件的数组。' }
  const byId = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  const seen = new Set<string>()
  const result: CraftTargetValues[] = []
  for (const value of values) {
    if (
      !hasOnlyKeys(value, ['modId', 'bounds']) ||
      typeof value.modId !== 'string' ||
      !acceptedIds.has(value.modId) ||
      seen.has(value.modId) ||
      !Array.isArray(value.bounds) ||
      value.bounds.length < 1 ||
      value.bounds.length > 32
    )
      return { ok: false, error: '数值目标必须关联唯一的已选词缀，并包含 1–32 个条件。' }
    const mod = byId.get(value.modId)
    if (mod === undefined) return { ok: false, error: '数值目标词缀不在制作目录中。' }
    const ranges = inspectNumericLines(mod.lines)
    if (!ranges.ok) return ranges
    const indices = new Set<number>()
    const bounds: CraftTargetBound[] = []
    for (const bound of value.bounds) {
      if (
        !hasOnlyKeys(bound, ['index', 'min', 'max']) ||
        typeof bound.index !== 'number' ||
        !Number.isInteger(bound.index) ||
        bound.index < 0 ||
        indices.has(bound.index)
      )
        return { ok: false, error: '数值条件必须使用唯一的非负整数范围索引。' }
      const range = ranges.value[bound.index]
      if (range === undefined) return { ok: false, error: '数值条件索引不在词缀的可识别范围内。' }
      const hasMin = Object.hasOwn(bound, 'min')
      const hasMax = Object.hasOwn(bound, 'max')
      if (!hasMin && !hasMax) return { ok: false, error: '数值条件至少需要一个上限或下限。' }
      const copy: CraftTargetBound = { index: bound.index }
      for (const key of ['min', 'max'] as const) {
        if (!Object.hasOwn(bound, key)) continue
        const threshold = bound[key]
        if (
          typeof threshold !== 'number' ||
          !Number.isFinite(threshold) ||
          threshold < range.min ||
          threshold > range.max
        )
          return { ok: false, error: `数值条件必须是 ${range.min}–${range.max} 内的有限数值。` }
        // 条件是比较阈值，不受演练生成值的显示网格约束。
        copy[key] = threshold
      }
      if (copy.min !== undefined && copy.max !== undefined && copy.min > copy.max)
        return { ok: false, error: '数值条件下限不能大于上限。' }
      indices.add(bound.index)
      bounds.push(copy)
    }
    seen.add(value.modId)
    result.push({ modId: value.modId, bounds })
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
): CraftResult<CraftAdvice> {
  if (omen !== undefined && !isCraftOmen(omen))
    return { ok: false, error: '预兆必须是当前支持的单枚定向预兆。' }
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const validated = validateCraftTargets(catalog, state.baseId, ids)
  if (!validated.ok) return validated
  const values = validateCraftTargetValues(
    catalog,
    state.baseId,
    validated.value,
    targetValues,
    alternatives,
  )
  if (!values.ok) return values
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
  const inspectTarget = (modId: string): CraftTargetStatus => {
    const present = existingIds.has(modId)
    const reasons: string[] = []
    const mod = byId.get(modId)
    const affix = current.affixes.find((entry) => entry.modId === modId)
    const bounds = values.value.find((entry) => entry.modId === modId)?.bounds ?? []
    const actual =
      bounds.length > 0 && mod !== undefined && affix !== undefined
        ? readNumericValues(mod.lines, affix.lines)
        : null
    const numeric = bounds.map((bound) => {
      const value = actual?.ok ? (actual.value[bound.index] ?? null) : null
      const matched =
        present &&
        value !== null &&
        (bound.min === undefined || value >= bound.min) &&
        (bound.max === undefined || value <= bound.max)
      if (present) {
        if (value === null)
          reasons.push(`第 ${bound.index + 1} 个实际数值未知，无法判断条件是否达成。`)
        else if (bound.min !== undefined && value < bound.min)
          reasons.push(`第 ${bound.index + 1} 个实际数值 ${value} 低于下限 ${bound.min}。`)
        else if (bound.max !== undefined && value > bound.max)
          reasons.push(`第 ${bound.index + 1} 个实际数值 ${value} 高于上限 ${bound.max}。`)
      }
      return { ...bound, actual: value, matched }
    })
    if (!present && mod !== undefined) {
      if (
        staticPools.genesis.has(modId) &&
        !staticPools.ordinary.has(modId) &&
        !staticPools.essence.has(modId)
      )
        return {
          modId,
          present: false,
          matched: false,
          numeric,
          reasons: ['此 Genesis Tree 专属目标尚不支持新增；可导入已有属性后保留或调整数值。'],
        }
      const essenceOnly = !staticPools.ordinary.has(modId) && staticPools.essence.has(modId)
      if (mod.level > current.itemLevel)
        reasons.push(
          essenceOnly
            ? '该精华目标在当前低物等装备上的交互尚未验证，暂不支持演练。'
            : `需要物品等级 ${mod.level}，当前为 ${current.itemLevel}。`,
        )
      if (groups.includes(mod.group))
        reasons.push('当前装备已有同组词缀，需要先移除才能选择该精确档位。')
      else if (existing.some((entry) => craftModsConflict(entry, mod)))
        reasons.push('当前装备已有互斥的技能等级词缀，需要先移除冲突词缀。')
      if (mod.desecratedOnly) {
        reasons.push('此目标需要骨骼亵渎与揭示，普通通货不能生成。')
        if (current.rarity !== 'rare') reasons.push('请先将装备提升为稀有。')
        if (existing.filter((entry) => entry.kind === mod.kind).length >= 3)
          reasons.push('目标所在前后缀位置已满，需要通过移除腾出亵渎占位。')
        if (current.affixes.some((affix) => affix.desecrated))
          reasons.push('唯一亵渎位置已占用，需先移除已有亵渎词缀。')
      }
      if (current.pendingDesecration) reasons.push(PENDING_DESECRATION_MESSAGE)
      if (essenceOnly) reasons.push('此目标需要对应精华的保证属性，普通通货不能生成。')
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
      matched: present && numeric.every((entry) => entry.matched),
      numeric,
      reasons,
    }
  }
  const targets: CraftAdvice['targets'] = validated.value.map((modId) => {
    const primary = inspectTarget(modId)
    const accepted = alternatives.find((entry) => entry.targetModId === modId)
    if (accepted === undefined) return primary
    const members = [primary, ...accepted.modIds.map(inspectTarget)]
    return {
      ...primary,
      present: members.some((member) => member.present),
      matched: members.some((member) => member.matched),
      alternatives: members,
    }
  })
  if (current.pendingDesecration)
    return { ok: true, value: { targets, steps: [], ...implicitFields } }
  if (
    targets.every((target) => target.matched) &&
    implicitAnalysis.value.every((target) => target.matched)
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
  const numericTargets = presentTargets.filter((target) => target.numeric.length > 0)
  const unmetNumericIds = numericTargets
    .filter((target) => !target.matched)
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
    (unmetNumericIds.length > 0 &&
      implicitTargetRolls(
        catalog,
        current,
        implicitValues.filter((value) =>
          implicitAnalysis.value.some(
            (target) => target.lineIndex === value.lineIndex && target.matched,
          ),
        ),
      ).ok)
  const explicitRollsPossible =
    !implicitValues.length ||
    current.affixes.every((affix) => {
      const mod = byId.get(affix.modId)
      return (
        mod !== undefined &&
        minimumTargetRolls(
          mod.lines,
          values.value.find((value) => value.modId === affix.modId)?.bounds,
        ) !== null
      )
    })
  if (
    omen === undefined &&
    (unmetNumericIds.length > 0 || unmetImplicit.length > 0) &&
    canPreserveImplicit &&
    explicitRollsPossible &&
    prepareCraftOperation(catalog, current, 'divine').ok
  ) {
    steps.push({
      currency: 'divine',
      targetModIds: unmetNumericIds,
      rerolledTargetIds: numericTargets.map((target) => target.modId),
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
    if (
      currency === 'divine' ||
      (omen !== undefined && CRAFT_OMEN_RULES[omen].currency !== currency)
    )
      continue
    const randomRemovalRisk =
      CRAFT_CURRENCY_RULES[currency].base === 'chaos' || currency === 'annulment'
    const removable = randomRemovalRisk
      ? removableCraftAffixes(catalog, current, currency as RemovalCraftCurrency, omen)
      : null
    const removals =
      removable === null
        ? [undefined]
        : removable.ok
          ? removable.value.map((affix) => affix.modId)
          : []
    for (const removeModId of removals) {
      const prepared = prepareCraftOperation(catalog, current, currency, removeModId, omen)
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
      const targetModIds = missing.filter(
        (id) => available.has(id) && (currency !== 'annulment' || !directlyAvailable.has(id)),
      )
      if (targetModIds.length === 0) continue
      const retained = new Set(prepared.value.state.affixes.map((affix) => affix.modId))
      steps.push({
        currency,
        ...(omen === undefined ? {} : { omen }),
        ...(removeModId === undefined ? {} : { removeModId }),
        targetModIds,
        lostTargetIds: presentIds.filter((id) => !retained.has(id)),
        randomRemovalRisk,
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
