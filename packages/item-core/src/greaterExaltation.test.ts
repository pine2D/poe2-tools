import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import { jewelFixture } from './jewelTestFixture'
import { craftOmenMaterials } from './omens'
import { craftCandidates, prepareCraftOperation } from './rehearsal'
import { analyzeCraftTargets } from './targets'

function rolled(modIds: string[]) {
  return { modIds, rolls: modIds.map((modId) => ({ modId, values: [5] })) }
}

it.each(['exalted', 'greater_exalted', 'perfect_exalted'] as const)(
  '%s 强效新增两组并保持原组与数值',
  (currency) => {
    const catalog = boneCatalog()
    const state = boneState(['prefix1', 'suffix1'])
    const r = prepareCraftOperation(catalog, state, currency, undefined, 'greater_exaltation')
    expect(r.ok && r.value.count).toBe(2)
    const step = {
      currency,
      omen: 'greater_exaltation' as const,
      modIds: ['prefix2', 'suffix2'],
      rolls: [
        { modId: 'prefix2', values: [7] },
        { modId: 'suffix2', values: [3] },
      ],
    }
    const added = applyCraftStep(catalog, state, step)
    expect(added.ok && added.value.affixes.slice(0, 2)).toEqual(state.affixes)
    expect(added.ok && added.value.affixes.length).toBe(4)
    expect(
      applyCraftStep(catalog, state, {
        ...step,
        modIds: ['prefix2'],
        rolls: step.rolls.slice(0, 1),
      }).ok,
    ).toBe(false)
    expect(applyCraftStep(catalog, state, { ...step, modIds: ['prefix2', 'prefix2'] }).ok).toBe(
      false,
    )
  },
)
it.each([
  ['greater_sinistral_exaltation', 'prefix'],
  ['greater_dextral_exaltation', 'suffix'],
] as const)('%s 两条限定同侧，不能越过容量', (omen, side) => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'suffix1'])
  const prepared = prepareCraftOperation(catalog, state, 'exalted', undefined, omen)
  expect(prepared.ok).toBe(true)
  expect(craftCandidates(catalog, state, 'exalted', omen).every((m) => m.kind === side)).toBe(true)
  const modIds = [`${side}2`, `${side}3`]
  expect(applyCraftStep(catalog, state, { currency: 'exalted', omen, ...rolled(modIds) }).ok).toBe(
    true,
  )
  expect(
    applyCraftStep(catalog, state, { currency: 'exalted', omen, ...rolled(['prefix2', 'suffix2']) })
      .ok,
  ).toBe(false)
  expect(craftOmenMaterials(omen)).toHaveLength(2)
  expect(
    prepareCraftOperation(catalog, boneState([`${side}1`, `${side}2`]), 'exalted', undefined, omen),
  ).toMatchObject({ ok: false, error: expect.stringContaining('两个') })
})
it('珠宝尊重两前两后，已破裂和亵渎组不被重置', () => {
  const { catalog, state } = jewelFixture()
  state.affixes = boneState(['prefix1', 'suffix1']).affixes
  const first = state.affixes[0]
  if (!first) throw Error('缺少测试词缀')
  first.fractured = true
  const next = applyCraftStep(catalog, state, {
    currency: 'exalted',
    omen: 'greater_exaltation',
    ...rolled(['prefix2', 'suffix2']),
  })
  expect(next.ok && next.value.affixes[0]?.fractured).toBe(true)
  expect(
    prepareCraftOperation(catalog, state, 'exalted', undefined, 'greater_sinistral_exaltation').ok,
  ).toBe(false)
  const ordinary = boneCatalog()
  const imported = boneState(['prefix1', 'suffix1'])
  const revealed = imported.affixes[1]
  if (!revealed) throw Error('缺少测试词缀')
  revealed.desecrated = true
  const r = applyCraftStep(ordinary, imported, {
    currency: 'exalted',
    omen: 'greater_exaltation',
    ...rolled(['prefix2', 'suffix2']),
  })
  expect(r.ok && r.value.affixes[1]?.desecrated).toBe(true)
})
it('目标建议保留双选数量，高档两组均遵守原最低等级规则', () => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'suffix1'])
  const advice = analyzeCraftTargets(
    catalog,
    state,
    ['prefix2', 'prefix3'],
    undefined,
    undefined,
    'greater_sinistral_exaltation',
  )
  expect(advice.ok && advice.value.steps.some((s) => s.remainingChoices === 2)).toBe(true)
  expect(prepareCraftOperation(catalog, state, 'chaos', 'prefix1', 'greater_exaltation').ok).toBe(
    false,
  )
})

it('两次新增均检查当前族的最低档位限制与同组冲突', () => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'suffix1'])
  for (const side of ['prefix', 'suffix']) {
    const low = catalog.modifiers.find((m) => m.id === `${side}2`)
    const high = catalog.modifiers.find((m) => m.id === `${side}3`)
    if (!low || !high) throw Error('缺少测试项')
    high.group = low.group
    high.level = 55
  }
  const base = { currency: 'perfect_exalted' as const, omen: 'greater_exaltation' as const }
  expect(applyCraftStep(catalog, state, { ...base, ...rolled(['prefix3', 'suffix3']) }).ok).toBe(
    true,
  )
  expect(applyCraftStep(catalog, state, { ...base, ...rolled(['prefix3', 'suffix2']) }).ok).toBe(
    false,
  )
  expect(applyCraftStep(catalog, state, { ...base, ...rolled(['prefix3', 'prefix2']) }).ok).toBe(
    false,
  )
})
