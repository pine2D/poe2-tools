import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { createItemTextLocalization } from './craftItemTextLocalization'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { readUnlevelledSkillName, resolveGrantedSkill } from './grantedSkills'
import { parseItem } from './parse'
import { importCraftState } from './rehearsalImport'

const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'test',
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
  bases: [
    {
      id: 'variant-id',
      name: 'Plain Spear',
      type: 'Spear',
      tags: ['default'],
      requirements: {},
      properties: {},
      implicit: 'Grants Skill: Spear Throw',
      implicitTags: [],
      sourceQuality: null,
      socketLimit: null,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: [
    {
      id: 'life',
      kind: 'prefix',
      group: 'life',
      name: 'Healthy',
      level: 1,
      lines: ['+(10-20) to maximum Life'],
      statOrder: [1],
      tags: [],
      addsTags: [],
      eligibility: [{ tag: 'default', value: 1 }],
      tradeHashes: {},
    },
  ],
}
const knownIdentity = { items: { bases: { 'Plain Spear': 'Plain Spear' }, uniques: {} } }
const levelled = 'Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)'
function item(locale: 'en' | 'zh-CN' | 'zh-TW', skill = 'Grants Skill: Spear Throw') {
  const labels =
    locale === 'en'
      ? ['Item Class', 'Rarity: Normal', 'Item Level']
      : locale === 'zh-CN'
        ? ['物品类别', '稀有度: 普通', '物品等级']
        : ['物品種類', '稀有度: 普通', '物品等級']
  const parsed = parseItem(
    `${labels[0]}: Spears\n${labels[1]}\nPlain Spear\n--------\n${labels[2]}: 70\n--------\n${skill}`,
  )
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.item
}
function dataFor(skill: string): CraftCatalog {
  const data = structuredClone(catalog)
  const base = data.bases[0]
  if (!base) throw new Error('测试基底缺失')
  base.implicit =
    skill === levelled
      ? 'Grants Skill: Level (1-20) Skeletal Warrior Minion'
      : 'Grants Skill: Spear Throw'
  return data
}

describe('目录英文身份和混合技能完整流程', () => {
  it('规范英文缺译文只提示核对基底，未定等级范围仍说明回读限制', () => {
    for (const locale of ['zh-CN', 'zh-TW'] as const) {
      const warnings: string[] = []
      const translate = createItemTextLocalization(locale, {}, warnings)
      for (const line of ['Grants Skill: Spear Throw', levelled])
        expect(translate.skill(line)).toBe(line)
      expect(warnings.every((warning) => warning.includes('回读须与基底完整核对'))).toBe(true)
      expect(warnings.join()).not.toContain('当前语言回读仍受限制')
      translate.skill('Grants Skill: Level (1-20) Skeletal Warrior Minion')
      expect(warnings.at(-1)).toContain('当前语言回读仍受限制')
    }
  })
  it.each(['zh-CN', 'zh-TW'] as const)('%s 按完整英文行识别技能而不猜中文', (locale) => {
    expect(readUnlevelledSkillName('Grants Skill: Spear Throw', locale)).toBe('Spear Throw')
    for (const skill of ['Grants Skill: Spear Throw', levelled]) {
      expect(resolveGrantedSkill(skill, [], locale).resolution.english).toBe(skill)
      const data = dataFor(skill)
      const source = item(locale, skill)
      const imported = importCraftState(
        data,
        'variant-id',
        source,
        inspectItem(source, knownIdentity),
      )
      expect(imported).toMatchObject({ ok: true, value: { implicitLines: [skill] } })
    }
    expect(resolveGrantedSkill('获得技能: 未收录', [], locale).resolution.english).toBeNull()
    expect(
      resolveGrantedSkill('賦予技能: 等級 12 未收錄', [], locale).resolution.english,
    ).toBeNull()
  })

  it.each(['en', 'zh-CN', 'zh-TW'] as const)(
    '%s 缺 items 的英文目录身份可保存恢复，游标后步骤仍核验',
    (locale) => {
      for (const skill of ['Grants Skill: Spear Throw', levelled]) {
        const data = dataFor(skill)
        const project: CraftProject = {
          schemaVersion: 1,
          sourceCommit: 'test',
          rulesVersion: CRAFT_RULES_VERSION,
          initialState: {
            baseId: 'variant-id',
            itemLevel: 70,
            rarity: 'normal',
            affixes: [],
            sourceText: item(locale, skill).rawText,
            implicitLines: [skill],
          },
          operations: [
            {
              currency: 'transmutation',
              modIds: ['life'],
              rolls: [{ modId: 'life', values: [15] }],
            },
          ],
          cursor: 0,
        }
        const restored = parseCraftProject(serializeCraftProject(project), data)
        expect(restored.ok).toBe(true)
        if (!restored.ok) throw new Error(restored.error)
        const applied = applyCraftStep(
          data,
          project.initialState,
          project.operations[0] as NonNullable<(typeof project.operations)[0]>,
        )
        expect(applied.ok).toBe(true)
        expect(parseCraftProject(serializeCraftProject({ ...project, cursor: 1 }), data).ok).toBe(
          true,
        )
        expect(
          parseCraftProject(
            serializeCraftProject({
              ...project,
              operations: [
                ...project.operations,
                { currency: 'augmentation', modIds: ['missing'] },
              ],
            }),
            data,
          ).ok,
        ).toBe(false)
        for (const version of skill === levelled ? [11] : [11, 17]) {
          const old = { ...project, rulesVersion: `basic-2026-09-12-v${version}` } as CraftProject
          const rejected = parseCraftProject(JSON.stringify(old), data, knownIdentity)
          expect(rejected.ok).toBe(false)
          if (!rejected.ok) expect(rejected.error).toContain('旧版项目不能包含')
        }
        if (skill === levelled) {
          const old = { ...project, rulesVersion: 'basic-2026-09-12-v17' }
          expect(parseCraftProject(JSON.stringify(old), data).ok).toBe(true)
        }
      }
    },
  )

  it.each(['zh-CN', 'zh-TW'] as const)('%s 损坏、重复、不匹配与删改来源技能仍拒绝', (locale) => {
    const data = dataFor(levelled)
    for (const skill of [
      levelled.replace('Max Level 13', 'Max Level 11'),
      levelled.replace('Level 12', 'Level (1-20)'),
      `${levelled}\n${levelled}`,
      'Grants Skill: Other',
      levelled.replace('Skeletal Warrior Minion', 'Other'),
    ]) {
      const source = item(locale, skill)
      expect(
        importCraftState(data, 'variant-id', source, inspectItem(source, knownIdentity)).ok,
      ).toBe(false)
    }
    const source = item(locale, levelled)
    const inspection = inspectItem(source, knownIdentity)
    const changed = {
      ...source,
      rawText: source.rawText.replace('Skeletal Warrior Minion', 'Other'),
    }
    expect(importCraftState(data, 'variant-id', changed, inspection).ok).toBe(false)
    const missing = { ...source, blocks: source.blocks.filter((block) => block.kind !== 'skill') }
    expect(
      importCraftState(data, 'variant-id', missing, inspectItem(missing, knownIdentity)).ok,
    ).toBe(false)
    // 英文原行不能借中文整件 locale 跳过名字证据。
    const other = item(locale, levelled.replace('Skeletal Warrior Minion', 'Other'))
    const forged = inspectItem(other, knownIdentity)
    const first = forged.skills[0]
    if (!first) throw new Error('测试技能缺失')
    first.resolution = { english: levelled, candidates: [{ id: 'skill.fake', english: levelled }] }
    expect(importCraftState(data, 'variant-id', other, forged).ok).toBe(false)
  })
})
