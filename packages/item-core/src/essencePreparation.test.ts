import { describe, expect, it } from 'vitest'
import type { CatalogMod, CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import { analyzeEssencePreparation } from './essencePreparation'
import type { CraftState } from './rehearsal'

const essenceId = (tier: string) => `Metadata/Items/Currency/Currency${tier}EssenceLife`
const mod = (id: string, kind: 'prefix' | 'suffix', group = id): CatalogMod => ({
  id,
  kind,
  name: id,
  group,
  level: 10,
  lines: ['+(10-20) to maximum Life'],
  statOrder: [1],
  tags: [],
  addsTags: [],
  eligibility: [{ tag: 'default', value: id === 'life' ? 0 : 1 }],
  tradeHashes: {},
})
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    excludedBases: [],
    sources: [{ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' }],
  },
  bases: [
    {
      id: 'focus',
      name: 'Test Focus',
      type: 'Focus',
      tags: ['default'],
      requirements: {},
      properties: {},
      implicit: null,
      implicitTags: [],
      sourceQuality: null,
      socketLimit: null,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: [
    mod('life', 'prefix'),
    mod('p1', 'prefix'),
    mod('p2', 'prefix'),
    mod('p3', 'prefix'),
    mod('s1', 'suffix'),
    mod('s2', 'suffix', 's1'),
    mod('lifeAlt', 'prefix', 'life'),
  ],
  essences: ['Lesser', '', 'Greater', 'Perfect', 'Corrupted'].map((tier) => ({
    id: essenceId(tier),
    name: `${tier} Essence of Life`,
    type: 'Life',
    tierLevel: 1,
    mods: { Focus: 'life' },
  })),
}
const state = (ids: string[] = [], rarity: CraftState['rarity'] = 'magic'): CraftState => ({
  baseId: 'focus',
  itemLevel: 80,
  rarity,
  sourceText: null,
  affixes: ids.map((modId) => ({ modId, lines: ['+15 to maximum Life'] })),
})

const advice = (...args: Parameters<typeof analyzeEssencePreparation>) => {
  const result = analyzeEssencePreparation(...args)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('精华示例准备路线', () => {
  it('普通装备通过蜕变、富豪及完美精华逐步回放，源状态不变', () => {
    const source = {
      ...catalog,
      essences: (catalog.essences ?? []).filter((e) => e.id === essenceId('Perfect')),
    }
    const input = state([], 'normal')
    const before = structuredClone(input)
    const result = advice(source, input, ['life'])
    expect(result.routes).toHaveLength(1)
    const route = result.routes[0]
    if (route === undefined) throw new Error('缺少准备路线')
    expect(route.preparations.map((step) => step.currency)).toEqual(['transmutation', 'regal'])
    let current = input
    for (const step of [...route.preparations, route.final.operation]) {
      const applied = applyCraftStep(source, current, step)
      expect(applied.ok).toBe(true)
      if (applied.ok) current = applied.value
    }
    expect(current.affixes).toContainEqual({
      modId: 'life',
      crafted: true,
      lines: ['+10(10-20) to maximum Life'],
    })
    expect(input).toEqual(before)
    expect(result.examinedStates).toBeLessThanOrEqual(128)
  })
  it('普通升级只需蜕变，魔法替换只需富豪；已有直接方案不重复提供准备', () => {
    const normal = advice(catalog, state([], 'normal'), ['life'])
    expect(normal.routes).toHaveLength(1)
    expect(normal.routes[0]?.preparations.map((step) => step.currency)).toEqual(['transmutation'])
    expect(advice(catalog, state(['s1']), ['life']).routes).toEqual([])
    const perfect = {
      ...catalog,
      essences: (catalog.essences ?? []).filter((e) => e.id === essenceId('Perfect')),
    }
    expect(
      advice(perfect, state(['s1']), ['life']).routes[0]?.preparations.map((step) => step.currency),
    ).toEqual(['regal'])
    expect(advice(perfect, state(['s1'], 'rare'), ['life']).routes).toEqual([])
  })
  it('优先准备另一个目标的合法替代档位，并使用该档位自己的数值条件与最终风险排序', () => {
    const source = {
      ...catalog,
      essences: (catalog.essences ?? []).filter((e) => e.id === essenceId('Perfect')),
      modifiers: catalog.modifiers.map((m) => (m.id === 's1' ? { ...m, level: 90 } : m)),
    }
    const result = advice(
      source,
      state([], 'normal'),
      ['life', 's1'],
      [{ modId: 's2', bounds: [{ index: 0, min: 18.2 }] }],
      [{ targetModId: 's1', modIds: ['s2'] }],
    )
    expect(result.routes[0]?.preparations[0]).toMatchObject({
      modIds: ['s2'],
      rolls: [{ modId: 's2', values: [19] }],
    })
    expect(result.routes[0]?.final).toMatchObject({
      lostTargetIds: [],
      atRiskTargetIds: [],
      operation: { omen: 'sinistral_crystallisation' },
    })
    expect(result.examinedStates).toBe(2)
  })
  it.each([
    ['+(2.11-2.7)% to Critical Hit Chance', 2.1125, 2.7, 2.12],
    ['(0.1-0.9) to maximum Life', 0.1 + 0.2, 0.4, 0.4],
    ['-(10-20) to maximum Life', -18.2, -17.2, -18],
    ['+(10-20) to maximum Life', 15.2, 15.8, null],
  ])('最终与准备数值共用严格显示网格：%s', (line, min, max, expected) => {
    const source = {
      ...catalog,
      modifiers: catalog.modifiers.map((m) => (m.id === 'life' ? { ...m, lines: [line] } : m)),
    }
    const result = advice(
      source,
      state([], 'normal'),
      ['life'],
      [{ modId: 'life', bounds: [{ index: 0, min, max }] }],
    )
    if (expected === null) expect(result.routes).toEqual([])
    else expect(result.routes[0]?.final.operation.values).toEqual([expected])
  })
  it('已存在但数值未达、工艺、同族冲突、低物等与缺数据及时返回无路线', () => {
    for (const input of [
      state(['lifeAlt']),
      { ...state([], 'normal'), itemLevel: 9 },
      {
        ...state(['s1']),
        affixes: [{ modId: 's1', lines: ['+15 to maximum Life'], crafted: true as const }],
      },
    ])
      expect(advice(catalog, input, ['life']).routes).toEqual([])
    expect(
      advice(
        catalog,
        state(['lifeAlt']),
        ['lifeAlt'],
        [{ modId: 'lifeAlt', bounds: [{ index: 0, min: 19 }] }],
      ).routes,
    ).toEqual([])
    expect(advice(catalog, state([], 'normal'), []).routes).toEqual([])
    expect(advice({ ...catalog, essences: [] }, state([], 'normal'), ['lifeAlt']).routes).toEqual(
      [],
    )
    const ordinary = {
      ...catalog,
      modifiers: catalog.modifiers.map((m) => ({
        ...m,
        eligibility: [{ tag: 'default', value: 1 as const }],
      })),
      _meta: { ...catalog._meta, sources: [] },
    }
    expect(advice(ordinary, state([], 'normal'), ['life']).routes).toEqual([])
  })
  it('非法目标、条件、状态、孔位、咒符与传奇沿现有验证拒绝', () => {
    expect(analyzeEssencePreparation(catalog, state([], 'normal'), ['unknown']).ok).toBe(false)
    expect(analyzeEssencePreparation(catalog, state([], 'normal'), ['life', 'life']).ok).toBe(false)
    expect(
      analyzeEssencePreparation(
        catalog,
        state([], 'normal'),
        ['life'],
        [{ modId: 'life', bounds: [{ index: 0, min: 99 }] }],
      ).ok,
    ).toBe(false)
    expect(
      analyzeEssencePreparation(
        catalog,
        state([], 'normal'),
        ['life'],
        [],
        [{ targetModId: 'life', modIds: ['unknown'] }],
      ).ok,
    ).toBe(false)
    expect(
      analyzeEssencePreparation(catalog, { ...state([], 'normal'), itemLevel: 0 }, ['life']).ok,
    ).toBe(false)
    expect(
      analyzeEssencePreparation(catalog, { ...state([], 'normal'), sockets: ['unknown'] }, ['life'])
        .ok,
    ).toBe(false)
    expect(
      analyzeEssencePreparation(
        { ...catalog, bases: catalog.bases.map((b) => ({ ...b, type: 'Charm' })) },
        state([], 'normal'),
        ['life'],
      ).ok,
    ).toBe(false)
    expect(
      analyzeEssencePreparation(
        catalog,
        { ...state([], 'normal'), rarity: 'unique' as CraftState['rarity'] },
        ['life'],
      ).ok,
    ).toBe(false)
  })
  it.each([128, 129])(
    '预算按不同准备路径产生的候选状态累计，%s 分支截断语义准确且确定',
    (count) => {
      const source = {
        ...catalog,
        modifiers: [
          mod('life', 'prefix'),
          mod('lifeAlt', 'prefix', 'life'),
          ...Array.from({ length: count }, (_, i) =>
            mod(`p${String(i).padStart(3, '0')}`, 'prefix', 'same'),
          ),
        ],
        essences: [
          {
            id: essenceId('Perfect'),
            name: 'Perfect',
            type: 'Life',
            tierLevel: 1,
            mods: { Focus: 'life' },
          },
          {
            id: 'Metadata/Items/Currency/CurrencyCorruptedEssenceAlt',
            name: 'Alt',
            type: 'Alt',
            tierLevel: 1,
            mods: { Focus: 'lifeAlt' },
          },
        ],
      }
      const args: Parameters<typeof analyzeEssencePreparation> = [
        source,
        state([], 'normal'),
        ['life'],
        [],
        [{ targetModId: 'life', modIds: ['lifeAlt'] }],
      ] as const
      const result = advice(...args)
      expect(result).toEqual({ routes: [], examinedStates: 128, truncated: count > 128 })
      expect(advice(...args)).toEqual(result)
    },
  )
  it('每条路线独立复制，修改返回值不污染输入与之后的调用', () => {
    const input = state([], 'normal')
    const result = advice(catalog, input, ['life'])
    const original = structuredClone(result)
    result.routes[0]?.preparations[0]?.rolls?.[0]?.values.push(999)
    result.routes[0]?.final.operation.values.push(999)
    expect(advice(catalog, input, ['life'])).toEqual(original)
    expect(input).toEqual(state([], 'normal'))
  })
})
