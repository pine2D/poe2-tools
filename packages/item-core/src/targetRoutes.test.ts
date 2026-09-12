import { describe, expect, it } from 'vitest'
import type { CatalogBase, CatalogMod, CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import { type CraftState, prepareCraftOperation, removableCraftAffixes } from './rehearsal'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

const base: CatalogBase = {
  id: 'Focus',
  name: 'Focus',
  type: 'Focus',
  tags: ['focus', 'default'],
  requirements: {},
  properties: {},
  implicit: null,
  implicitTags: [],
  sourceQuality: null,
  socketLimit: 3,
  hidden: false,
  runeforged: false,
}

function mod(id: string, kind: CatalogMod['kind'], extra: Partial<CatalogMod> = {}): CatalogMod {
  return {
    id,
    name: id,
    kind,
    group: id,
    level: 1,
    lines: [`${id} (1-10)`],
    statOrder: [1],
    tags: [],
    addsTags: [],
    eligibility: [
      { tag: 'focus', value: 1 },
      { tag: 'default', value: 0 },
    ],
    tradeHashes: {},
    ...extra,
  }
}

const modifiers = [
  mod('p1', 'prefix'),
  mod('p2', 'prefix'),
  mod('p3', 'prefix'),
  mod('p4', 'prefix'),
  mod('s1', 'suffix'),
  mod('s2', 'suffix'),
  mod('s3', 'suffix'),
  mod('s4', 'suffix'),
  mod('high', 'prefix', { group: 'p1', level: 80 }),
]

function catalog(mods = modifiers, extra: Partial<CatalogBase> = {}): CraftCatalog {
  return {
    _meta: {
      schemaVersion: 2,
      tier: 'primary',
      sourceCommit: 'a'.repeat(40),
      gameVersion: null,
      generatedAt: '2026-09-12',
      weightStatus: 'unknown',
      sources: [],
      excludedBases: [],
    },
    bases: [{ ...base, ...extra }],
    modifiers: mods,
  }
}

function state(rarity: CraftState['rarity'] = 'rare', ids: string[] = []): CraftState {
  return {
    baseId: base.id,
    itemLevel: 70,
    rarity,
    affixes: ids.map((modId) => ({ modId, lines: [`${modId} 5`] })),
    sourceText: null,
  }
}

const plan = (...args: Parameters<typeof planCraftTargetRoutes>) => {
  const result = planCraftTargetRoutes(...args)
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function replay(source: CraftCatalog, input: CraftState, ids: string[]) {
  const result = plan(source, input, ids)
  expect(result.routes.length).toBeGreaterThan(0)
  for (const route of result.routes) {
    let current = input
    for (const step of route.steps) {
      const applied = applyCraftStep(source, current, step.operation)
      if (!applied.ok) throw new Error(applied.error)
      current = applied.value
      expect(current).toEqual(step.state)
    }
    const advice = analyzeCraftTargets(source, current, ids)
    expect(advice.ok && advice.value.targets.every((target) => target.matched)).toBe(true)
  }
  return result
}
describe('多目标完整示例路线', () => {
  it('授予技能禁止神圣时可合法重制同档位满足数值，并保留其他三个目标', () => {
    const source = catalog(modifiers, {
      implicit: 'Grants Skill: Level (1-20) Skeletal Warrior Minion',
    })
    const input: CraftState = {
      ...state('rare', ['p1', 'p2', 's1', 's2']),
      implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion'],
    }
    const original = structuredClone(input)
    const ids = ['p1', 'p2', 's1', 's2']
    const values = [{ modId: 'p1', bounds: [{ index: 0, min: 8 }] }]
    expect(prepareCraftOperation(source, input, 'divine').ok).toBe(false)
    const direct = applyCraftStep(source, input, {
      currency: 'chaos',
      removeModId: 'p1',
      modIds: ['p1'],
      rolls: [{ modId: 'p1', values: [8] }],
    })
    expect(direct.ok).toBe(true)
    const result = plan(source, input, ids, values)
    expect(result.routes.length).toBeGreaterThan(0)
    for (const route of result.routes) {
      let current = input
      for (const step of route.steps) {
        expect(step.operation).not.toMatchObject({ currency: 'divine' })
        if ('currency' in step.operation && step.operation.currency === 'annulment') {
          const pool = removableCraftAffixes(source, current, 'annulment', step.operation.omen)
          if (!pool.ok) throw new Error(pool.error)
          expect(step.atRiskTargetIds).toEqual(
            current.affixes
              .filter(
                (affix) =>
                  ids.includes(affix.modId) && pool.value.some((a) => a.modId === affix.modId),
              )
              .map((affix) => affix.modId),
          )
        }
        const applied = applyCraftStep(source, current, step.operation)
        if (!applied.ok) throw new Error(applied.error)
        current = applied.value
        expect(current).toEqual(step.state)
        expect(current.implicitLines).toEqual(input.implicitLines)
        expect(step.matchedTargetIds).toEqual(expect.arrayContaining(['p2', 's1', 's2']))
      }
      const final = analyzeCraftTargets(source, current, ids, values)
      expect(final.ok && final.value.targets.every((target) => target.matched)).toBe(true)
      expect(current.affixes.map((affix) => affix.modId).sort()).toEqual([...ids].sort())
    }
    expect(result.candidateApplications).toBeLessThanOrEqual(4096)
    expect(input).toEqual(original)
  })
  it('普通六目标完整回放且输入不变', () => {
    const input = state('normal')
    const copy = structuredClone(input)
    replay(catalog(), input, ['p1', 'p2', 'p3', 's1', 's2', 's3'])
    expect(input).toEqual(copy)
  })
  it('魔法多同侧目标、满稀有解除阻挡', () => {
    replay(catalog(), state('magic', ['p1']), ['p1', 'p2', 'p3'])
    const result = replay(catalog(), state('rare', ['p1', 'p2', 'p4', 's1', 's2', 's4']), [
      'p1',
      'p2',
      'p3',
      's1',
      's2',
      's3',
    ])
    expect(
      result.routes.some((route) => route.steps.some((step) => step.atRiskTargetIds.length > 0)),
    ).toBe(true)
    expect(
      result.routes.every((route) => route.steps.every((step) => step.lostTargetIds.length === 0)),
    ).toBe(true)
  })
  it('边界配置、空目标、已达成、深度与确定性', () => {
    for (const options of [
      { maxStates: 0 },
      { maxStates: 513 },
      { maxDepth: 17 },
      { maxDepth: 1.5 },
      { maxStates: null as unknown as number },
    ])
      expect(planCraftTargetRoutes(catalog(), state('normal'), ['p1'], [], [], options).ok).toBe(
        false,
      )
    expect(plan(catalog(), state('normal'), []).alreadyMatched).toBe(false)
    expect(plan(catalog(), state('magic', ['p1']), ['p1']).alreadyMatched).toBe(true)
    expect(
      plan(catalog(), state('normal'), ['p1', 'p2', 'p3', 's1', 's2', 's3'], [], [], {
        maxDepth: 1,
      }).truncated,
    ).toBe(true)
    expect(plan(catalog(), state('normal'), ['high']).routes).toEqual([])
    expect(planCraftTargetRoutes(catalog(), state('normal'), ['p1', 'p1']).ok).toBe(false)
  })
  it('神圣完整重掷多个显式与固有数值，保留已可读的满足值', () => {
    const source = catalog(modifiers, { implicit: 'Implicit (1-10)' })
    const input = { ...state('rare', ['p1', 's1']), implicitLines: ['Implicit 7'] }
    const values = [
      { modId: 'p1', bounds: [{ index: 0, min: 8 }] },
      { modId: 's1', bounds: [{ index: 0, min: 4 }] },
    ]
    const result = plan(source, input, ['p1', 's1'], values)
    const step = result.routes[0]?.steps[0]
    expect(step?.operation).toMatchObject({
      currency: 'divine',
      modIds: [],
      rolls: [
        { modId: 'p1', values: [8] },
        { modId: 's1', values: [5] },
      ],
      implicitValues: [7],
    })
    expect(step?.rerolledTargetIds).toEqual(['p1', 's1'])
  })
  it('接受替代档位及小数闭区间，不存在网格值则不给假成功', () => {
    const source = catalog([
      ...modifiers,
      mod('decimal', 'prefix', { group: 'p1', lines: ['value (0.1-0.9)'] }),
    ])
    const conditions = [{ modId: 'decimal', bounds: [{ index: 0, min: 0.25, max: 0.35 }] }]
    const result = plan(source, state('normal'), ['high'], conditions, [
      { targetModId: 'high', modIds: ['decimal'] },
    ])
    expect(result.routes.length).toBeGreaterThan(0)
    expect(result.routes[0]?.finalState.affixes[0]?.modId).toBe('decimal')
    expect(
      plan(
        source,
        state('normal'),
        ['decimal'],
        [{ modId: 'decimal', bounds: [{ index: 0, min: 0.21, max: 0.29 }] }],
      ).routes,
    ).toEqual([])
  })
  it('纯固定文本目标能生成，无多余空roll', () => {
    replay(catalog([mod('fixed', 'prefix', { lines: ['Cannot be Frozen'] })]), state('normal'), [
      'fixed',
    ])
  })
  it('精华唯一目标通过非目标填充，混合目标完整回放', () => {
    const essenceMod = mod('essence', 'prefix', { eligibility: [{ tag: 'default', value: 0 }] })
    const source = catalog([...modifiers, essenceMod])
    source._meta.sources = [{ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' }]
    source.essences = [
      {
        id: 'Metadata/Items/Currency/CurrencyPerfectEssenceLife',
        name: 'Perfect Essence of Life',
        type: 'Life',
        tierLevel: 1,
        mods: { Focus: 'essence' },
      },
    ]
    replay(source, state('normal'), ['essence'])
    replay(source, state('normal'), ['essence', 'p1', 's1'])
  })
  it('搜索预算与确定性', () => {
    const args = [catalog(), state('normal'), ['p1', 'p2', 'p3', 's1', 's2', 's3']] as const
    const result = plan(...args, [], [], { maxStates: 1 })
    expect(result.examinedStates).toBe(1)
    expect(result.truncated).toBe(true)
    expect(result.candidateApplications).toBeLessThanOrEqual(4096)
    expect(plan(...args)).toEqual(plan(...args))
  })
  it('动态标签要求先失去起点目标再恢复，关闭保护才能执行', () => {
    const source = catalog([
      mod('blocker', 'prefix', { addsTags: ['blocked'] }),
      mod('later', 'suffix', {
        eligibility: [
          { tag: 'blocked', value: 0 },
          { tag: 'default', value: 1 },
        ],
      }),
    ])
    const input = state('rare', ['blocker'])
    expect(plan(source, input, ['blocker', 'later']).routes).toEqual([])
    const result = plan(source, input, ['blocker', 'later'], [], [], { preserveMatched: false })
    expect(result.routes.length).toBeGreaterThan(0)
    expect(result.routes[0]?.steps.some((step) => step.lostTargetIds.includes('blocker'))).toBe(
      true,
    )
    expect(result.routes[0]?.steps.at(-1)?.matchedTargetIds).toEqual(['blocker', 'later'])
  })
  it('精华唯一目标被非目标同组阻挡时先合法剥离', () => {
    const source = catalog([
      ...modifiers,
      mod('essence', 'prefix', { group: 'p4', eligibility: [{ tag: 'default', value: 0 }] }),
    ])
    source._meta.sources = [{ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' }]
    source.essences = [
      {
        id: 'Metadata/Items/Currency/CurrencyPerfectEssenceLife',
        name: 'Perfect Essence of Life',
        type: 'Life',
        tierLevel: 1,
        mods: { Focus: 'essence' },
      },
    ]
    replay(source, state('rare', ['p4', 's1']), ['essence'])
  })
})

describe('已接受档位数值无网格时的 OR 替换路线', () => {
  it.each(['ordinary', 'essence', 'crafted-essence'] as const)(
    '%s：合法移除现存无解档位再达成替代，保留其他已达成组',
    (mode) => {
      const source = catalog([
        mod('p1', 'prefix', { lines: ['value (0.1-0.9)'] }),
        mod('alt', 'prefix', {
          group: 'p1',
          ...(mode === 'ordinary' ? {} : { eligibility: [{ tag: 'default', value: 0 as const }] }),
        }),
        mod('p2', 'prefix'),
        mod('s1', 'suffix'),
      ])
      if (mode !== 'ordinary') {
        source._meta.sources = [{ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' }]
        source.essences = [
          {
            id: 'Metadata/Items/Currency/CurrencyPerfectEssenceLife',
            name: 'Perfect Essence of Life',
            type: 'Life',
            tierLevel: 1,
            mods: { Focus: 'alt' },
          },
          {
            id: 'Metadata/Items/Currency/CurrencyLesserEssenceLife',
            name: 'Lesser Essence of Life',
            type: 'Life',
            tierLevel: 1,
            mods: { Focus: 'p1' },
          },
        ]
      }
      const input: CraftState = {
        ...state('rare', ['p2', 's1']),
        affixes: [
          {
            modId: 'p1',
            lines: ['value 0.2'],
            ...(mode === 'crafted-essence' ? { crafted: true as const } : {}),
          },
          ...state('rare', ['p2', 's1']).affixes,
        ],
      }
      const values = [
        { modId: 'p1', bounds: [{ index: 0, min: 0.21, max: 0.29 }] },
        { modId: 'alt', bounds: [{ index: 0, min: 8 }] },
      ]
      const alternatives = [{ targetModId: 'p1', modIds: ['alt'] }]
      const original = structuredClone(input)
      const result = plan(source, input, ['p1', 's1'], values, alternatives)
      expect(result.routes.length).toBeGreaterThan(0)
      for (const route of result.routes) {
        expect(route.steps[0]?.operation).toMatchObject({
          currency: 'annulment',
          removeModId: 'p1',
        })
        expect(route.steps[0]?.lostTargetIds).toEqual(['p1'])
        let current = input
        for (const step of route.steps) {
          const applied = applyCraftStep(source, current, step.operation)
          if (!applied.ok) throw new Error(applied.error)
          current = applied.value
          expect(current).toEqual(step.state)
          expect(step.matchedTargetIds).toContain('s1')
        }
        const final = analyzeCraftTargets(source, current, ['p1', 's1'], values, alternatives)
        expect(final.ok && final.value.targets.every((target) => target.matched)).toBe(true)
        expect(current.affixes.some((affix) => affix.modId === 'alt')).toBe(true)
      }
      expect(input).toEqual(original)
      expect(result.candidateApplications).toBeLessThanOrEqual(4096)
      const shallow = plan(source, input, ['p1', 's1'], values, alternatives, { maxDepth: 1 })
      expect(shallow.routes).toEqual([])
      expect(shallow.truncated).toBe(true)
    },
  )
})
