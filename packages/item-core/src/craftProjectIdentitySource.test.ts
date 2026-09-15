import { describe, expect, it } from 'vitest'
import { boneCatalog } from './boneTestFixture'
import { CRAFT_RULES_VERSION, type CraftProject, parseCraftProject } from './craftProject'
import { upgradeCraftProjectIdentity } from './craftProjectIdentity'
import type { ItemDictionary } from './export'
import type { CraftState } from './rehearsal'

const catalog = boneCatalog('Focus')
catalog.bases = catalog.bases.map((base) => ({ ...base, socketLimit: null }))
catalog.modifiers = catalog.modifiers.map((mod) => ({
  ...mod,
  lines:
    mod.id === 'prefix1'
      ? ['+(10-20) to maximum Energy Shield']
      : mod.id === 'suffix1'
        ? ['+(10-20) to maximum Mana']
        : mod.lines,
}))

const sources: { locale: string; raw: string; dictionary: ItemDictionary }[] = [
  {
    locale: 'en',
    raw: [
      'Item Class: Foci',
      'Rarity: Rare',
      'Synthetic Dawn',
      'Synthetic Base',
      '--------',
      'Item Level: 64',
      '--------',
      '{ Prefix Modifier "Synthetic Shield" (Tier: 1) }',
      '+15(10-20) to maximum Energy Shield',
      '{ Suffix Modifier "Synthetic Mana" (Tier: 1) }',
      '+17(10-20) to maximum Mana',
    ].join('\n'),
    dictionary: {
      items: { bases: { 'Synthetic Base': 'Synthetic Base' }, uniques: {} },
      stats: {
        entries: [
          { id: 'shield', en: '+# to maximum Energy Shield', text: '+# to maximum Energy Shield' },
          { id: 'mana', en: '+# to maximum Mana', text: '+# to maximum Mana' },
        ],
      },
    },
  },
  {
    locale: 'zh-CN',
    raw: [
      '物品类别: 法器',
      '稀有度: 稀有',
      '合成 晨光',
      '测试法器',
      '--------',
      '物品等级: 64',
      '--------',
      '{ 前缀属性 "合成护盾" (等阶：1) }',
      '+15(10-20) 能量护盾上限',
      '{ 后缀属性 "合成魔力" (等阶：1) }',
      '+17(10-20) 魔力上限',
    ].join('\n'),
    dictionary: {
      items: { bases: { 'Synthetic Base': '测试法器' }, uniques: {} },
      stats: {
        entries: [
          { id: 'shield', en: '+# to maximum Energy Shield', text: '+# 能量护盾上限' },
          { id: 'mana', en: '+# to maximum Mana', text: '+# 魔力上限' },
        ],
      },
    },
  },
  {
    locale: 'zh-TW',
    raw: [
      '物品種類: 法器',
      '稀有度: 稀有',
      '合成 晨光',
      '測試法器',
      '--------',
      '物品等級: 64',
      '--------',
      '{ 前綴屬性 "合成護盾" (階級：1) }',
      '+15(10-20) 最大能量護盾',
      '{ 後綴屬性 "合成魔力" (階級：1) }',
      '+17(10-20) 最大魔力',
    ].join('\n'),
    dictionary: {
      items: { bases: { 'Synthetic Base': '測試法器' }, uniques: {} },
      stats: {
        entries: [
          { id: 'shield', en: '+# to maximum Energy Shield', text: '+# 最大能量護盾' },
          { id: 'mana', en: '+# to maximum Mana', text: '+# 最大魔力' },
        ],
      },
    },
  },
]

function project(sourceText: string): CraftProject {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: {
      baseId: 'Synthetic Base',
      itemLevel: 64,
      rarity: 'rare',
      sourceText,
      affixes: [
        { modId: 'prefix1', lines: ['+15(10-20) to maximum Energy Shield'] },
        { modId: 'suffix1', lines: ['+17(10-20) to maximum Mana'] },
      ],
    },
    operations: [
      {
        currency: 'divine',
        modIds: [],
        rolls: [
          { modId: 'suffix1', values: [19] },
          { modId: 'prefix1', values: [18] },
        ],
      },
    ],
    cursor: 0,
  }
}

function semantic(state: CraftState): CraftState {
  const { nextAffixId: _, ...rest } = state
  return { ...rest, affixes: state.affixes.map(({ affixId: _, ...affix }) => affix) }
}

describe('项目实例升级重新核对三语来源原文', () => {
  it.each(sources)(
    '$locale 非空起点按原顺序编号，未来回放和完整语义保留',
    ({ raw, dictionary }) => {
      const input = project(raw)
      const before = structuredClone({ input, dictionary })
      const text = JSON.stringify(input)
      const legacy = parseCraftProject(text, catalog, dictionary)
      expect(legacy.ok, legacy.ok ? '' : legacy.error).toBe(true)
      const result = upgradeCraftProjectIdentity(text, catalog, dictionary)
      expect(result.ok, result.ok ? '' : result.error).toBe(true)
      if (!legacy.ok || !result.ok) return
      expect(result.value.project.initialState).toEqual({
        ...legacy.value.project.initialState,
        nextAffixId: 3,
        affixes: legacy.value.project.initialState.affixes.map((affix, index) => ({
          ...affix,
          affixId: `a${index + 1}`,
        })),
      })
      expect(result.value.project.initialState.sourceText).toBe(raw)
      expect(result.value.project.cursor).toBe(0)
      expect(result.value.states).toHaveLength(2)
      expect(result.value.states.map(semantic)).toEqual(legacy.value.states)
      expect(result.value.states.map((state) => state.nextAffixId)).toEqual([3, 3])
      expect(result.value.project.operations[0]).toEqual({
        ...input.operations[0],
        rolls: [
          { modId: 'suffix1', values: [19], affixId: 'a2' },
          { modId: 'prefix1', values: [18], affixId: 'a1' },
        ],
      })
      expect({ input, dictionary }).toEqual(before)
    },
  )

  it.each(sources)('$locale 原文与数值、顺序或物等不符不能由升级修复', ({ raw, dictionary }) => {
    const input = project(raw)
    const initial = input.initialState
    for (const initialState of [
      {
        ...initial,
        affixes: initial.affixes.map((affix) => ({
          ...affix,
          lines: affix.lines.map((line) => line.replace('+15', '+16')),
        })),
      },
      { ...initial, affixes: [...initial.affixes].reverse() },
      { ...initial, itemLevel: 65 },
    ]) {
      const text = JSON.stringify({ ...input, initialState })
      const legacy = parseCraftProject(text, catalog, dictionary)
      expect(legacy.ok).toBe(false)
      expect(upgradeCraftProjectIdentity(text, catalog, dictionary)).toEqual(legacy)
    }
  })

  it('两套中文词典独立核对，缺少词典或跨服词典均不能静默还原', () => {
    const simplified = sources[1]
    const traditional = sources[2]
    if (!simplified || !traditional) throw new Error('缺少独立中文夹具')
    for (const [source, wrong] of [
      [simplified, traditional],
      [traditional, simplified],
    ] as const) {
      const text = JSON.stringify(project(source.raw))
      expect(upgradeCraftProjectIdentity(text, catalog).ok).toBe(false)
      expect(upgradeCraftProjectIdentity(text, catalog, wrong.dictionary).ok).toBe(false)
    }
  })
})
