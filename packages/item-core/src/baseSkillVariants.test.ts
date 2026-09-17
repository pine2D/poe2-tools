import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readBaseSkillVariants } from './baseSkillVariants'
import type { CraftCatalog } from './catalog'
import { readBaseGrantedSkills } from './grantedSkills'

const catalog = JSON.parse(
  readFileSync(new URL('../../../data/craft/catalog.json', import.meta.url), 'utf8'),
) as CraftCatalog
const base = catalog.bases.find((entry) => entry.name === 'Lament Amulet')
if (!base) throw new Error('固定目录缺少 Lament Amulet')

describe('基底技能候选展示', () => {
  it.each([
    ['Lament Amulet', 37, ['-1 Prefix Modifier allowed']],
    ['Portent Amulet', 7, ['-1 Suffix Modifier allowed']],
    ['Absent Amulet', 7, ['-1 Prefix Modifier allowed', '-1 Suffix Modifier allowed']],
  ])('固定来源 %s 分离共同固有行和互斥技能', (name, count, commonLines) => {
    const source = catalog.bases.find((entry) => entry.name === name)
    if (!source) throw new Error('缺少测试基底')
    const before = JSON.stringify(source)
    const result = readBaseSkillVariants(source)
    expect(result?.commonLines).toEqual(commonLines)
    expect(result?.variants).toHaveLength(count)
    expect(result?.variants.map((entry) => entry.name)).toEqual(source.variantList)
    expect(result?.variants[0]).toMatchObject({ index: 1, minLevel: 1, maxLevel: 20 })
    expect(JSON.stringify(source)).toBe(before)
    expect(readBaseGrantedSkills(source)).toEqual([])
  })

  it('缺项、重复编号、未知标记或名称错配不能产生部分可信结果', () => {
    const line = '{variant:1}Grants Skill: Level (1-20) Arctic Armour'
    for (const implicit of [
      base.implicit?.replace(line, ''),
      `${base.implicit}\n${line}`,
      base.implicit?.replace('{variant:1}', '{variant:99}'),
      base.implicit?.replace('{variant:1}', '{variant:1,2}'),
      base.implicit?.replace('Arctic Armour', 'Unknown Skill'),
      base.implicit?.replace('(1-20)', '(20-1)'),
      `${base.implicit}\nGrants Skill: Level (1-20) Other Skill`,
      `${base.implicit}\n  Grants Skill: Level (1-20) Other Skill`,
    ]) {
      expect(readBaseSkillVariants({ ...base, implicit: implicit ?? null })).toBeNull()
    }
    expect(readBaseSkillVariants({ ...base, variantList: [] })).toBeNull()
    expect(readBaseSkillVariants({ ...base, implicit: null })).toBeNull()
  })
})
