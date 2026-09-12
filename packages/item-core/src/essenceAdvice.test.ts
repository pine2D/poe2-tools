import { describe, expect, it } from 'vitest'
import type { CatalogMod, CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import { analyzeEssenceTargets } from './essenceAdvice'
import { readNumericValues } from './numeric'
import type { CraftState } from './rehearsal'
import { analyzeCraftTargets } from './targets'

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
const steps = (...args: Parameters<typeof analyzeEssenceTargets>) => {
  const result = analyzeEssenceTargets(...args)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('精华目标建议', () => {
  it('前三档直接升级并完整填值，每个建议可应用且输入不变', () => {
    const before = structuredClone({ catalog, input: state(['s1']) })
    const result = steps(catalog, before.input, ['life'])
    expect(result).toHaveLength(3)
    for (const entry of result) {
      expect(entry).toMatchObject({
        targetModId: 'life',
        operation: { kind: 'essence', values: [10] },
        lostTargetIds: [],
        atRiskTargetIds: [],
      })
      expect(entry.operation.omen).toBeUndefined()
      expect(entry.operation.removeModId).toBeUndefined()
      expect(applyCraftStep(catalog, before.input, entry.operation)).toMatchObject({
        ok: true,
        value: { rarity: 'rare', affixes: [{ modId: 's1' }, { modId: 'life', crafted: true }] },
      })
    }
    expect({ catalog, input: state(['s1']) }).toEqual(before)
    expect(steps(catalog, before.input, ['life'])).toEqual(result)
  })
  it('替换与腐化列双结晶，非目标移除仍显示整池风险，风险使用实际替代档位', () => {
    const input = state(['p1', 's2'], 'rare')
    const result = steps(
      catalog,
      input,
      ['life', 's1'],
      [{ modId: 's2', bounds: [{ index: 0, min: 19 }] }],
      [{ targetModId: 's1', modIds: ['s2'] }],
    )
    expect(result).toHaveLength(8)
    expect(result[0]?.atRiskTargetIds).toEqual([])
    for (const tier of ['Perfect', 'Corrupted']) {
      const options = result.filter((s) => s.operation.essenceId === essenceId(tier))
      expect(
        options.find((s) => !s.operation.omen && s.operation.removeModId === 'p1'),
      ).toMatchObject({ lostTargetIds: [], atRiskTargetIds: ['s2'] })
      expect(options.find((s) => s.operation.omen === 'sinistral_crystallisation')).toMatchObject({
        lostTargetIds: [],
        atRiskTargetIds: [],
      })
      expect(options.find((s) => s.operation.omen === 'dextral_crystallisation')).toMatchObject({
        lostTargetIds: ['s2'],
        atRiskTargetIds: ['s2'],
      })
    }
    for (const entry of result)
      expect(applyCraftStep(catalog, input, entry.operation).ok).toBe(true)
  })
  it('容量已经限定同侧时不推荐冗余预兆', () => {
    const result = steps(catalog, state(['p1', 'p2', 'p3', 's1'], 'rare'), ['life'])
    expect(result).toHaveLength(6)
    expect(
      result.every(
        (s) => s.operation.omen === undefined && s.operation.removeModId?.startsWith('p'),
      ),
    ).toBe(true)
  })
  it.each([
    ['+(10-20) to maximum Life', 15.2, 17, 16],
    ['+(10-20) to maximum Life', 15.2, 15.8, null],
    ['-(10-20) to maximum Life', -18.2, -17.2, -18],
    ['(2.0-1.0) to maximum Life', 1.11, 1.3, 1.2],
    ['(0.1-0.9) to maximum Life', 0.3, 0.3, 0.3],
    ['(0.1-0.9) to maximum Life', 0.1 + 0.2, 0.4, 0.4],
    ['(-0.9--0.1) to maximum Life', -0.3, -0.3, -0.3],
  ])('显示网格 %s 在闭区间 %s–%s 取最小点 %s', (line, min, max, expected) => {
    const source = {
      ...catalog,
      modifiers: catalog.modifiers.map((m) => (m.id === 'life' ? { ...m, lines: [line] } : m)),
    }
    const result = steps(
      source,
      state(),
      ['life'],
      [{ modId: 'life', bounds: [{ index: 0, min, max }] }],
    )
    if (expected === null) expect(result).toEqual([])
    else {
      expect(result).toHaveLength(3)
      for (const entry of result) {
        expect(entry.operation.values).toEqual([expected])
        const applied = applyCraftStep(source, state(), entry.operation)
        expect(applied.ok).toBe(true)
        if (applied.ok)
          expect(readNumericValues([line], applied.value.affixes[0]?.lines ?? [])).toEqual({
            ok: true,
            value: [expected],
          })
      }
    }
  })
  it('精确映射接受替代，已有替代未达数值继续原神圣流程', () => {
    const alternatives = [{ targetModId: 'lifeAlt', modIds: ['life'] }]
    expect(
      steps(catalog, state(), ['lifeAlt'], [], alternatives).map((s) => s.targetModId),
    ).toEqual(['life', 'life', 'life'])
    const input = state(['lifeAlt'], 'rare')
    const values = [{ modId: 'lifeAlt', bounds: [{ index: 0, min: 19 }] }]
    expect(steps(catalog, input, ['lifeAlt'], values, alternatives)).toEqual([])
    expect(analyzeCraftTargets(catalog, input, ['lifeAlt'], values, alternatives)).toMatchObject({
      ok: true,
      value: { steps: expect.arrayContaining([expect.objectContaining({ currency: 'divine' })]) },
    })
  })
  it('已达成、无目标、已有冲突、低物等、空替换池与工艺不产生方案', () => {
    expect(steps(catalog, state(), [])).toEqual([])
    expect(steps(catalog, state(['s1']), ['s1'])).toEqual([])
    for (const input of [
      state(['lifeAlt']),
      { ...state(), itemLevel: 9 },
      state([], 'rare'),
      state([], 'normal'),
      {
        ...state(['s1']),
        affixes: [{ modId: 's1', lines: ['+15 to maximum Life'], crafted: true as const }],
      },
    ])
      expect(steps(catalog, input, ['life'])).toEqual([])
  })
  it('非法目标、条件、状态与精华缺源不绕过验证', () => {
    expect(analyzeEssenceTargets(catalog, state(), ['unknown']).ok).toBe(false)
    expect(analyzeEssenceTargets(catalog, state(), ['life', 'life']).ok).toBe(false)
    expect(analyzeEssenceTargets(catalog, { ...state(), itemLevel: 0 }, ['life']).ok).toBe(false)
    expect(
      analyzeEssenceTargets(
        catalog,
        state(),
        ['life'],
        [{ modId: 'life', bounds: [{ index: 0, min: 99 }] }],
      ).ok,
    ).toBe(false)
    expect(
      analyzeEssenceTargets({ ...catalog, _meta: { ...catalog._meta, sources: [] } }, state(), [
        'life',
      ]).ok,
    ).toBe(false)
    expect(steps({ ...catalog, essences: [] }, state(), ['lifeAlt'])).toEqual([])
  })
  it('未知映射、非法孔位、来源基底与数值模板沿用核心拒绝', () => {
    const ordinary = {
      ...catalog,
      modifiers: catalog.modifiers.map((m) => ({
        ...m,
        eligibility: [{ tag: 'default', value: 1 as const }],
      })),
    }
    for (const mods of [{ Focus: 'unknown' }, { Shield: 'life' }]) {
      const source = {
        ...ordinary,
        essences: (ordinary.essences ?? []).map((entry) => ({ ...entry, mods })),
      }
      expect(steps(source, state(), ['life'])).toEqual([])
    }
    expect(
      steps({ ...ordinary, _meta: { ...ordinary._meta, sources: [] } }, state(), ['life']),
    ).toEqual([])
    expect(analyzeEssenceTargets(catalog, { ...state(), sockets: ['unknown'] }, ['life']).ok).toBe(
      false,
    )
    expect(
      analyzeEssenceTargets(
        { ...catalog, bases: catalog.bases.map((base) => ({ ...base, runeforged: true })) },
        state(),
        ['life'],
      ).ok,
    ).toBe(false)
    for (const line of [
      'unsupported (1-2-3)',
      'Grants Skill: Level (1-20) Test',
      '(10-20)% increased effect of Socketed Runes',
    ]) {
      const source = {
        ...catalog,
        modifiers: catalog.modifiers.map((m) => (m.id === 'life' ? { ...m, lines: [line] } : m)),
      }
      const result = analyzeEssenceTargets(source, { ...state(), sockets: [null] }, ['life'])
      expect(!result.ok || result.value.length === 0).toBe(true)
    }
  })
  it('无数值范围仍返回完整空 values，多数值仅约束指定索引', () => {
    for (const [lines, values] of [
      [['Cannot be Frozen'], []],
      [['Adds (1-3) to (10-20) Physical Damage'], [1, 16]],
    ] as [string[], number[]][]) {
      const source = {
        ...catalog,
        modifiers: catalog.modifiers.map((m) => (m.id === 'life' ? { ...m, lines } : m)),
      }
      const bounds =
        values.length === 0 ? [] : [{ modId: 'life', bounds: [{ index: 1, min: 15.2 }] }]
      const result = steps(source, state(), ['life'], bounds)
      expect(result).toHaveLength(3)
      expect(
        result.every((entry) => JSON.stringify(entry.operation.values) === JSON.stringify(values)),
      ).toBe(true)
    }
  })
})

it('候选验证可计入外层预算，耗尽后停止内部 apply', () => {
  let used = 0
  const result = analyzeEssenceTargets(catalog, state(), ['life'], [], [], {
    consumeCandidate: () => ++used <= 1,
  })
  expect(result.ok).toBe(true)
  if (result.ok) expect(result.value.length).toBeLessThanOrEqual(1)
})
