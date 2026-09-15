import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import type { CatalogBase, CatalogMod, CraftCatalog } from './catalog'
import { craftStateSemanticKey } from './craftStateSemanticKey'
import { applyCraftStep } from './craftSteps'
import type { CraftState } from './rehearsal'
import { planCraftTargetRoutes } from './targetRoutes'

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

function identified(input: CraftState, source = catalog()) {
  const result = enableCraftAffixIdentity(source, input)
  if (!result.ok) throw new Error(result.error)
  return result.value
}
describe('路线实例定位', () => {
  it.each(['normal', 'rare'] as const)('新增和神圣重掷显式定位真实实例：%s', (rarity) => {
    const source = catalog()
    const input = identified(state(rarity, rarity === 'rare' ? ['p1'] : []))
    const result = plan(source, input, ['p1'], [{ modId: 'p1', bounds: [{ index: 0, min: 8 }] }])
    expect(result.routes.length).toBeGreaterThan(0)
    for (const route of result.routes) {
      let current: CraftState = input
      for (const step of route.steps) {
        if ('currency' in step.operation)
          for (const roll of step.operation.rolls ?? [])
            expect(roll.affixId).toBe(
              step.state.affixes.find((affix) => affix.modId === roll.modId)?.affixId,
            )
        const applied = applyCraftStep(source, current, step.operation)
        if (!applied.ok) throw new Error(applied.error)
        expect(applied.value).toEqual(step.state)
        current = applied.value
      }
    }
  })
  it('移除后重新获得同类型，回放使用旧移除 ID 和新掷值 ID', () => {
    const source = catalog(modifiers, {
      implicit: 'Grants Skill: Level (1-20) Skeletal Warrior Minion',
    })
    const input = identified(
      {
        ...state('rare', ['p1', 'p2', 's1', 's2']),
        implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion'],
      },
      source,
    )
    const result = plan(
      source,
      input,
      ['p1', 'p2', 's1', 's2'],
      [{ modId: 'p1', bounds: [{ index: 0, min: 8 }] }],
    )
    expect(result.routes.length).toBeGreaterThan(0)
    for (const route of result.routes) {
      let current: CraftState = input
      for (const step of route.steps) {
        if ('currency' in step.operation) {
          const operation = step.operation
          if (operation.removeModId !== undefined)
            expect(operation.removeAffixId).toBe(
              current.affixes.find((affix) => affix.modId === operation.removeModId)?.affixId,
            )
          for (const roll of operation.rolls ?? [])
            expect(roll.affixId).toBe(
              step.state.affixes.find((affix) => affix.modId === roll.modId)?.affixId,
            )
        }
        const applied = applyCraftStep(source, current, step.operation)
        if (!applied.ok) throw new Error(applied.error)
        expect(applied.value).toEqual(step.state)
        current = applied.value
      }
      expect(current.affixes.find((affix) => affix.modId === 'p1')?.affixId).not.toBe('a1')
    }
  })
  it('破裂路线保留选中的实例 ID', () => {
    const source = catalog()
    const input = identified(state('rare', ['p1', 'p2', 's1', 's2']))
    const result = plan(source, input, ['p1'], [], [], { maxDepth: 1 }, [], 'p1')
    expect(result.routes.length).toBeGreaterThan(0)
    const operation = result.routes[0]?.steps[0]?.operation
    expect(operation).toEqual({ kind: 'fracture', modId: 'p1', affixId: 'a1' })
  })
  it('破裂准备在两种状态模式下使用相同预算并生成可回放的掷值', () => {
    const source = catalog()
    const legacy = state('magic', ['p1'])
    const input = identified(legacy)
    const a = plan(source, legacy, ['p1'], [], [], { maxStates: 64, maxDepth: 4 }, [], 'p1')
    const b = plan(source, input, ['p1'], [], [], { maxStates: 64, maxDepth: 4 }, [], 'p1')
    expect(b.routes.length).toBeGreaterThan(0)
    expect(a.examinedStates).toBe(b.examinedStates)
    expect(a.candidateApplications).toBe(b.candidateApplications)
    expect(a.routes.map((route) => craftStateSemanticKey(route.finalState))).toEqual(
      b.routes.map((route) => craftStateSemanticKey(route.finalState)),
    )
    for (const route of b.routes) {
      let current: CraftState = input
      for (const step of route.steps) {
        if ('currency' in step.operation)
          for (const roll of step.operation.rolls ?? [])
            expect(roll.affixId).toBe(
              step.state.affixes.find((affix) => affix.modId === roll.modId)?.affixId,
            )
        const applied = applyCraftStep(source, current, step.operation)
        if (!applied.ok) throw new Error(applied.error)
        expect(applied.value).toEqual(step.state)
        current = applied.value
      }
    }
  })
  it('分配游标和实例编号变化不改变搜索语义', () => {
    const source = catalog()
    const first = identified(state('rare', ['p1']))
    const second = {
      ...first,
      nextAffixId: 100,
      affixes: first.affixes.map((affix) => ({ ...affix, affixId: 'a90' })),
    }
    const values = [{ modId: 'p2', bounds: [{ index: 0, min: 8 }] }]
    const a = plan(source, first, ['p2'], values)
    const b = plan(source, second, ['p2'], values)
    expect(a.examinedStates).toBe(b.examinedStates)
    expect(a.candidateApplications).toBe(b.candidateApplications)
    expect(a.routes.map((route) => craftStateSemanticKey(route.finalState))).toEqual(
      b.routes.map((route) => craftStateSemanticKey(route.finalState)),
    )
  })
})
describe('搜索状态语义键', () => {
  it('忽略实例编号、游标和词缀顺序，保留重复数量及词缀状态', () => {
    const first = identified(state('rare', ['p1', 's1']))
    const copy = structuredClone(first)
    const second = {
      ...first,
      nextAffixId: 100,
      affixes: [...first.affixes]
        .reverse()
        .map((affix, i) => ({ ...affix, affixId: `a${i + 90}` })),
    }
    expect(craftStateSemanticKey(first)).toBe(craftStateSemanticKey(second))
    expect(craftStateSemanticKey(first)).toBe(craftStateSemanticKey(state('rare', ['s1', 'p1'])))
    for (const changes of [
      {
        affixes: [
          ...first.affixes,
          { ...first.affixes[0], modId: 'p1', lines: ['p1 5'], affixId: 'a3' },
        ],
        nextAffixId: 4,
      },
      { affixes: first.affixes.map((affix) => ({ ...affix, fractured: true as const })) },
      { affixes: first.affixes.map((affix) => ({ ...affix, lines: ['p1 8'] })) },
      { corrupted: true as const },
      { pendingDesecration: { boneId: 'gnawed_jawbone' as const, kind: 'prefix' as const } },
      { sockets: [] },
      { implicitLines: ['Implicit 3'] },
      { catalyst: { id: 'test-catalyst', quality: 10 } },
      { quality: 20 },
    ])
      expect(craftStateSemanticKey({ ...first, ...changes })).not.toBe(craftStateSemanticKey(first))
    expect(first).toEqual(copy)
  })
})
