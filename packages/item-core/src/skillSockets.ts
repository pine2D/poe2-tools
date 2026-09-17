import { DESTROYED_ITEM_MESSAGE } from './architect'
import { readBaseSkillVariants } from './baseSkillVariants'
import { PENDING_DESECRATION_MESSAGE } from './boneRules'
import type { CraftCatalog } from './catalog'
import { CORRUPTED_CRAFT_MESSAGE } from './corruptionRules'
import { isPlainProjectJSON } from './craftProjectJSON'
import { matchesGrantedSkillImplicitLines, readBaseGrantedSkills } from './grantedSkills'
import { readSingleGrantedSkill } from './perfectFlux'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { isSkillVariantAmulet, resolveSkillVariantImplicitPatterns } from './skillVariantAmulets'
import { socketEffects } from './sockets'

export const SKILL_SOCKET_TIERS = {
  lesser: { count: 3, name: "Lesser Jeweller's Orb" },
  greater: { count: 4, name: "Greater Jeweller's Orb" },
  perfect: { count: 5, name: "Perfect Jeweller's Orb" },
} as const
export type SkillSocketTier = keyof typeof SKILL_SOCKET_TIERS
export interface SkillSocketsCraftOperation {
  kind: 'skill-sockets'
  tier: SkillSocketTier
  previousSockets: 2 | 3 | 4
}
const fail = (error: string): CraftResult<never> => ({ ok: false, error })

/** 辅助孔专用只读资格；不扩展完美溶剂或最高等级声明。 */
export function readSingleGrantedSkillForSockets(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<{ skillName: string; lineIndex: number; observedLine: string }> {
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base || !isSkillVariantAmulet(base)) {
    const skill = readSingleGrantedSkill(catalog, state)
    if (!skill.ok) return skill
    const lineIndex = base ? readBaseGrantedSkills(base)[0]?.lineIndex : undefined
    return lineIndex === undefined
      ? fail('缺少授予技能目录槽位。')
      : {
          ok: true,
          value: {
            skillName: skill.value.skillName,
            observedLine: skill.value.observedLine,
            lineIndex,
          },
        }
  }
  const parsed = readBaseSkillVariants(base)
  const lines = state.implicitLines ?? []
  const resolved = resolveSkillVariantImplicitPatterns(base, lines)
  if (!resolved.ok) return resolved
  const skill = parsed?.variants.find((entry) =>
    matchesGrantedSkillImplicitLines([...parsed.commonLines, entry.line], lines),
  )
  const observedLine = lines.find((line) => /^Grants Skill:/.test(line))
  if (!parsed || !skill || observedLine === undefined)
    return fail('辅助孔需要唯一选定且完整对应的项链技能。')
  const additional = [
    ...state.affixes.flatMap((affix) => affix.lines),
    ...(state.corruption?.lines ?? []),
    ...(state.secondCorruption?.lines ?? []),
    ...socketEffects(catalog, state).flatMap(({ augment }) => augment.lines),
  ]
  if (additional.some((line) => /\bGrants?\b.*\bSkills?\b/i.test(line)))
    return fail('装备包含额外授予技能，当前作用范围尚未支持。')
  return {
    ok: true,
    value: { skillName: skill.name, lineIndex: parsed.commonLines.length, observedLine },
  }
}

/** 声明和结果均须对应唯一装备技能，不从符文孔或等级推断。 */
export function grantedSkillSocketsStateError(
  catalog: CraftCatalog,
  state: CraftState,
): string | null {
  let present = false
  for (const key of ['declaredSkillSockets', 'grantedSkillSockets'] as const) {
    if (!(key in state)) continue
    present = true
    const descriptor = Object.getOwnPropertyDescriptor(state, key)
    if (
      !descriptor?.enumerable ||
      !Object.hasOwn(descriptor, 'value') ||
      !(key === 'declaredSkillSockets' ? [2, 3, 4, 5] : [3, 4, 5]).includes(descriptor.value)
    )
      return '装备技能辅助孔声明或结果必须是自有可枚举数据字段中的合法整数。'
  }
  if (!present) return null
  if (
    state.declaredSkillSockets !== undefined &&
    state.grantedSkillSockets !== undefined &&
    state.grantedSkillSockets < state.declaredSkillSockets
  )
    return '装备技能辅助孔操作结果不能低于起点声明。'
  const skill = readSingleGrantedSkillForSockets(catalog, state)
  return skill.ok ? null : skill.error
}

/** 仅为新演练起点记录用户观察；不生成制作步骤或原生装备文本。 */
export function declareInitialSkillSockets(
  catalog: CraftCatalog,
  state: CraftState,
  count: number,
): CraftResult<CraftState> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (Object.hasOwn(checked.value, 'grantedSkillSockets'))
    return fail('已有辅助孔操作结果不能改写起点声明，请重新开始演练。')
  return createCraftState(catalog, {
    ...checked.value,
    declaredSkillSockets: count as 2 | 3 | 4 | 5,
  })
}

export function inspectSkillSocketsCraft(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<{ skillName: string; previousSockets: number | null }> {
  if (Object.hasOwn(state, 'destroyed')) return fail(DESTROYED_ITEM_MESSAGE)
  if (state.corrupted) return fail(CORRUPTED_CRAFT_MESSAGE)
  if (state.pendingDesecration) return fail(PENDING_DESECRATION_MESSAGE)
  if (state.sourceText?.split(/\r?\n/).some((line) => line.trim() === 'Sanctified'))
    return fail('Sanctified 装备的辅助孔制作资格尚未支持。')
  const read = readCraftGrantedSkillSockets(catalog, state)
  if (read.ok && read.value.sockets === 5)
    return fail('装备技能已有五个辅助孔，不能再次消费工匠石。')
  return read.ok
    ? { ok: true, value: { skillName: read.value.name, previousSockets: read.value.sockets } }
    : read
}

export function prepareSkillSocketsCraft(
  catalog: CraftCatalog,
  state: CraftState,
  tier: SkillSocketTier,
  previousSockets: number,
): CraftResult<{ skillName: string; previousSockets: 2 | 3 | 4 }> {
  if (!isSkillSocketsCraftOperation({ kind: 'skill-sockets', tier, previousSockets }))
    return fail('请明确声明操作前辅助孔数（2–4），且须低于材料设定的孔数。')
  const inspected = inspectSkillSocketsCraft(catalog, state)
  if (!inspected.ok) return inspected
  if (
    inspected.value.previousSockets !== null &&
    inspected.value.previousSockets !== previousSockets
  )
    return fail('操作前辅助孔声明必须与当前已知孔数一致。')
  return {
    ok: true,
    value: { skillName: inspected.value.skillName, previousSockets: previousSockets as 2 | 3 | 4 },
  }
}

export function applySkillSocketsCraft(
  catalog: CraftCatalog,
  state: CraftState,
  operation: SkillSocketsCraftOperation,
): CraftResult<CraftState> {
  if (!isSkillSocketsCraftOperation(operation)) return fail('辅助孔步骤字段无效。')
  const prepared = prepareSkillSocketsCraft(
    catalog,
    state,
    operation.tier,
    operation.previousSockets,
  )
  return prepared.ok
    ? createCraftState(catalog, {
        ...state,
        grantedSkillSockets: SKILL_SOCKET_TIERS[operation.tier].count,
      })
    : prepared
}

export function readCraftGrantedSkillSockets(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<{ name: string; sockets: number | null }> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const skill = readSingleGrantedSkillForSockets(catalog, checked.value)
  return skill.ok
    ? {
        ok: true,
        value: {
          name: skill.value.skillName,
          sockets: checked.value.grantedSkillSockets ?? checked.value.declaredSkillSockets ?? null,
        },
      }
    : skill
}

export function isSkillSocketsCraftOperation(value: unknown): value is SkillSocketsCraftOperation {
  try {
    if (!isPlainProjectJSON(value)) return false
  } catch {
    return false
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  return (
    Object.keys(entry).length === 3 &&
    Object.hasOwn(entry, 'kind') &&
    Object.hasOwn(entry, 'tier') &&
    Object.hasOwn(entry, 'previousSockets') &&
    entry.kind === 'skill-sockets' &&
    typeof entry.tier === 'string' &&
    Object.hasOwn(SKILL_SOCKET_TIERS, entry.tier) &&
    typeof entry.previousSockets === 'number' &&
    Number.isInteger(entry.previousSockets) &&
    entry.previousSockets >= 2 &&
    entry.previousSockets <= 4 &&
    entry.previousSockets < SKILL_SOCKET_TIERS[entry.tier as SkillSocketTier].count
  )
}
