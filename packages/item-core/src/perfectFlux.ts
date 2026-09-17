import { DESTROYED_ITEM_MESSAGE } from './architect'
import { PENDING_DESECRATION_MESSAGE } from './boneRules'
import type { CraftCatalog } from './catalog'
import { CORRUPTED_CRAFT_MESSAGE } from './corruptionRules'
import { isPlainProjectJSON } from './craftProjectJSON'
import {
  matchesGrantedSkillImplicitLines,
  readBaseGrantedSkills,
  resolveGrantedSkill,
} from './grantedSkills'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { socketEffects } from './sockets'

export interface PerfectFluxCraftOperation {
  kind: 'perfect-flux'
  previousMaxLevel: number
}
export interface InspectedPerfectFluxCraft {
  skillName: string
  observedLine: string
  minimumPreviousMaxLevel: number
  previousMaxLevel: number | null
}
export type PreparedPerfectFluxCraft = Omit<InspectedPerfectFluxCraft, 'previousMaxLevel'> & {
  previousMaxLevel: number
}
const fail = (error: string): CraftResult<never> => ({ ok: false, error })

/** 只核对技能形态；供状态校验复用，不递归调用状态工厂或施用资格。 */
export function readSingleGrantedSkill(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<InspectedPerfectFluxCraft> {
  const base = catalog.bases.find((base) => base.id === state.baseId)
  if (!base || !['Wand', 'Staff', 'Sceptre'].includes(base.type))
    return fail('装备技能制作目前只支持普通 Wand / Staff / Sceptre 的单一带等级固有技能。')
  const patterns = base.implicit?.split('\n') ?? []
  const skills = readBaseGrantedSkills(base)
  const skill = skills[0]
  const grantsSkill = (line: string) => /\bGrants?\b.*\bSkills?\b/i.test(line)
  if (skills.length !== 1 || !skill || patterns.filter(grantsSkill).length !== 1)
    return fail('装备技能制作需要唯一的带等级固有技能；无等级或额外授予技能暂不支持。')
  if (skill.maxLevel !== 20 || !Number.isSafeInteger(skill.minLevel) || skill.minLevel < 1)
    return fail('装备技能制作要求技能目录范围的上限为 20 级。')
  const lines = state.implicitLines ?? patterns
  const observed = lines.filter(grantsSkill)
  if (observed.length !== 1 || !matchesGrantedSkillImplicitLines(patterns, lines))
    return fail('授予技能观察行与基底未完整对应，不能制作。')
  const additional = [
    ...state.affixes.flatMap((affix) => affix.lines),
    ...(state.corruption?.lines ?? []),
    ...(state.secondCorruption?.lines ?? []),
    ...socketEffects(catalog, state).flatMap(({ augment }) => augment.lines),
  ]
  if (additional.some(grantsSkill)) return fail('装备包含额外授予技能，当前作用范围尚未支持。')
  const observedLine = observed[0]
  if (observedLine === undefined) return fail('缺少授予技能观察行。')
  const parsed = resolveGrantedSkill(observedLine, [], 'en')
  return {
    ok: true,
    value: {
      skillName: skill.name,
      observedLine,
      minimumPreviousMaxLevel: Math.max(skill.minLevel, parsed.displayedLevel ?? skill.minLevel),
      previousMaxLevel: parsed.maxLevel,
    },
  }
}

/** 结果字段属于装备状态，不意味着当前还能再次施用材料。 */
export function grantedSkillLevelStateError(
  catalog: CraftCatalog,
  state: CraftState,
): string | null {
  if (!('grantedSkillLevel' in state)) return null
  const descriptor = Object.getOwnPropertyDescriptor(state, 'grantedSkillLevel')
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') || descriptor.value !== 20)
    return '装备技能升级结果只能是自有数据字段中的明确 20 或缺省。'
  const skill = readSingleGrantedSkill(catalog, state)
  return skill.ok ? null : skill.error
}

export function inspectPerfectFluxCraft(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<InspectedPerfectFluxCraft> {
  if (Object.hasOwn(state, 'destroyed')) return fail(DESTROYED_ITEM_MESSAGE)
  if (state.corrupted) return fail(CORRUPTED_CRAFT_MESSAGE)
  if (state.pendingDesecration) return fail(PENDING_DESECRATION_MESSAGE)
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const result = readSingleGrantedSkill(catalog, checked.value)
  if (!result.ok) return result
  if (
    state.grantedSkillLevel === 20 ||
    result.value.previousMaxLevel === 20 ||
    result.value.minimumPreviousMaxLevel >= 20
  )
    return fail('装备技能已升级或已观察到 20 级，不能再次消费完美溶剂。')
  return result
}

export function preparePerfectFluxCraft(
  catalog: CraftCatalog,
  state: CraftState,
  previousMaxLevel: number,
): CraftResult<PreparedPerfectFluxCraft> {
  const result = inspectPerfectFluxCraft(catalog, state)
  if (!result.ok) return result
  if (
    !Number.isSafeInteger(previousMaxLevel) ||
    previousMaxLevel < result.value.minimumPreviousMaxLevel ||
    previousMaxLevel >= 20
  )
    return fail(
      `请声明操作前装备最高等级，须为 ${result.value.minimumPreviousMaxLevel}–19 的整数。`,
    )
  if (result.value.previousMaxLevel !== null && result.value.previousMaxLevel !== previousMaxLevel)
    return fail('操作前最高等级声明必须与原文的最高等级一致。')
  return { ok: true, value: { ...result.value, previousMaxLevel } }
}

export function applyPerfectFluxCraft(
  catalog: CraftCatalog,
  state: CraftState,
  operation: PerfectFluxCraftOperation,
): CraftResult<CraftState> {
  if (!isPerfectFluxCraftOperation(operation)) return fail('完美溶剂步骤字段无效。')
  const prepared = preparePerfectFluxCraft(catalog, state, operation.previousMaxLevel)
  return prepared.ok ? createCraftState(catalog, { ...state, grantedSkillLevel: 20 }) : prepared
}

/** 只读装备最高等级，不从角色显示级反推上限或材料历史。 */
export function readCraftGrantedSkillLevel(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<{ name: string; level: number | null }> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const skill = readSingleGrantedSkill(catalog, checked.value)
  return skill.ok
    ? {
        ok: true,
        value: {
          name: skill.value.skillName,
          level: state.grantedSkillLevel ?? skill.value.previousMaxLevel,
        },
      }
    : skill
}

export function isPerfectFluxCraftOperation(value: unknown): value is PerfectFluxCraftOperation {
  try {
    if (!isPlainProjectJSON(value)) return false
  } catch {
    return false
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  return (
    Object.keys(entry).length === 2 &&
    Object.hasOwn(entry, 'kind') &&
    Object.hasOwn(entry, 'previousMaxLevel') &&
    entry.kind === 'perfect-flux' &&
    typeof entry.previousMaxLevel === 'number' &&
    Number.isSafeInteger(entry.previousMaxLevel) &&
    entry.previousMaxLevel >= 1 &&
    entry.previousMaxLevel < 20
  )
}
