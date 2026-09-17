import { readBaseSkillVariants } from './baseSkillVariants'
import type { CraftCatalog } from './catalog'
import {
  matchesGrantedSkillImplicitLines,
  readBaseGrantedSkills,
  resolveGrantedSkill,
} from './grantedSkills'
import type { CraftResult, CraftState } from './rehearsal'
import { isSkillVariantAmulet, resolveSkillVariantImplicitPatterns } from './skillVariantAmulets'
import { socketEffects } from './sockets'

const fail = (error: string): CraftResult<never> => ({ ok: false, error })

/** 只核对技能形态；供状态校验复用，不递归调用状态工厂或施用资格。 */
export function readSingleGrantedSkillIdentity(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<{
  skillName: string
  lineIndex: number
  observedLine: string
  minimumPreviousMaxLevel: number
  previousMaxLevel: number | null
}> {
  const base = catalog.bases.find((base) => base.id === state.baseId)
  if (!base) return fail('装备技能制作基底不在目录中。')
  const amulet = isSkillVariantAmulet(base)
  if (!amulet && !['Wand', 'Staff', 'Sceptre'].includes(base.type))
    return fail('装备技能制作只支持普通 Wand / Staff / Sceptre 或已选定单技能的三类技能项链。')
  const variants = amulet ? readBaseSkillVariants(base) : null
  const resolved = amulet
    ? resolveSkillVariantImplicitPatterns(base, state.implicitLines ?? [])
    : { ok: true as const, value: base.implicit?.split('\n') ?? [] }
  if (!resolved.ok) return resolved
  const patterns = resolved.value
  const skills = readBaseGrantedSkills({ ...base, implicit: patterns.join('\n') })
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
      lineIndex: variants ? variants.commonLines.length : skill.lineIndex,
      observedLine,
      minimumPreviousMaxLevel: Math.max(skill.minLevel, parsed.displayedLevel ?? skill.minLevel),
      previousMaxLevel: parsed.maxLevel,
    },
  }
}
