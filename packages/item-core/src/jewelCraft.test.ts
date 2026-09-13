import { expect, it } from 'vitest'
import { boneState } from './boneTestFixture'
import { hasCraftModEligibility } from './catalog'
import { applyCraftStep } from './craftSteps'
import { jewelFixture as fixture } from './jewelTestFixture'
import { craftCandidates, createCraftState, prepareCraftOperation } from './rehearsal'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

it('四词缀珠宝两侧各二，候选和满词缀提示使用同一上限', () => {
  const { catalog, state } = fixture()
  state.affixes = boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2']).affixes
  expect(createCraftState(catalog, state).ok).toBe(true)
  expect(craftCandidates(catalog, state)).toEqual([])
  expect(prepareCraftOperation(catalog, state, 'exalted')).toMatchObject({
    ok: false,
    error: expect.stringContaining('已满'),
  })
  expect(
    createCraftState(catalog, {
      ...state,
      affixes: boneState(['prefix1', 'prefix2', 'prefix3']).affixes,
    }),
  ).toMatchObject({ ok: false, error: expect.stringContaining('2') })
})
it('搜索起点经蜕变、增幅、富豪、崇高到四词缀，再混沌跨侧校验与剥离', () => {
  const { catalog, state } = fixture()
  let current = { ...state, rarity: 'normal' as const } as typeof state
  for (const [currency, modId] of [
    ['transmutation', 'prefix1'],
    ['augmentation', 'suffix1'],
    ['regal', 'prefix2'],
    ['exalted', 'suffix2'],
  ] as const) {
    const next = applyCraftStep(catalog, current, {
      currency,
      modIds: [modId],
      rolls: [{ modId, values: [5] }],
    })
    if (!next.ok) throw Error(next.error)
    current = next.value
  }
  expect(
    applyCraftStep(catalog, current, {
      currency: 'chaos',
      removeModId: 'prefix1',
      modIds: ['suffix3'],
      rolls: [{ modId: 'suffix3', values: [5] }],
    }).ok,
  ).toBe(false)
  const next = applyCraftStep(catalog, current, {
    currency: 'chaos',
    removeModId: 'prefix1',
    modIds: ['prefix3'],
    rolls: [{ modId: 'prefix3', values: [8] }],
  })
  expect(next.ok).toBe(true)
  if (!next.ok) throw Error(next.error)
  expect(
    applyCraftStep(catalog, next.value, {
      currency: 'annulment',
      removeModId: 'prefix3',
      modIds: [],
    }).ok,
  ).toBe(true)
})
it('点金强制二前二后，破裂和神圣保留合法四组', () => {
  const { catalog, state } = fixture()
  const normal = { ...state, rarity: 'normal' as const }
  const ids = ['prefix1', 'prefix2', 'suffix1', 'suffix2']
  const alchemy = applyCraftStep(catalog, normal, {
    currency: 'alchemy',
    modIds: ids,
    rolls: ids.map((modId) => ({ modId, values: [5] })),
  })
  if (!alchemy.ok) throw Error(alchemy.error)
  const lock = applyCraftStep(catalog, alchemy.value, { kind: 'fracture', modId: 'prefix1' })
  expect(lock.ok).toBe(true)
  if (!lock.ok) throw Error(lock.error)
  const divine = applyCraftStep(catalog, lock.value, {
    currency: 'divine',
    modIds: [],
    rolls: ids.filter((id) => id !== 'prefix1').map((modId) => ({ modId, values: [8] })),
  })
  expect(divine.ok).toBe(true)
  expect(
    applyCraftStep(catalog, normal, {
      currency: 'alchemy',
      modIds: ['prefix1', 'prefix2', 'prefix3', 'suffix1'],
    }).ok,
  ).toBe(false)
})
it('目录资格隔离普通装备，珠宝不因动态标签混入普通池', () => {
  const { catalog, base } = fixture()
  const mod = catalog.modifiers[0]
  if (!mod) throw Error('fixture')
  expect(hasCraftModEligibility({ ...base, type: 'Helmet' }, mod, ['intjewel'])).toBe(false)
  const ordinary = { ...mod }
  delete ordinary.jewelOnly
  expect(
    hasCraftModEligibility(base, { ...ordinary, eligibility: [{ tag: 'default', value: 1 }] }),
  ).toBe(false)
})
it('来源缺失、范围与特殊品质珠宝保持明确拒绝', () => {
  const { catalog, state, base } = fixture()
  expect(createCraftState(catalog, { ...state, quality: 20 }).ok).toBe(false)
  base.subType = 'Radius'
  expect(createCraftState(catalog, state).ok).toBe(false)
  delete base.subType
  catalog._meta.sources = []
  expect(createCraftState(catalog, state).ok).toBe(false)
})
it('目标提示识别二词缀侧已满，多步路线只能到合法四组并真实回放', () => {
  const { catalog, state } = fixture()
  state.affixes = boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2']).affixes
  const advice = analyzeCraftTargets(catalog, state, ['prefix3'])
  expect(advice.ok && advice.value.targets[0]?.reasons).toContain(
    '当前前缀位置已满，需要先移除词缀。',
  )
  const result = planCraftTargetRoutes(catalog, state, ['prefix1', 'prefix3', 'suffix1', 'suffix2'])
  expect(result.ok && result.value.routes.length > 0).toBe(true)
  if (!result.ok) throw Error(result.error)
  for (const route of result.value.routes) {
    let current = state
    for (const step of route.steps) {
      const next = applyCraftStep(catalog, current, step.operation)
      if (!next.ok) throw Error(next.error)
      expect(next.value).toEqual(step.state)
      current = next.value
    }
    expect(current.affixes).toHaveLength(4)
  }
})
