import type { CatalogBase } from './catalog'
import { readBaseGrantedSkills } from './grantedSkills'

export interface BaseSkillVariants {
  commonLines: string[]
  variants: { index: number; name: string; line: string; minLevel: number; maxLevel: number }[]
}

/** 仅解释目录候选，不生成制作状态，也不推导容量或技能生成概率。 */
export function readBaseSkillVariants(base: CatalogBase): BaseSkillVariants | null {
  const names = base.variantList
  if (!names?.length || new Set(names).size !== names.length || !base.implicit) return null
  const commonLines: string[] = []
  const variants = new Map<number, BaseSkillVariants['variants'][number]>()
  for (const raw of base.implicit.split('\n')) {
    const match = /^\{variant:([1-9]\d*)\}(.+)$/.exec(raw)
    if (!match) {
      if (
        raw.includes('{') ||
        raw.includes('}') ||
        !raw.trim() ||
        raw.trim().startsWith('Grants Skill:')
      )
        return null
      commonLines.push(raw)
      continue
    }
    const index = Number(match[1])
    const line = match[2] ?? ''
    const skill = readBaseGrantedSkills({ ...base, implicit: line })[0]
    if (!skill || variants.has(index) || names[index - 1] !== skill.name) return null
    variants.set(index, {
      index,
      name: skill.name,
      line,
      minLevel: skill.minLevel,
      maxLevel: skill.maxLevel,
    })
  }
  if (variants.size !== names.length) return null
  return { commonLines, variants: [...variants.values()].sort((a, b) => a.index - b.index) }
}
