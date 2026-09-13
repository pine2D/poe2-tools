import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import { prepareFracture } from './fracture'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

function replay(...args: Parameters<typeof planCraftTargetRoutes>) {
  const result = planCraftTargetRoutes(...args)
  if (!result.ok) throw new Error(result.error)
  expect(result.value.alreadyMatched).toBe(false)
  expect(result.value.routes.length).toBeGreaterThan(0)
  const [catalog, input, ids, values, alternatives, , implicitValues, fractureId] = args
  for (const route of result.value.routes) {
    let current = input
    for (const step of route.steps) {
      if ('kind' in step.operation && step.operation.kind === 'fracture') {
        const prepared = prepareFracture(catalog, current)
        if (!prepared.ok) throw new Error(prepared.error)
        expect(step.fractureCandidateModIds).toEqual(prepared.value.candidates.map((a) => a.modId))
      }
      const applied = applyCraftStep(catalog, current, step.operation)
      if (!applied.ok) throw new Error(applied.error)
      current = applied.value
      expect(current).toEqual(step.state)
    }
    expect(current).toEqual(route.finalState)
    expect(current.pendingDesecration).toBeUndefined()
    const final = analyzeCraftTargets(
      catalog,
      current,
      ids,
      values,
      alternatives,
      undefined,
      implicitValues,
      fractureId,
    )
    expect(final.ok && final.value.targets.every((t) => t.matched)).toBe(true)
  }
  expect(result.value.candidateApplications).toBeLessThanOrEqual(4096)
  return result.value
}

it.each([1, 2, 3, 4])('稀有 %s 组已有目标先合法补足再破裂，不能提前完成', (count) => {
  const state = boneState(['prefix1', 'suffix1', 'prefix2', 'suffix2'].slice(0, count))
  const result = replay(boneCatalog(), state, ['prefix1'], [], [], {}, [], 'prefix1')
  for (const route of result.routes) {
    expect(route.steps.at(-1)?.operation).toEqual({ kind: 'fracture', modId: 'prefix1' })
    expect(route.steps).toHaveLength(Math.max(0, 4 - count) + 1)
    expect(
      route.steps.every(
        (step) => step.state.affixes.find((a) => a.modId === 'prefix1')?.lines[0] === 'prefix1 5',
      ),
    ).toBe(true)
  }
})

it('数值不足先神圣后破裂', () => {
  const result = replay(
    boneCatalog(),
    boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2']),
    ['prefix1'],
    [{ modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }],
    [],
    {},
    [],
    'prefix1',
  )
  expect(result.routes[0]?.steps.map((s) => s.operation)).toMatchObject([
    { currency: 'divine' },
    { kind: 'fracture', modId: 'prefix1' },
  ])
})

it.each(['normal', 'magic'] as const)('%s 起点完成稀有准备和破裂', (rarity) => {
  const state = { ...boneState(rarity === 'magic' ? ['prefix1'] : []), rarity }
  replay(boneCatalog(), state, ['prefix1'], [], [], {}, [], 'prefix1')
})

it('OR 主目标锁定当前接受档位，数值保护及真实风险使用接受项', () => {
  const catalog = boneCatalog()
  required(catalog.modifiers.find((m) => m.id === 'prefix2')).group = 'prefix1'
  const result = replay(
    catalog,
    boneState(['prefix2', 'suffix1']),
    ['prefix1'],
    [{ modId: 'prefix2', bounds: [{ index: 0, min: 5 }] }],
    [{ targetModId: 'prefix1', modIds: ['prefix2'] }],
    {},
    [],
    'prefix1',
  )
  for (const route of result.routes) {
    expect(route.steps.at(-1)?.operation).toEqual({ kind: 'fracture', modId: 'prefix2' })
    expect(route.steps.at(-1)?.gainedTargetIds).toContain('prefix1')
    expect(route.steps.every((s) => s.lostTargetIds.length === 0)).toBe(true)
  }
})

it.each(['crafted', 'genesis'] as const)('已有 %s 组保留并与普通目标联合破裂', (mode) => {
  const catalog = boneCatalog(mode === 'genesis' ? 'Ring' : 'Helmet')
  const state = boneState(['prefix1'])
  const mod = required(catalog.modifiers.find((m) => m.id === 'prefix1'))
  mod.eligibility = [
    { tag: 'genesis_tree_minion', value: 1 },
    { tag: 'default', value: 0 },
  ]
  if (mode === 'genesis') required(catalog.bases[0]).tags.push('genesis_tree_minion')
  else {
    required(state.affixes[0]).crafted = true
    catalog._meta.sources.push({ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' })
    catalog.essences = [
      {
        id: 'Metadata/Items/Currency/CurrencyPerfectEssenceLife',
        name: 'Perfect Essence of Life',
        type: 'Life',
        tierLevel: 1,
        mods: { Helmet: 'prefix1' },
      },
    ]
  }
  const result = replay(catalog, state, ['prefix1', 'suffix1'], [], [], {}, [], 'prefix1')
  for (const route of result.routes) {
    expect(route.finalState.affixes.find((a) => a.modId === 'prefix1')).toEqual({
      ...state.affixes[0],
      fractured: true,
    })
    expect(route.steps.every((s) => !s.lostTargetIds.includes('prefix1'))).toBe(true)
  }
})

it.each([false, true])(
  'Echoes 已有候选（第二组 %s）在 pending 中先破裂仍须最终完成揭示',
  (second) => {
    const state = {
      ...boneState(['prefix1', 'prefix2', 'prefix3']),
      pendingDesecration: {
        boneId: 'preserved_rib' as const,
        kind: 'suffix' as const,
        options: ['suffix1', 'suffix2', 'suffix3'],
        revealOmen: 'abyssal_echoes' as const,
        ...(second ? { rerollOptions: ['suffix2', 'exclusive1', 'exclusive2'] } : {}),
      },
    }
    const original = structuredClone(state)
    const result = replay(boneCatalog(), state, ['prefix1'], [], [], {}, [], 'prefix1')
    expect(result.routes[0]?.steps[0]?.operation).toEqual({ kind: 'fracture', modId: 'prefix1' })
    expect(result.routes[0]?.steps[0]?.state.pendingDesecration).toEqual(state.pendingDesecration)
    expect(state).toEqual(original)
  },
)

it('未知非目标仍在破裂随机候选中，未知目标实值不伪造锁定', () => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2'])
  required(state.affixes[1]).lines = ['prefix2 (1-10)']
  const result = replay(catalog, state, ['prefix1'], [], [], {}, [], 'prefix1')
  expect(result.routes[0]?.steps[0]?.fractureCandidateModIds).toContain('prefix2')
  required(state.affixes[0]).lines = ['prefix1 (1-10)']
  expect(
    planCraftTargetRoutes(catalog, state, ['prefix1'], [], [], {}, [], 'prefix1'),
  ).toMatchObject({ ok: true, value: { alreadyMatched: false, routes: [] } })
})

it.each(['wrong-group', 'wrong-value', 'desecrated'] as const)(
  '%s 当前状态不返回错误破裂路线',
  (mode) => {
    const state = boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2'])
    if (mode === 'wrong-group') required(state.affixes[1]).fractured = true
    else if (mode === 'wrong-value') required(state.affixes[0]).fractured = true
    else required(state.affixes[0]).desecrated = true
    const values =
      mode === 'wrong-value' ? [{ modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }] : []
    const result = planCraftTargetRoutes(
      boneCatalog(),
      state,
      ['prefix1'],
      values,
      [],
      {},
      [],
      'prefix1',
    )
    expect(result).toMatchObject({ ok: true, value: { alreadyMatched: false, routes: [] } })
  },
)

it('预算和深度保留硬限；未设新要求不引入补词缀或破裂', () => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1'])
  for (const options of [{ maxStates: 1 }, { maxDepth: 1 }]) {
    const result = planCraftTargetRoutes(
      catalog,
      state,
      ['prefix1'],
      [],
      [],
      options,
      [],
      'prefix1',
    )
    expect(result).toMatchObject({ ok: true, value: { routes: [], truncated: true } })
    if (result.ok) expect(result.value.candidateApplications).toBeLessThanOrEqual(4096)
  }
  expect(planCraftTargetRoutes(catalog, state, ['prefix1'])).toMatchObject({
    ok: true,
    value: { alreadyMatched: true, routes: [], candidateApplications: 0 },
  })
  const result = replay(catalog, { ...boneState(), rarity: 'normal' }, ['prefix1'])
  expect(
    result.routes.every((r) =>
      r.steps.every((s) => !('kind' in s.operation && s.operation.kind === 'fracture')),
    ),
  ).toBe(true)
})

it('破裂后继续满足其他目标及固有数值，已锁定组不会进入神圣重掷风险', () => {
  const catalog = boneCatalog()
  required(catalog.bases[0]).implicit = 'Implicit (1-10)'
  const state = {
    ...boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2']),
    implicitLines: ['Implicit 2'],
  }
  const result = replay(
    catalog,
    state,
    ['prefix1', 'suffix3'],
    [],
    [],
    {},
    [{ lineIndex: 0, bounds: [{ index: 0, min: 8 }] }],
    'prefix1',
  )
  for (const route of result.routes) {
    expect(route.finalState.implicitLines).toEqual(['Implicit 8(1-10)'])
    for (const step of route.steps) {
      if (
        'currency' in step.operation &&
        step.operation.currency === 'divine' &&
        step.state.affixes.some((a) => a.modId === 'prefix1' && a.fractured)
      )
        expect(step.rerolledTargetIds).not.toContain('prefix1')
    }
  }
})

it('神圣被基底技能禁止时，先合法重造错误值再破裂并保护其他目标', () => {
  const catalog = boneCatalog()
  required(catalog.bases[0]).implicit = 'Grants Skill: Level (1-20) Skeletal Warrior Minion'
  const state = {
    ...boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2']),
    implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion'],
  }
  const result = replay(
    catalog,
    state,
    ['prefix1', 'prefix2', 'suffix1'],
    [{ modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }],
    [],
    {},
    [],
    'prefix1',
  )
  for (const route of result.routes) {
    expect(
      route.steps.every(
        (step) => !('currency' in step.operation && step.operation.currency === 'divine'),
      ),
    ).toBe(true)
    expect(route.steps.some((step) => step.lostTargetIds.includes('prefix1'))).toBe(true)
    expect(
      route.steps.every(
        (step) =>
          step.matchedTargetIds.includes('prefix2') && step.matchedTargetIds.includes('suffix1'),
      ),
    ).toBe(true)
    expect(route.steps.at(-1)?.operation).toEqual({ kind: 'fracture', modId: 'prefix1' })
  }
})

it('普通起点通过精华获得工艺目标，再补普通目标及破裂', () => {
  const catalog = boneCatalog()
  required(catalog.modifiers.find((m) => m.id === 'prefix1')).eligibility = [
    { tag: 'default', value: 0 },
  ]
  catalog._meta.sources.push({ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' })
  catalog.essences = [
    {
      id: 'Metadata/Items/Currency/CurrencyEssenceLife',
      name: 'Essence of Life',
      type: 'Life',
      tierLevel: 1,
      mods: { Helmet: 'prefix1' },
    },
  ]
  const result = replay(
    catalog,
    { ...boneState(), rarity: 'normal' },
    ['prefix1', 'suffix1'],
    [],
    [],
    {},
    [],
    'prefix1',
  )
  for (const route of result.routes) {
    expect(
      route.steps.some((step) => 'kind' in step.operation && step.operation.kind === 'essence'),
    ).toBe(true)
    expect(route.finalState.affixes.find((a) => a.modId === 'prefix1')).toMatchObject({
      crafted: true,
      fractured: true,
    })
  }
})

it('已破裂目标已完成及非法第八参数沿共同目标语义处理', () => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1'])
  required(state.affixes[0]).fractured = true
  expect(
    planCraftTargetRoutes(catalog, state, ['prefix1'], [], [], {}, [], 'prefix1'),
  ).toMatchObject({ ok: true, value: { alreadyMatched: true, routes: [] } })
  for (const id of ['', 'suffix1', 'exclusive1'])
    expect(planCraftTargetRoutes(catalog, state, ['prefix1'], [], [], {}, [], id).ok).toBe(false)
})
