import { describe, expect, it } from 'vitest'
import type { CatalogMod, CraftCatalog } from './catalog'
import { catalog as realCatalog } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import { JEWEL_EFFECT_EMOTION_ID } from './jewelEffectRules'
import { jewelFixture } from './jewelTestFixture'
import { inspectLiquidEmotions, LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { craftModsConflict } from './modConflicts'
import { inspectNumericLines, renderNumericLines } from './numeric'
import { type CraftState, craftCandidates } from './rehearsal'
import { STAT_SCALABILITY_SOURCE } from './statScalability'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets, type CraftTargetValues } from './targets'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('缺少测试记录')
  return value
}
function affix(mod: CatalogMod, numbers?: number[], crafted = false) {
  const ranges = inspectNumericLines(mod.lines)
  if (!ranges.ok) throw Error(ranges.error)
  const lines = renderNumericLines(mod.lines, numbers ?? ranges.value.map((range) => range.min))
  if (!lines.ok) throw Error(lines.error)
  return { modId: mod.id, lines: lines.value, ...(crafted ? { crafted: true as const } : {}) }
}
function replay(
  catalog: CraftCatalog,
  state: CraftState,
  ids: string[],
  values: CraftTargetValues[] = [],
  options = {},
) {
  const result = planCraftTargetRoutes(catalog, state, ids, values, [], options)
  if (!result.ok) throw Error(result.error)
  expect(result.value.routes.length).toBeGreaterThan(0)
  expect(result.value.candidateApplications).toBeLessThanOrEqual(4096)
  expect(result.value.examinedStates).toBeLessThanOrEqual(128)
  for (const route of result.value.routes) {
    let current = state
    for (const step of route.steps) {
      const next = applyCraftStep(catalog, current, step.operation)
      if (!next.ok) throw Error(next.error)
      expect(next.value).toEqual(step.state)
      current = next.value
    }
    const targets = analyzeCraftTargets(catalog, current, ids, values)
    expect(targets.ok && targets.value.targets.every((target) => target.matched)).toBe(true)
  }
  return result.value
}
function effectFixture() {
  const { catalog, state } = jewelFixture()
  catalog._meta.sources.push(LIQUID_EMOTION_SOURCE, STAT_SCALABILITY_SOURCE)
  catalog.liquidEmotions = structuredClone(realCatalog.liquidEmotions ?? [])
  catalog.modifiers.push(...structuredClone(realCatalog.modifiers.filter((mod) => mod.craftedOnly)))
  const target = required(catalog.modifiers.find((mod) => mod.id === 'prefix1'))
  target.lines = ['+(10-20)% to Fire Resistance']
  target.tags = ['fire']
  catalog.scalability = { [required(target.lines[0])]: [{ scalable: true, formats: [] }] }
  const effect = required(catalog.modifiers.find((mod) => mod.id === 'CraftedJewelPrefixEffect'))
  catalog.scalability[required(effect.lines[0])] = [{ scalable: false, formats: [] }]
  return { catalog, state, target, effect }
}

describe('液态情感完整目标路线', () => {
  it.each(
    ['Ruby', 'Emerald', 'Sapphire', 'Diamond'].flatMap((baseId) =>
      (['prefix', 'suffix'] as const).map((kind) => ({ baseId, kind })),
    ),
  )(
    '真实 $baseId $kind 三同侧目标经增容并以增效完成五组',
    ({ baseId, kind }) => {
      const state: CraftState = {
        baseId,
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
      }
      const pool = craftCandidates(realCatalog, { ...state, rarity: 'rare' })
      const selected: CatalogMod[] = []
      for (const side of [kind, kind, kind, kind === 'prefix' ? 'suffix' : 'prefix'] as const) {
        selected.push(
          required(
            pool.find(
              (mod) =>
                mod.kind === side && !selected.some((other) => craftModsConflict(mod, other)),
            ),
          ),
        )
      }
      const base = required(realCatalog.bases.find((entry) => entry.id === baseId))
      const effect = required(
        inspectLiquidEmotions(realCatalog, base)
          .find((entry) => entry.emotion.id === JEWEL_EFFECT_EMOTION_ID)
          ?.outcomes.find((mod) => mod.kind !== kind),
      )
      const ids = [...selected.map((mod) => mod.id), effect.id]
      const result = replay(realCatalog, state, ids)
      const route = required(result.routes[0])
      expect(route.finalState.affixes).toHaveLength(5)
      expect(
        route.steps.some(
          (step) =>
            'kind' in step.operation &&
            step.operation.kind === 'liquid-emotion' &&
            step.operation.emotionId.endsWith('EndgameDistilledEmotion3'),
        ),
      ).toBe(true)
    },
    20000,
  )
  it('effective-only 目标自动准备并施加增效', () => {
    const { catalog, state, target } = effectFixture()
    state.affixes = [
      affix(target, [20]),
      affix(required(catalog.modifiers.find((mod) => mod.id === 'suffix1'))),
    ]
    const result = replay(
      catalog,
      state,
      [target.id],
      [{ modId: target.id, basis: 'effective', bounds: [{ index: 0, min: 31, max: 31 }] }],
    )
    expect(
      required(result.routes[0]).steps.some(
        (step) => 'kind' in step.operation && step.operation.kind === 'liquid-emotion',
      ),
    ).toBe(true)
  })
  it('已有增效的 Divine 联合求值，破裂基础不变，催化与精确上限仍达成', () => {
    const { catalog, state, target, effect } = effectFixture()
    state.catalyst = { id: "Xoph's", quality: 20 }
    state.affixes = [{ ...affix(target, [11]), fractured: true }, affix(effect, [40], true)]
    const result = replay(
      catalog,
      state,
      [target.id],
      [{ modId: target.id, basis: 'effective', bounds: [{ index: 0, min: 19, max: 19 }] }],
    )
    const route = required(result.routes[0])
    expect(route.steps[0]?.operation).toMatchObject({ currency: 'divine' })
    expect(route.finalState.affixes[0]).toEqual(state.affixes[0])
  })
})

it('清除工艺候选包含实际缩小风险池的定向剥离', async () => {
  const { liquidRouteContext } = await import('./liquidRouteCandidates')
  const { catalog, state, target, effect } = effectFixture()
  state.affixes = [affix(target, [20]), affix(effect, [40], true)]
  const context = liquidRouteContext(
    catalog,
    state,
    [[target.id], ['CraftedJewelSuffixEffect']],
    [],
  )
  const removals = [...context.candidates(state)].filter(
    (candidate) =>
      'currency' in candidate.operation && candidate.operation.currency === 'annulment',
  )
  expect(
    removals.some(
      (candidate) =>
        'omen' in candidate.operation &&
        candidate.operation.omen === 'dextral_annulment' &&
        candidate.atRiskTargetIds.length === 0,
    ),
  ).toBe(true)
})

it('普通起点三同侧中含 effective-only 阈值仍能先增容后增效', () => {
  const { catalog, state, target, effect } = effectFixture()
  const initial = { ...state, rarity: 'normal' as const, affixes: [] }
  replay(
    catalog,
    initial,
    [target.id, 'prefix2', 'prefix3', 'suffix1', effect.id],
    [{ modId: target.id, basis: 'effective', bounds: [{ index: 0, min: 31, max: 31 }] }],
  )
})

it.each(['Ruby', 'Sapphire', 'Emerald', 'Diamond'])(
  '%s 自动路线可直接采用真实液态保证目标',
  (baseId) => {
    const base = required(realCatalog.bases.find((entry) => entry.id === baseId))
    const entry = required(
      inspectLiquidEmotions(realCatalog, base).find(
        (entry) => entry.reason === null && entry.outcomes.length === 1,
      ),
    )
    const target = required(entry.outcomes[0])
    const state: CraftState = {
      baseId,
      itemLevel: 86,
      rarity: 'rare',
      sourceText: null,
      affixes: [],
    }
    const filler = required(
      craftCandidates(realCatalog, state).find((mod) => !craftModsConflict(mod, target)),
    )
    state.affixes = [affix(filler)]
    const result = replay(realCatalog, state, [target.id])
    expect(
      result.routes.some(
        (route) =>
          route.steps[0]?.operation &&
          'kind' in route.steps[0].operation &&
          route.steps[0].operation.kind === 'liquid-emotion',
      ),
    ).toBe(true)
  },
)

it.each(['normal', 'magic', 'rare'] as const)(
  '%s 起点准备稀有并合法清已有工艺后制作固定目标',
  (rarity) => {
    const { catalog, state, effect } = effectFixture()
    const goal = 'CraftedJewelExposureOnHitWhileRubyEmeraldSocketed'
    const initial = {
      ...state,
      rarity,
      affixes:
        rarity === 'normal'
          ? []
          : rarity === 'magic'
            ? [affix(required(catalog.modifiers.find((mod) => mod.id === 'prefix1')))]
            : [affix(effect, [40], true)],
    }
    const result = replay(catalog, initial, [goal])
    if (rarity === 'rare')
      expect(
        required(result.routes[0]).steps.some(
          (step) =>
            'currency' in step.operation &&
            step.operation.currency === 'annulment' &&
            step.operation.removeModId === effect.id,
        ),
      ).toBe(true)
  },
)

it('双侧材料风险取完整池的真实OR档位，破裂不进入移除风险', async () => {
  const { liquidRouteContext } = await import('./liquidRouteCandidates')
  const { prepareLiquidEmotionCraft } = await import('./liquidEmotionCraft')
  const { catalog, state } = effectFixture()
  const p1 = required(catalog.modifiers.find((mod) => mod.id === 'prefix1'))
  const p2 = required(catalog.modifiers.find((mod) => mod.id === 'prefix2'))
  const s1 = required(catalog.modifiers.find((mod) => mod.id === 'suffix1'))
  const s2 = required(catalog.modifiers.find((mod) => mod.id === 'suffix2'))
  state.affixes = [affix(p1), { ...affix(p2), fractured: true }, affix(s1), affix(s2)]
  const context = liquidRouteContext(
    catalog,
    state,
    [['prefix3', p1.id], [p2.id], [s1.id], ['CraftedJewelPrefixEffect']],
    [],
  )
  const candidate = required(
    [...context.candidates(state)].find(
      (entry) =>
        'kind' in entry.operation &&
        entry.operation.kind === 'liquid-emotion' &&
        entry.operation.emotionId === JEWEL_EFFECT_EMOTION_ID &&
        entry.operation.removeModId === s2.id,
    ),
  )
  const pools = (['prefix', 'suffix'] as const).flatMap((side) => {
    const result = prepareLiquidEmotionCraft(catalog, state, JEWEL_EFFECT_EMOTION_ID, side)
    return result.ok ? result.value.removableAffixes.map((entry) => entry.modId) : []
  })
  expect(candidate.atRiskTargetIds).toEqual([p1.id, s1.id].filter((id) => pools.includes(id)))
  expect(candidate.atRiskTargetIds).toContain(p1.id)
  expect(candidate.atRiskTargetIds).not.toContain(p2.id)
})

it('联合Divine同时选普通基础值和增效值，不沿旧增效反解', () => {
  const { catalog, state, target, effect } = effectFixture()
  state.affixes = [affix(target, [10]), affix(effect, [40], true)]
  const result = replay(
    catalog,
    state,
    [target.id, effect.id],
    [
      { modId: target.id, basis: 'effective', bounds: [{ index: 0, min: 30, max: 30 }] },
      { modId: effect.id, bounds: [{ index: 0, min: 50, max: 50 }] },
    ],
  )
  expect(required(result.routes[0]).steps[0]?.operation).toMatchObject({
    currency: 'divine',
    rolls: expect.arrayContaining([
      { modId: effect.id, values: [50] },
      { modId: target.id, values: [20] },
    ]),
  })
})

it('OR替代、部分数量和必选破裂仍由共享目标判定', () => {
  const { catalog, state, target, effect } = effectFixture()
  required(catalog.modifiers.find((mod) => mod.id === 'prefix2')).group = target.group
  state.affixes = [{ ...affix(target, [11]), fractured: true }, affix(effect, [40], true)]
  const values: CraftTargetValues[] = [
    { modId: target.id, basis: 'effective', bounds: [{ index: 0, min: 17, max: 17 }] },
  ]
  const result = planCraftTargetRoutes(
    catalog,
    state,
    ['prefix2', 'suffix1'],
    values,
    [{ targetModId: 'prefix2', modIds: [target.id] }],
    { minimumTargetCount: 1 },
    [],
    'prefix2',
  )
  if (!result.ok) throw Error(result.error)
  expect(result.value.routes.length).toBeGreaterThan(0)
  for (const route of result.value.routes) {
    expect(route.finalState.affixes.find((entry) => entry.modId === target.id)).toEqual(
      state.affixes[0],
    )
    expect(route.steps.at(-1)?.matchedTargetIds).toContain('prefix2')
  }
})

it('预算边界如实截断，缺失来源与不支持材料不生成液态候选', async () => {
  const { liquidRouteContext } = await import('./liquidRouteCandidates')
  const { catalog, state, effect } = effectFixture()
  const normal = { ...state, rarity: 'normal' as const, affixes: [] }
  const limited = planCraftTargetRoutes(catalog, normal, [effect.id], [], [], {
    maxStates: 1,
    maxDepth: 1,
  })
  expect(limited).toMatchObject({
    ok: true,
    value: { routes: [], truncated: true, examinedStates: 1 },
  })
  catalog._meta.sources = catalog._meta.sources.filter(
    (source) => source.path !== LIQUID_EMOTION_SOURCE.path,
  )
  expect(liquidRouteContext(catalog, normal, [[effect.id]], []).enabled).toBe(false)
  catalog._meta.sources.push(LIQUID_EMOTION_SOURCE)
  catalog.liquidEmotions = (catalog.liquidEmotions ?? []).filter((entry) => entry.radiusJewel)
  expect(liquidRouteContext(catalog, normal, [[effect.id]], []).enabled).toBe(false)
})

it('液态费用计入报价且缺价保持未知，不虚构零成本', async () => {
  const { collectCraftCosts, quoteCraftCosts } = await import('./craftCosts')
  const { catalog, state } = effectFixture()
  const target = 'CraftedJewelExposureOnHitWhileRubyEmeraldSocketed'
  state.affixes = [affix(required(catalog.modifiers.find((mod) => mod.id === 'prefix1')))]
  const pricing = { unit: 'divine' as const, prices: {} }
  const result = replay(catalog, state, [target], [], { pricing, maxStates: 4 })
  const route = required(result.routes[0])
  const costs = collectCraftCosts(
    catalog,
    route.steps.map((step) => step.operation),
  )
  if (!costs.ok) throw Error(costs.error)
  expect(costs.value).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'emotion:Metadata/Items/Currency/EndgameDistilledEmotion1',
        count: 1,
      }),
    ]),
  )
  const quote = quoteCraftCosts(costs.value, pricing)
  expect(quote).toMatchObject({
    ok: true,
    value: {
      total: null,
      knownSubtotal: 0,
      missing: expect.arrayContaining(['emotion:Metadata/Items/Currency/EndgameDistilledEmotion1']),
    },
  })
  const priced = quoteCraftCosts(costs.value, {
    unit: 'divine',
    prices: Object.fromEntries(costs.value.map((cost) => [cost.id, 2])),
  })
  expect(priced).toMatchObject({
    ok: true,
    value: { total: costs.value.reduce((sum, cost) => sum + cost.count * 2, 0), missing: [] },
  })
})

it('移除增效导致仍在的普通目标数值失配时记录损失，默认保护拒绝该步骤', () => {
  const { catalog, state, target, effect } = effectFixture()
  state.affixes = [affix(target, [20]), affix(effect, [40], true)]
  const values: CraftTargetValues[] = [
    { modId: target.id, basis: 'effective', bounds: [{ index: 0, min: 28, max: 28 }] },
    { modId: effect.id, bounds: [{ index: 0, min: 60, max: 60 }] },
  ]
  const pricing = {
    unit: 'divine' as const,
    prices: {
      'currency:divine': 100,
      'currency:annulment': 1,
      'currency:exalted': 1,
      [`emotion:${JEWEL_EFFECT_EMOTION_ID}`]: 1,
    },
  }
  const result = replay(catalog, state, [target.id, effect.id], values, {
    pricing,
    preserveMatched: false,
    maxStates: 32,
  })
  const losses = result.routes
    .flatMap((route) => route.steps)
    .filter(
      (step) =>
        step.lostTargetIds.includes(target.id) &&
        step.state.affixes.some((affix) => affix.modId === target.id),
    )
  expect(losses.length).toBeGreaterThan(0)
  expect(
    losses.every((step) => step.lostTargetIds.filter((id) => id === target.id).length === 1),
  ).toBe(true)
  const preserved = replay(catalog, state, [target.id, effect.id], values)
  expect(
    preserved.routes.every((route) =>
      route.steps.every((step) => step.matchedTargetIds.includes(target.id)),
    ),
  ).toBe(true)
})

it('真实Ruby精确有效值目标每次应用第一步再规划仍能全程保留已达成目标', () => {
  const ids = [
    'JewelFireDamage',
    'JewelArmour',
    'JewelPhysicalDamage',
    'JewelArmourBreakDuration',
    'CraftedJewelPrefixEffect',
  ]
  const values: CraftTargetValues[] = [
    { modId: 'JewelArmour', basis: 'effective', bounds: [{ index: 0, min: 20, max: 20 }] },
  ]
  let state: CraftState = {
    baseId: 'Ruby',
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
  }
  const matched = new Set<string>()
  let done = false
  for (let index = 0; index <= 12; index++) {
    const result = planCraftTargetRoutes(realCatalog, state, ids, values)
    if (!result.ok) throw Error(result.error)
    if (result.value.alreadyMatched) {
      done = true
      break
    }
    expect(result.value.routes.length).toBeGreaterThan(0)
    const step = required(required(result.value.routes[0]).steps[0])
    const next = applyCraftStep(realCatalog, state, step.operation)
    if (!next.ok) throw Error(next.error)
    state = next.value
    expect(step.matchedTargetIds).toEqual(expect.arrayContaining([...matched]))
    for (const id of step.matchedTargetIds) matched.add(id)
  }
  expect(done).toBe(true)
}, 30000)

it('未显式选择增效但另一目标必需增效时，精确上限也提前准备兼容基础值', () => {
  const { catalog, state: source, target } = effectFixture()
  const second = required(catalog.modifiers.find((mod) => mod.id === 'prefix2'))
  second.lines = ['+(10-20)% to Cold Resistance']
  required(catalog.scalability)[required(second.lines[0])] = [{ scalable: true, formats: [] }]
  const ids = [target.id, second.id, 'prefix3', 'suffix1']
  const values: CraftTargetValues[] = [
    { modId: target.id, basis: 'effective', bounds: [{ index: 0, min: 20, max: 20 }] },
    { modId: second.id, basis: 'effective', bounds: [{ index: 0, min: 31, max: 31 }] },
  ]
  let state: CraftState = { ...source, rarity: 'normal', affixes: [] }
  let done = false
  for (let index = 0; index <= 12; index++) {
    const result = planCraftTargetRoutes(catalog, state, ids, values)
    if (!result.ok) throw Error(result.error)
    if (result.value.alreadyMatched) {
      done = true
      break
    }
    expect(result.value.routes.length).toBeGreaterThan(0)
    const next = applyCraftStep(
      catalog,
      state,
      required(required(result.value.routes[0]).steps[0]).operation,
    )
    if (!next.ok) throw Error(next.error)
    state = next.value
  }
  expect(done).toBe(true)
}, 10000)

it('普通有效值目标本就可达且未要求增效时保留单步直接路线', () => {
  const { catalog, state, target } = effectFixture()
  const result = replay(
    catalog,
    { ...state, rarity: 'normal', affixes: [] },
    [target.id],
    [{ modId: target.id, basis: 'effective', bounds: [{ index: 0, min: 20, max: 20 }] }],
  )
  expect(required(result.routes[0]).steps).toHaveLength(1)
  expect(
    result.routes.every((route) =>
      route.steps.every(
        (step) => !('kind' in step.operation) || step.operation.kind !== 'liquid-emotion',
      ),
    ),
  ).toBe(true)
})
