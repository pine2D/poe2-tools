import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { alloyTestFixture } from './alloyTestFixture'
import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import type { CraftResult, CraftState } from './rehearsal'
import { analyzeTargetDefinitions } from './targetDefinitionAdvice'
import { editTargetDefinitions } from './targetDefinitionEdits'
import { planTargetDefinitionRoutes } from './targetDefinitionRoutes'
import type { CraftTargetDefinitions } from './targetDefinitions'
import {
  craftTargetDefinitionCandidates,
  createTargetDefinitions,
  validateStoredTargetDefinitions,
  validateTargetDefinitions,
} from './targetDefinitions'
import { extractCraftTargets, extractTargetDefinitions } from './targetExtraction'
import { evaluateTargetDefinitions } from './targetProgress'
import { craftTargetCandidates } from './targets'

const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog = { ...primary, fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) }
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
const definitions = {
  nextTargetId: 12,
  targets: [
    { targetId: 't7', modId: 'FireResist1' },
    { targetId: 't11', modId: 'FireResist1' },
  ],
  alternatives: [],
  values: [
    { targetId: 't7', modId: 'FireResist1', bounds: [{ index: 0, min: 8, max: 8 }] },
    { targetId: 't11', modId: 'FireResist1', bounds: [{ index: 0, min: 10, max: 10 }] },
  ],
  fracturedTargetId: 't11',
}
const state: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  nextAffixId: 3,
  affixes: [
    { affixId: 'a1', modId: 'FireResist1', lines: ['+8% to Fire Resistance'] },
    { affixId: 'a2', modId: 'FireResist1', lines: ['+10% to Fire Resistance'], fractured: true },
  ],
}

describe('可信Flux族的独立目标', () => {
  it('逐tN保留同类阈值与破裂关联，不将ID视为任意冲突许可', () => {
    expect(validateTargetDefinitions(catalog, state, definitions)).toEqual({
      ok: true,
      value: definitions,
    })
    expect(validateStoredTargetDefinitions(catalog, state.baseId, definitions)).toEqual({
      ok: true,
      value: definitions,
    })
    expect(validateStoredTargetDefinitions(primary, state.baseId, definitions).ok).toBe(false)
    const unrelated = {
      ...definitions,
      targets: definitions.targets.map((t) => ({ ...t, modId: 'IncreasedLife1' })),
      values: [],
      fracturedTargetId: 't11',
    }
    expect(validateStoredTargetDefinitions(catalog, state.baseId, unrelated).ok).toBe(false)
    expect(
      createTargetDefinitions(
        catalog,
        { ...state, affixes: state.affixes.slice(0, 1) },
        { targetModIds: ['FireResist1', 'FireResist1'] },
      ).ok,
    ).toBe(false)
  })
  it('数量逐目标计入容量，部分组合仍必须包含指定tN', () => {
    const four = {
      nextTargetId: 5,
      targets: [1, 2, 3, 4].map((i) => ({ targetId: `t${i}`, modId: 'FireResist1' })),
      alternatives: [],
      values: [],
    }
    expect(validateStoredTargetDefinitions(catalog, state.baseId, four).ok).toBe(false)
    expect(
      validateStoredTargetDefinitions(catalog, state.baseId, {
        ...four,
        minimumTargetCount: 3,
        fracturedTargetId: 't4',
      }).ok,
    ).toBe(true)
  })
  it('提取按实例选择顺序复制条件；替换用接收游标且不复用旧ID', () => {
    const original = structuredClone({ state, definitions })
    const extracted = must(
      extractTargetDefinitions(
        catalog,
        state,
        [
          { modId: 'FireResist1', affixId: 'a2' },
          { modId: 'FireResist1', affixId: 'a1' },
        ],
        true,
        true,
      ),
    )
    expect(extracted).toEqual({
      nextTargetId: 3,
      targets: [
        { targetId: 't1', modId: 'FireResist1' },
        { targetId: 't2', modId: 'FireResist1' },
      ],
      alternatives: [],
      values: [
        { targetId: 't1', modId: 'FireResist1', bounds: [{ index: 0, min: 10, max: 10 }] },
        { targetId: 't2', modId: 'FireResist1', bounds: [{ index: 0, min: 8, max: 8 }] },
      ],
      fracturedTargetId: 't1',
    })
    const replaced = must(
      editTargetDefinitions(catalog, state, definitions, {
        kind: 'replace-definitions',
        definitions: extracted,
      }),
    )
    expect(replaced.targets.map((t) => t.targetId)).toEqual(['t12', 't13'])
    expect(replaced.values.map((t) => [t.targetId, t.bounds[0]?.min])).toEqual([
      ['t12', 10],
      ['t13', 8],
    ])
    expect(replaced.fracturedTargetId).toBe('t12')
    expect(replaced.nextTargetId).toBe(14)
    expect({ state, definitions }).toEqual(original)
    expect(JSON.stringify(extracted)).not.toContain('affixId')
  })
  it('同一实例重复、错类型或旧ID拒绝，旧提取仍拒绝同类重复', () => {
    for (const selections of [
      [
        { modId: 'FireResist1', affixId: 'a1' },
        { modId: 'FireResist1', affixId: 'a1' },
      ],
      [{ modId: 'ColdResist1', affixId: 'a1' }],
      [{ modId: 'FireResist1', affixId: 'a9' }],
      ['FireResist1'],
    ])
      expect(extractTargetDefinitions(catalog, state, selections, false, false).ok).toBe(false)
    expect(
      extractCraftTargets(
        catalog,
        state,
        [
          { modId: 'FireResist1', affixId: 'a1' },
          { modId: 'FireResist1', affixId: 'a2' },
        ],
        false,
        false,
      ).ok,
    ).toBe(false)
  })
})

it('原生分析与同一搜索逐tN处理不同条件，并能给出真实Flux一步', () => {
  const { fracturedTargetId: _, ...goals } = definitions
  const start = {
    ...state,
    affixes: [
      { affixId: 'a1', modId: 'ColdResist1', lines: ['+8% to Cold Resistance'] },
      { affixId: 'a2', modId: 'LightningResist1', lines: ['+10% to Lightning Resistance'] },
    ],
  }
  const advice = must(analyzeTargetDefinitions(catalog, start, goals))
  expect(advice.targets.map((t) => t.targetId)).toEqual(['t7', 't11'])
  expect(advice.progress.matches).toEqual([])
  const routes = must(
    planTargetDefinitionRoutes(catalog, start, goals, { maxDepth: 1, maxStates: 8 }),
  )
  const route = routes.routes.find((route) =>
    route.steps.some((step) => 'kind' in step.operation && step.operation.kind === 'flux'),
  )
  expect(route).toBeDefined()
  expect(route?.steps[0]?.matchedTargetIds).toEqual(['t7', 't11'])
  expect(route?.finalState.affixes.map((a) => [a.affixId, a.modId, a.lines])).toEqual([
    ['a1', 'FireResist1', ['+8(6-10)% to Fire Resistance']],
    ['a2', 'FireResist1', ['+10(6-10)% to Fire Resistance']],
  ])
})
it('原生神圣候选分别写入两个同类实例，不能第一条阈值覆盖全部', () => {
  const { fracturedTargetId: _, ...goals } = definitions
  const start = {
    ...state,
    affixes: [
      { affixId: 'a1', modId: 'FireResist1', lines: ['+8% to Fire Resistance'] },
      { affixId: 'a2', modId: 'FireResist1', lines: ['+9% to Fire Resistance'] },
    ],
  }
  const routes = must(
    planTargetDefinitionRoutes(catalog, start, goals, { maxDepth: 1, maxStates: 8 }),
  )
  const route = routes.routes.find((route) =>
    route.steps.some(
      (step) => 'currency' in step.operation && step.operation.currency === 'divine',
    ),
  )
  expect(route).toBeDefined()
  expect(route?.steps[0]?.matchedTargetIds).toEqual(['t7', 't11'])
  expect(route?.finalState.affixes.map((a) => a.lines)).toEqual([
    ['+8(6-10)% to Fire Resistance'],
    ['+10(6-10)% to Fire Resistance'],
  ])
})

it('原生路线先新增可转换来源，再Flux得到第二个同类目标，保护已有tN', () => {
  const { fracturedTargetId: _, ...goals } = definitions
  const start = { ...state, nextAffixId: 2, affixes: state.affixes.slice(0, 1) }
  const advice = must(analyzeTargetDefinitions(catalog, start, goals))
  expect(
    advice.steps.some(
      (step) =>
        step.currency === 'exalted' &&
        step.targetIds.includes('t11') &&
        step.targetModIds.includes('ColdResist1'),
    ),
  ).toBe(true)
  const routes = must(
    planTargetDefinitionRoutes(catalog, start, goals, { maxDepth: 2, maxStates: 32 }),
  )
  expect(
    routes.routes.some(
      (route) =>
        route.steps.length === 2 &&
        route.steps.some((step) => 'kind' in step.operation && step.operation.kind === 'flux'),
    ),
  ).toBe(true)
  expect(
    routes.routes.every((route) =>
      route.steps.every((step) => step.matchedTargetIds.includes('t7')),
    ),
  ).toBe(true)
})

it('联合神圣先固定实际增效值，再分别反解同类目标条件', () => {
  const augmented = { ...catalog, alloys: alloyTestFixture() }
  const start: CraftState = {
    ...state,
    nextAffixId: 4,
    affixes: [
      { affixId: 'a1', modId: 'FireResist1', lines: ['+8% to Fire Resistance'] },
      { affixId: 'a2', modId: 'FireResist1', lines: ['+10% to Fire Resistance'] },
      {
        affixId: 'a3',
        modId: 'AlloyEffectOfResistanceMods1',
        lines: ['20% increased Explicit Resistance Modifier magnitudes'],
        crafted: true,
      },
    ],
  }
  const goals: CraftTargetDefinitions = {
    nextTargetId: 12,
    targets: definitions.targets,
    alternatives: [],
    values: [
      {
        targetId: 't7',
        modId: 'FireResist1',
        basis: 'effective',
        bounds: [{ index: 0, min: 9, max: 9 }],
      },
      {
        targetId: 't11',
        modId: 'FireResist1',
        basis: 'effective',
        bounds: [{ index: 0, min: 13, max: 13 }],
      },
    ],
  }
  const routes = must(
    planTargetDefinitionRoutes(augmented, start, goals, { maxDepth: 1, maxStates: 8 }),
  )
  expect(
    routes.routes.some((route) =>
      route.steps.some(
        (step) => 'currency' in step.operation && step.operation.currency === 'divine',
      ),
    ),
  ).toBe(true)
  expect(routes.routes[0]?.steps.at(-1)?.matchedTargetIds).toEqual(['t7', 't11'])
})

it('原生目标搜索列出已核对Flux可达目标，旧候选池不扩大生成来源', () => {
  const modId = 'CraftedJewelMaximumChaosResistance'
  expect(craftTargetDefinitionCandidates(catalog, 'Ruby').map((mod) => mod.id)).toContain(modId)
  expect(craftTargetDefinitionCandidates(primary, 'Ruby').map((mod) => mod.id)).not.toContain(modId)
  expect(craftTargetDefinitionCandidates(catalog, 'Gold Ring').map((mod) => mod.id)).not.toContain(
    modId,
  )
  expect(craftTargetCandidates(catalog, 'Ruby').map((mod) => mod.id)).not.toContain(modId)
  expect(
    validateStoredTargetDefinitions(catalog, 'Ruby', {
      nextTargetId: 2,
      targets: [{ targetId: 't1', modId }],
      alternatives: [],
      values: [],
    }).ok,
  ).toBe(true)
})

it('已达成的同类实例归属其tN，新增来源只指向尚缺实例的目标', () => {
  const { fracturedTargetId: _, ...goals } = definitions
  const start = {
    ...state,
    nextAffixId: 2,
    affixes: [{ affixId: 'a1', modId: 'FireResist1', lines: ['+10% to Fire Resistance'] }],
  }
  const advice = must(analyzeTargetDefinitions(catalog, start, goals))
  expect(advice.targets.map((target) => [target.targetId, target.present, target.matched])).toEqual(
    [
      ['t7', false, false],
      ['t11', true, true],
    ],
  )
  const add = advice.steps.find(
    (step) => step.currency === 'exalted' && step.targetModIds.includes('ColdResist1'),
  )
  expect(add?.targetIds).toEqual(['t7'])
})

it('两个仍缺实例的同类tN启用双崇高，先加两种来源再Flux完成', () => {
  const start: CraftState = { ...state, nextAffixId: 2, affixes: state.affixes.slice(0, 1) }
  const goals: CraftTargetDefinitions = {
    nextTargetId: 4,
    targets: [1, 2, 3].map((index) => ({ targetId: `t${index}`, modId: 'FireResist1' })),
    alternatives: [],
    values: [],
  }
  const added = must(
    applyCraftStep(catalog, start, {
      currency: 'exalted',
      omen: 'greater_dextral_exaltation',
      modIds: ['ColdResist1', 'LightningResist1'],
      rolls: [
        { affixId: 'a2', modId: 'ColdResist1', values: [6] },
        { affixId: 'a3', modId: 'LightningResist1', values: [6] },
      ],
    }),
  )
  const manual = must(
    applyCraftStep(catalog, added, {
      kind: 'flux',
      fluxId: 'Metadata/Items/Currency/CurrencyArcaneFluxFire',
      rolls: [
        { affixId: 'a2', modId: 'FireResist1', values: [6] },
        { affixId: 'a3', modId: 'FireResist1', values: [6] },
      ],
    }),
  )
  expect(evaluateTargetDefinitions(catalog, manual, goals).satisfied).toBe(true)
  const advice = must(analyzeTargetDefinitions(catalog, start, goals, 'greater_dextral_exaltation'))
  expect(advice.steps.find((step) => step.currency === 'exalted')?.targetIds).toEqual(['t2', 't3'])
  const routes = must(
    planTargetDefinitionRoutes(catalog, start, goals, { maxDepth: 2, maxStates: 16 }),
  )
  expect(routes.routes.length).toBeGreaterThan(0)
  expect(
    routes.routes.some(
      (route) =>
        route.steps.length === 2 &&
        route.steps.some(
          (step) =>
            'currency' in step.operation &&
            step.operation.currency === 'exalted' &&
            step.operation.modIds.length === 2,
        ) &&
        route.steps.some((step) => 'kind' in step.operation && step.operation.kind === 'flux'),
    ),
  ).toBe(true)
  for (const route of routes.routes)
    expect(evaluateTargetDefinitions(catalog, route.finalState, goals).satisfied).toBe(true)
}, 15_000)
