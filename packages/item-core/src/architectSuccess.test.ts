import { expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { compareCraftStates } from './comparison'
import { collectCraftCosts } from './craftCosts'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { type CraftState, createCraftState } from './rehearsal'
import { estimateResistances } from './resistances'
import { estimateWeaponStats } from './weaponStats'

const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw Error(r.error)
  return r.value
}
const initial: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'normal',
  sourceText: null,
  affixes: [],
}
const success = (modId: string, values: number[]) =>
  ({ kind: 'architect', outcome: 'enchant', modId, values }) as unknown as CraftStep

it('建筑师成功追加第一或第二组，保留其他属性并仅计一次费用，二重状态拒绝重复尝试', () => {
  const first = must(
    applyCraftStep(catalog, initial, {
      kind: 'vaal',
      outcome: 'enchant',
      modId: 'CorruptionChaosResistance1',
      values: [15],
    }),
  )
  const operation = success('CorruptionAllResistances1', [10])
  const state = must(applyCraftStep(catalog, first, operation))
  expect(state).toMatchObject({
    twiceCorrupted: true,
    corruption: first.corruption,
    secondCorruption: {
      modId: 'CorruptionAllResistances1',
      lines: ['+10(5-10)% to all Elemental Resistances'],
    },
    affixes: [],
    sourceText: null,
  })
  expect(first).not.toHaveProperty('secondCorruption')
  expect(must(compareCraftStates(catalog, first, state))).toMatchObject({
    twiceCorrupted: { before: false, after: true },
    secondCorruption: { before: null, after: { modId: 'CorruptionAllResistances1' } },
  })
  expect(estimateResistances(catalog, state).fireResistance).toEqual({ ok: true, value: 10 })
  expect(estimateResistances(catalog, state).chaosResistance).toEqual({ ok: true, value: 15 })
  expect(must(collectCraftCosts(catalog, [operation]))).toEqual([
    { id: 'currency:architect', name: "Architect's Orb", count: 1 },
  ])
  for (const step of [operation, { kind: 'architect', outcome: 'destroy' }])
    expect(applyCraftStep(catalog, state, step as CraftStep)).toMatchObject({
      ok: false,
      error: expect.stringContaining('二重'),
    })
  const noEnchant = must(applyCraftStep(catalog, initial, { kind: 'vaal', outcome: 'unchanged' }))
  const one = must(applyCraftStep(catalog, noEnchant, operation))
  expect(one).toMatchObject({
    twiceCorrupted: true,
    corruption: { modId: 'CorruptionAllResistances1' },
  })
  expect(one).not.toHaveProperty('secondCorruption')
})

it('双组同时参与武器面板与已有孔镶嵌，显式词缀和品质不变', () => {
  const input: CraftState = { ...initial, baseId: 'Crude Bow', quality: 20, sockets: [null] }
  const one = must(
    applyCraftStep(catalog, input, {
      kind: 'vaal',
      outcome: 'enchant',
      modId: 'CorruptionLocalAddedChaosDamage1',
      values: [7, 12],
    }),
  )
  const two = must(
    applyCraftStep(catalog, one, success('CorruptionLocalIncreasedAttackSpeed1', [8])),
  )
  const panel = must(estimateWeaponStats(catalog, two))
  expect(panel.damage.Chaos).toMatchObject({ min: 7, max: 12, corruptionMin: 7, corruptionMax: 12 })
  expect(panel.attackSpeed.value).toBe(Math.round(panel.attackSpeed.base * 108) / 100)
  expect(panel.chaosDps).toBe(9.5 * panel.attackSpeed.value)
  const socketed = must(
    applyCraftStep(catalog, two, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: 'pob2:augment:["Desert Rune","weapon"]',
    }),
  )
  expect(socketed).toMatchObject({
    twiceCorrupted: true,
    quality: 20,
    affixes: [],
    corruption: two.corruption,
  })
  expect(must(estimateWeaponStats(catalog, socketed)).chaosDps).toBe(panel.chaosDps)
})

it('新组遵守生成方向；导入的显示顺序只要求存在一个可行生成顺序', () => {
  const directional = {
    ...catalog,
    corruptions: (catalog.corruptions ?? []).map((mod) =>
      mod.id === 'CorruptionChaosResistance1'
        ? { ...mod, addsTags: ['test_no_fire'] }
        : mod.id === 'CorruptionAllResistances1'
          ? {
              ...mod,
              eligibility: [{ tag: 'test_no_fire', value: 0 as const }, ...mod.eligibility],
            }
          : mod,
    ),
  }
  const first = must(
    applyCraftStep(directional, initial, {
      kind: 'vaal',
      outcome: 'enchant',
      modId: 'CorruptionChaosResistance1',
      values: [15],
    }),
  )
  expect(applyCraftStep(directional, first, success('CorruptionAllResistances1', [10])).ok).toBe(
    false,
  )
  const other = must(
    applyCraftStep(directional, initial, {
      kind: 'vaal',
      outcome: 'enchant',
      modId: 'CorruptionAllResistances1',
      values: [10],
    }),
  )
  const two = must(applyCraftStep(directional, other, success('CorruptionChaosResistance1', [15])))
  const extended = two as CraftState & { secondCorruption: CraftState['corruption'] }
  expect(
    createCraftState(directional, {
      ...two,
      corruption: extended.secondCorruption,
      secondCorruption: two.corruption,
    } as CraftState).ok,
  ).toBe(true)
})

it('拒绝重复腐化组、越界数值、低物等以及不完整或伪造的二重状态', () => {
  const first = must(
    applyCraftStep(catalog, initial, {
      kind: 'vaal',
      outcome: 'enchant',
      modId: 'CorruptionChaosResistance1',
      values: [15],
    }),
  )
  for (const operation of [
    success('CorruptionChaosResistance1', [16]),
    success('CorruptionAllResistances1', [11]),
    {
      kind: 'architect',
      outcome: 'enchant',
      modId: 'CorruptionAllResistances1',
      values: [10],
      omen: 'x',
    },
  ])
    expect(applyCraftStep(catalog, first, operation as CraftStep).ok).toBe(false)
  const highLevel = {
    ...catalog,
    corruptions: (catalog.corruptions ?? []).map((m) => ({ ...m, level: 10 })),
  }
  expect(
    applyCraftStep(
      highLevel,
      { ...initial, corrupted: true, itemLevel: 1 },
      success('CorruptionAllResistances1', [10]),
    ).ok,
  ).toBe(false)
  for (const patch of [
    { twiceCorrupted: false },
    { twiceCorrupted: undefined },
    { twiceCorrupted: true, corrupted: undefined },
    { secondCorruption: first.corruption },
    { twiceCorrupted: true, secondCorruption: first.corruption },
    { twiceCorrupted: true, corruption: undefined },
    {
      twiceCorrupted: true,
      secondCorruption: {
        modId: 'CorruptionAllResistances1',
        lines: ['+10% to all Elemental Resistances'],
        extra: true,
      },
    },
  ])
    expect(createCraftState(catalog, { ...first, ...patch } as unknown as CraftState).ok).toBe(
      false,
    )
})
