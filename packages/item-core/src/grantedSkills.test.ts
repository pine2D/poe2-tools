import { describe, expect, it } from 'vitest'
import type { CatalogBase, CraftCatalog } from './catalog'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { inspectItem } from './export'
import {
  buildInitialSkillLines,
  matchesGrantedSkillImplicitLines,
  readBaseGrantedSkills,
  resolveGrantedSkill,
} from './grantedSkills'
import { parseItem } from './parse'
import { prepareCraftOperation } from './rehearsal'
import { importCraftState } from './rehearsalImport'

const base: CatalogBase = {
  id: 'sceptre',
  name: 'Rattling Sceptre',
  type: 'Sceptre',
  tags: ['sceptre'],
  requirements: {},
  properties: {},
  implicit: 'Grants Skill: Level (1-20) Skeletal Warrior Minion\n+(10-20) to Spirit',
  implicitTags: [],
  sourceQuality: null,
  socketLimit: null,
  hidden: false,
  runeforged: false,
}
const entries = [
  {
    id: 'skill.skeleton',
    en: 'Grants Skill: Level # Skeletal Warrior Minion',
    text: '获得技能: 等级 # 魔侍武士召唤生物',
  },
  {
    id: 'skill.other',
    en: 'Grants Skill: Level # Other',
    text: '获得技能: 等级 # 魔侍武士召唤生物',
  },
]

describe('装备授予技能', () => {
  it('严格读取目录技能范围并生成搜索起点具体等级', () => {
    expect(readBaseGrantedSkills(base)).toEqual([
      { lineIndex: 0, name: 'Skeletal Warrior Minion', minLevel: 1, maxLevel: 20 },
    ])
    expect(buildInitialSkillLines(base, [{ lineIndex: 0, displayedLevel: 12 }])).toEqual({
      ok: true,
      value: ['Grants Skill: Level 12 Skeletal Warrior Minion', '+(10-20) to Spirit'],
    })
    expect(buildInitialSkillLines(base, [{ lineIndex: 0, displayedLevel: 21 }]).ok).toBe(false)
    expect(buildInitialSkillLines(base, [{ lineIndex: 1, displayedLevel: 12 }]).ok).toBe(false)
  })

  it('按官方 skill.* 整行模板解析三语和可选最高等级', () => {
    const skeleton = entries[0]
    if (skeleton === undefined) throw new Error('测试技能模板缺失')
    expect(
      resolveGrantedSkill(
        'Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)',
        entries,
        'en',
      ),
    ).toMatchObject({
      displayedLevel: 12,
      maxLevel: 13,
      resolution: { english: 'Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)' },
    })
    expect(
      resolveGrantedSkill(
        '获得技能: 等级 12 魔侍武士召唤生物（最高等级 13）',
        entries.slice(0, 1),
        'zh-CN',
      ),
    ).toMatchObject({
      displayedLevel: 12,
      maxLevel: 13,
      resolution: { english: 'Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)' },
    })
    expect(
      resolveGrantedSkill(
        '賦予技能: 等級 12 骷髏戰士召喚物（最高等級 13）',
        [{ ...skeleton, text: '賦予技能: 等級 # 骷髏戰士召喚物' }],
        'zh-TW',
      ),
    ).toMatchObject({ displayedLevel: 12, maxLevel: 13 })
  })

  it('英文规范技能行无需本地化词典即可交给基底目录核对', () => {
    expect(
      resolveGrantedSkill('Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)', [], 'en')
        .resolution,
    ).toEqual({
      english: 'Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)',
      candidates: [
        {
          id: 'skill.english:Skeletal Warrior Minion',
          english: 'Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)',
        },
      ],
    })
  })

  it('非法尾注不识别，多译法保留候选且不猜英文', () => {
    expect(
      resolveGrantedSkill('获得技能: 等级 12 魔侍武士召唤生物（最高等级 13）额外', entries, 'zh-CN')
        .resolution.candidates,
    ).toEqual([])
    const ambiguous = resolveGrantedSkill('获得技能: 等级 12 魔侍武士召唤生物', entries, 'zh-CN')
    expect(ambiguous.resolution.english).toBeNull()
    expect(ambiguous.resolution.candidates).toHaveLength(2)
  })

  it('专用固有匹配只接受整数技能等级、正确名称和完整最高等级尾注', () => {
    const patterns = base.implicit?.split('\n') ?? []
    expect(
      matchesGrantedSkillImplicitLines(patterns, [
        'Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)',
        '+14(10-20) to Spirit',
      ]),
    ).toBe(true)
    expect(
      matchesGrantedSkillImplicitLines(patterns, [
        'Grants Skill: Level 12.5 Skeletal Warrior Minion',
        '+14(10-20) to Spirit',
      ]),
    ).toBe(false)
    expect(
      matchesGrantedSkillImplicitLines(patterns, [
        'Grants Skill: Level 12 Other',
        '+14(10-20) to Spirit',
      ]),
    ).toBe(false)
    expect(
      matchesGrantedSkillImplicitLines(patterns, [
        'Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13) junk',
        '+14(10-20) to Spirit',
      ]),
    ).toBe(false)
  })

  it('导入时保存规范技能行，并拒绝缺失检查、重复技能和名称不符', () => {
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
      bases: [base],
      modifiers: [],
    }
    const raw =
      'Item Class: Sceptres\nRarity: Normal\nRattling Sceptre\n--------\nItem Level: 70\n--------\nGrants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)\n--------\n{ Implicit Modifier }\n+14(10-20) to Spirit'
    const parsed = parseItem(raw)
    if (!parsed.ok) throw new Error(parsed.error)
    const inspection = inspectItem(parsed.item, {
      items: { bases: { 'Rattling Sceptre': '罪孽权杖' }, uniques: {} },
      stats: { entries: entries.slice(0, 1) },
    })
    expect(importCraftState(catalog, base.id, parsed.item, inspection)).toMatchObject({
      ok: true,
      value: {
        implicitLines: [
          '+14(10-20) to Spirit',
          'Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)',
        ],
      },
    })
    const { skills: _skills, ...missing } = inspection
    expect(importCraftState(catalog, base.id, parsed.item, missing).ok).toBe(false)
    expect(
      importCraftState(catalog, base.id, parsed.item, {
        ...inspection,
        skills: [...inspection.skills, ...inspection.skills],
      }).ok,
    ).toBe(false)
    const wrong = structuredClone(inspection)
    if (wrong.skills[0]?.resolution.english)
      wrong.skills[0].resolution.english = 'Grants Skill: Level 12 Other'
    expect(importCraftState(catalog, base.id, parsed.item, wrong).ok).toBe(false)
  })

  it('v12恢复重验技能原文，旧规则拒绝技能能力且神圣石保持禁用', () => {
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
      bases: [base],
      modifiers: [],
    }
    const dictionary = {
      items: { bases: { 'Rattling Sceptre': '罪孽权杖' }, uniques: {} },
      stats: { entries: entries.slice(0, 1) },
    }
    const raw =
      'Item Class: Sceptres\nRarity: Normal\nRattling Sceptre\n--------\nItem Level: 70\n--------\nGrants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)\n--------\n{ Implicit Modifier }\n+14(10-20) to Spirit'
    const input = {
      schemaVersion: 1,
      sourceCommit: 'test',
      rulesVersion: CRAFT_RULES_VERSION,
      initialState: {
        baseId: 'sceptre',
        itemLevel: 70,
        rarity: 'normal' as const,
        affixes: [],
        sourceText: raw,
        implicitLines: [
          '+14(10-20) to Spirit',
          'Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)',
        ],
      },
      operations: [],
      cursor: 0,
    }
    expect(parseCraftProject(JSON.stringify(input), catalog, dictionary).ok).toBe(true)
    expect(
      parseCraftProject(
        JSON.stringify({ ...input, rulesVersion: 'basic-2026-09-12-v11' }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
    const { implicitLines: _implicitLines, ...withoutImplicitLines } = input.initialState
    expect(
      parseCraftProject(
        JSON.stringify({ ...input, initialState: withoutImplicitLines }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
    for (const changed of [
      'Grants Skill: Level 12 Skeletal Warrior Minion',
      'Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 14)',
      'Grants Skill: Level 12 Other (Max Level 13)',
    ]) {
      expect(
        parseCraftProject(
          JSON.stringify({
            ...input,
            initialState: {
              ...input.initialState,
              implicitLines: ['+14(10-20) to Spirit', changed],
            },
          }),
          catalog,
          dictionary,
        ).ok,
      ).toBe(false)
    }
    expect(
      parseCraftProject(
        JSON.stringify({
          ...input,
          initialState: {
            ...input.initialState,
            implicitLines: [
              '+14(10-20) to Spirit',
              'Grants Skill: Level 11 Skeletal Warrior Minion (Max Level 13)',
            ],
          },
        }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
    const blank = {
      ...input,
      initialState: {
        ...input.initialState,
        sourceText: null,
        implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion', '+(10-20) to Spirit'],
      },
    }
    expect(parseCraftProject(JSON.stringify(blank), catalog, dictionary).ok).toBe(true)
    expect(
      parseCraftProject(
        JSON.stringify({ ...blank, rulesVersion: 'basic-2026-09-12-v11' }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
    expect(prepareCraftOperation(catalog, input.initialState, 'divine')).toMatchObject({
      ok: false,
      error: expect.stringContaining('授予技能'),
    })
  })
})
