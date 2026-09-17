import { readBaseSkillVariants } from './baseSkillVariants'
import type { CatalogBase } from './catalog'
import { matchesGrantedSkillImplicitLines } from './grantedSkills'
import type { CraftResult } from './rehearsal'

const RULES: Record<string, { count: number; common: string[] }> = {
  'Lament Amulet': { count: 37, common: ['-1 Prefix Modifier allowed'] },
  'Portent Amulet': { count: 7, common: ['-1 Suffix Modifier allowed'] },
  'Absent Amulet': {
    count: 7,
    common: ['-1 Prefix Modifier allowed', '-1 Suffix Modifier allowed'],
  },
}
const ERROR = '技能变体项链必须包含完整共同固有属性和唯一合法授予技能。'

/** 仅授权已核对的三种目录身份，不能推广到其他内部变体。 */
export function isSkillVariantAmulet(base: CatalogBase): boolean {
  const rule = RULES[base.id]
  if (
    !rule ||
    base.name !== base.id ||
    base.type !== 'Amulet' ||
    base.hidden ||
    base.runeforged ||
    base.grantedSkillsHaveNoReservation !== true ||
    base.charmLimit !== undefined ||
    base.flask !== undefined ||
    base.charm !== undefined ||
    base.spirit !== undefined ||
    base.subType !== undefined ||
    base.variant !== undefined
  )
    return false
  const parsed = readBaseSkillVariants(base)
  return (
    parsed !== null &&
    parsed.variants.length === rule.count &&
    JSON.stringify(parsed.commonLines) === JSON.stringify(rule.common) &&
    parsed.variants.every((skill) => skill.minLevel === 1 && skill.maxLevel === 20)
  )
}

export function buildInitialSkillVariantLines(
  base: CatalogBase,
  index: number,
  displayedLevel?: number,
): CraftResult<string[]> {
  const parsed = isSkillVariantAmulet(base) ? readBaseSkillVariants(base) : null
  const skill = parsed?.variants.find((entry) => entry.index === index)
  if (
    !parsed ||
    !skill ||
    (displayedLevel !== undefined &&
      (!Number.isInteger(displayedLevel) ||
        displayedLevel < skill.minLevel ||
        displayedLevel > skill.maxLevel))
  )
    return { ok: false, error: ERROR }
  return {
    ok: true,
    value: [
      ...parsed.commonLines,
      displayedLevel === undefined
        ? skill.line
        : `Grants Skill: Level ${displayedLevel} ${skill.name}`,
    ],
  }
}

/** 按实际行序投影，保留技能声明而不引入第二份状态。 */
export function resolveSkillVariantImplicitPatterns(
  base: CatalogBase,
  lines: readonly string[],
): CraftResult<string[]> {
  const parsed = isSkillVariantAmulet(base) ? readBaseSkillVariants(base) : null
  if (!parsed || !Array.isArray(lines) || !lines.every((line) => typeof line === 'string'))
    return { ok: false, error: ERROR }
  const candidates = parsed.variants.filter((skill) =>
    matchesGrantedSkillImplicitLines([...parsed.commonLines, skill.line], lines),
  )
  const candidate = candidates[0]
  if (candidates.length !== 1 || !candidate) return { ok: false, error: ERROR }
  const remaining = [...parsed.commonLines, candidate.line]
  const patterns: string[] = []
  for (const line of lines) {
    const index = remaining.findIndex((pattern) =>
      matchesGrantedSkillImplicitLines([pattern], [line]),
    )
    if (index < 0) return { ok: false, error: ERROR }
    const pattern = remaining.splice(index, 1)[0]
    if (pattern === undefined) return { ok: false, error: ERROR }
    patterns.push(pattern)
  }
  return { ok: true, value: patterns }
}
