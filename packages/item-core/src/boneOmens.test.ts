import { expect, it } from 'vitest'
import { applyBoneCraft, prepareDesecration } from './boneCraft'
import { boneCatalog, boneState } from './boneTestFixture'
import { compareCraftStates } from './comparison'

it('方向与巫妖组合限制满六移除池，固化pending及同族三项', () => {
  const catalog = boneCatalog('Ring')
  const start = boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])
  const config = { directionOmen: 'dextral_necromancy' as const, lichOmen: 'liege' as const }
  const prepared = prepareDesecration(catalog, start, 'preserved_collarbone', config)
  expect(prepared.ok && prepared.value.removableAffixes.map((a) => a.modId)).toEqual([
    'suffix1',
    'suffix2',
    'suffix3',
  ])
  const applied = applyBoneCraft(catalog, start, {
    kind: 'desecrate',
    boneId: 'preserved_collarbone',
    affixKind: 'suffix',
    removeModId: 'suffix1',
    ...config,
  })
  expect(applied).toMatchObject({
    ok: true,
    value: { pendingDesecration: { ...config, kind: 'suffix' } },
  })
  if (!applied.ok) return
  expect(
    applyBoneCraft(catalog, applied.value, {
      kind: 'desecration-offer',
      modIds: ['exclusive1', 'exclusive2', 'exclusive3'],
    }).ok,
  ).toBe(true)
})

import { desecrationCandidates } from './boneCraft'
import type { BoneLichOmen } from './boneOmens'
import { isBoneCraftOperation, isPendingDesecration } from './boneRules'
import { createCraftState } from './rehearsal'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('合成夹具缺失')
  return value
}
function lichCatalog() {
  const catalog = boneCatalog('Ring')
  for (const [id, tag] of [
    ['exclusive1', 'amanamu_mod'],
    ['exclusive2', 'ulaman_mod'],
    ['exclusive3', 'kurgal_mod'],
  ])
    required(catalog.modifiers.find((mod) => mod.id === id)).tags = [required(tag)]
  return catalog
}
it.each([
  ['liege', 'exclusive1'],
  ['sovereign', 'exclusive2'],
  ['blackblooded', 'exclusive3'],
] as const)('%s限定同族三项且可选择其中任意项', (lichOmen, id) => {
  const catalog = boneCatalog('Ring')
  const tag = { liege: 'amanamu_mod', sovereign: 'ulaman_mod', blackblooded: 'kurgal_mod' }[
    lichOmen
  ]
  for (const mod of catalog.modifiers) if (mod.desecratedOnly) mod.tags = [tag]
  const applied = applyBoneCraft(catalog, boneState(), {
    kind: 'desecrate',
    boneId: 'preserved_collarbone',
    affixKind: 'suffix',
    lichOmen,
  })
  if (!applied.ok) throw new Error(applied.error)
  expect(desecrationCandidates(catalog, applied.value).some((mod) => mod.id === 'suffix1')).toBe(
    false,
  )
  expect(
    applyBoneCraft(catalog, applied.value, {
      kind: 'desecration-offer',
      modIds: ['suffix1', 'suffix2', 'suffix3'],
    }).ok,
  ).toBe(false)
  const offered = applyBoneCraft(catalog, applied.value, {
    kind: 'desecration-offer',
    modIds: ['exclusive1', 'exclusive2', 'exclusive3'],
  })
  if (!offered.ok) throw new Error(offered.error)
  const revealed = applyBoneCraft(catalog, offered.value, {
    kind: 'desecration-reveal',
    modId: id,
    values: [7],
  })
  expect(revealed).toMatchObject({
    ok: true,
    value: { affixes: [{ modId: id, desecrated: true }] },
  })
  expect(revealed.ok && revealed.value.pendingDesecration).toBeUndefined()
  const tampered = {
    ...offered.value,
    pendingDesecration: {
      ...required(offered.value.pendingDesecration),
      options: ['suffix1', 'suffix2', 'suffix3'],
    },
  }
  expect(createCraftState(catalog, tampered).ok).toBe(false)
  expect(
    applyBoneCraft(catalog, tampered, { kind: 'desecration-reveal', modId: 'suffix1', values: [7] })
      .ok,
  ).toBe(false)
  if (offered.value.pendingDesecration) {
    const cloned = createCraftState(catalog, offered.value)
    if (cloned.ok) cloned.value.pendingDesecration?.options?.push('other')
    expect(offered.value.pendingDesecration.options).toHaveLength(3)
  }
})
it('两方向约束侧和满六移除，不满六不允许删除，护甲仅禁巫妖不禁方向', () => {
  const catalog = boneCatalog()
  const extra = required(catalog.modifiers.find((mod) => mod.id === 'prefix4'))
  catalog.modifiers.push({ ...extra, id: 'prefix5', group: 'prefix5', lines: ['prefix5 (1-10)'] })
  const state = boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])
  const prepared = prepareDesecration(catalog, state, 'preserved_rib', {
    directionOmen: 'sinistral_necromancy',
  })
  expect(prepared.ok && prepared.value.removableAffixes.map((a) => a.modId)).toEqual([
    'prefix1',
    'prefix2',
    'prefix3',
  ])
  expect(
    applyBoneCraft(catalog, state, {
      kind: 'desecrate',
      boneId: 'preserved_rib',
      affixKind: 'suffix',
      removeModId: 'suffix1',
      directionOmen: 'sinistral_necromancy',
    }).ok,
  ).toBe(false)
  expect(
    applyBoneCraft(catalog, boneState(), {
      kind: 'desecrate',
      boneId: 'preserved_rib',
      affixKind: 'prefix',
      removeModId: 'prefix1',
      directionOmen: 'sinistral_necromancy',
    }).ok,
  ).toBe(false)
  for (const lichOmen of ['liege', 'sovereign', 'blackblooded'] as BoneLichOmen[])
    expect(prepareDesecration(catalog, boneState(), 'preserved_rib', { lichOmen }).ok).toBe(false)
})
it('同族候选遵守资格、动态标签、物等、最高档回退且不接受普通伪标签', () => {
  const catalog = boneCatalog('Ring')
  const first = required(catalog.modifiers.find((mod) => mod.id === 'exclusive1'))
  first.level = 70
  expect(
    prepareDesecration(catalog, boneState(), 'preserved_collarbone', { lichOmen: 'liege' }).ok,
  ).toBe(false)
  first.level = 10
  first.eligibility = [
    { tag: 'blocked', value: 0 },
    { tag: 'default', value: 1 },
  ]
  required(catalog.modifiers.find((mod) => mod.id === 'prefix1')).addsTags = ['blocked']
  expect(
    prepareDesecration(catalog, boneState(['prefix1']), 'preserved_collarbone', {
      lichOmen: 'liege',
    }).ok,
  ).toBe(false)
  first.eligibility = [{ tag: 'default', value: 0 }]
  required(catalog.modifiers.find((mod) => mod.id === 'suffix1')).tags = ['amanamu_mod']
  expect(
    prepareDesecration(catalog, boneState(), 'preserved_collarbone', { lichOmen: 'liege' }).ok,
  ).toBe(false)
  first.eligibility = [{ tag: 'default', value: 1 }]
  catalog.modifiers.push({ ...first, id: 'exclusiveHigher', level: 50 })
  const ancient = applyBoneCraft(catalog, boneState(), {
    kind: 'desecrate',
    boneId: 'ancient_collarbone',
    affixKind: 'suffix',
    lichOmen: 'liege',
  })
  if (!ancient.ok) throw new Error(ancient.error)
  expect(desecrationCandidates(catalog, ancient.value).map((mod) => mod.id)).toEqual([
    'exclusive2',
    'exclusive3',
    'exclusiveHigher',
  ])
  expect(
    prepareDesecration(catalog, boneState(), 'preserved_collarbone', { lichOmen: 'liege' }).ok,
  ).toBe(true)
})
it('严格拒绝空/undefined/未知/同类数组/额外键，外来pending也核对侧和保证', () => {
  const catalog = lichCatalog()
  for (const extra of [
    { directionOmen: undefined },
    { directionOmen: '' },
    { directionOmen: 'unknown' },
    { directionOmen: ['sinistral_necromancy', 'dextral_necromancy'] },
    { lichOmen: undefined },
    { lichOmen: '' },
    { lichOmen: ['liege', 'sovereign'] },
    { omens: ['liege'] },
    { lichOmen: 'amanamu_mod' },
  ]) {
    expect(
      isBoneCraftOperation({
        kind: 'desecrate',
        boneId: 'preserved_collarbone',
        affixKind: 'suffix',
        ...extra,
      }),
    ).toBe(false)
    expect(isPendingDesecration({ boneId: 'preserved_collarbone', kind: 'suffix', ...extra })).toBe(
      false,
    )
  }
  expect(
    createCraftState(catalog, {
      ...boneState(),
      pendingDesecration: {
        boneId: 'preserved_collarbone',
        kind: 'prefix',
        directionOmen: 'dextral_necromancy',
      },
    }).ok,
  ).toBe(false)
  expect(
    createCraftState(catalog, {
      ...boneState(),
      pendingDesecration: { boneId: 'preserved_collarbone', kind: 'prefix', lichOmen: 'liege' },
    }).ok,
  ).toBe(false)
  expect(
    prepareDesecration(catalog, boneState(), 'preserved_collarbone', {
      directionOmen: 'sinistral_necromancy',
      lichOmen: 'liege',
    }).ok,
  ).toBe(false)
})

it('巫妖候选仅同一家族，否定混合普通候选，少于三项明确工具边界', () => {
  const catalog = boneCatalog('Ring')
  const applied = applyBoneCraft(catalog, boneState(), {
    kind: 'desecrate',
    boneId: 'preserved_collarbone',
    affixKind: 'suffix',
    lichOmen: 'liege',
  })
  if (!applied.ok) throw new Error(applied.error)
  expect(desecrationCandidates(catalog, applied.value).map((mod) => mod.id)).toEqual([
    'exclusive1',
    'exclusive2',
    'exclusive3',
  ])
  expect(
    applyBoneCraft(catalog, applied.value, {
      kind: 'desecration-offer',
      modIds: ['exclusive1', 'suffix1', 'suffix2'],
    }).ok,
  ).toBe(false)
  for (const count of [0, 1, 2]) {
    const small = {
      ...catalog,
      modifiers: catalog.modifiers.filter(
        (mod) => !mod.desecratedOnly || Number(mod.id.at(-1)) <= count,
      ),
    }
    const result = prepareDesecration(small, boneState(), 'preserved_collarbone', {
      lichOmen: 'liege',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('本工具暂不支持不足三项的巫妖候选情形')
  }
})

it('Ancient先按巫妖限定合法池，其他家族和普通高档不阻断本族最高档回退', () => {
  const catalog = boneCatalog('Ring')
  const first = required(catalog.modifiers.find((mod) => mod.id === 'exclusive1'))
  const { desecratedOnly: _, ...ordinary } = first
  catalog.modifiers.push(
    { ...first, id: 'otherLichHigher', level: 50, tags: ['ulaman_mod'] },
    { ...ordinary, id: 'ordinaryHigher', level: 60 },
  )
  const result = applyBoneCraft(catalog, boneState(), {
    kind: 'desecrate',
    boneId: 'ancient_collarbone',
    affixKind: 'suffix',
    lichOmen: 'liege',
  })
  expect(result.ok).toBe(true)
  if (result.ok)
    expect(desecrationCandidates(catalog, result.value).map((mod) => mod.id)).toEqual([
      'exclusive1',
      'exclusive2',
      'exclusive3',
    ])
})

it('pending比较包含两类预兆且保持深复制和键序等价', () => {
  const catalog = boneCatalog('Ring')
  const pending = {
    boneId: 'preserved_collarbone' as const,
    kind: 'suffix' as const,
    options: ['exclusive1', 'exclusive2', 'exclusive3'],
  }
  const before = { ...boneState(), pendingDesecration: pending }
  for (const config of [
    { directionOmen: 'dextral_necromancy' as const },
    { lichOmen: 'liege' as const },
  ]) {
    const after = { ...boneState(), pendingDesecration: { ...pending, ...config } }
    const result = compareCraftStates(catalog, before, after)
    expect(result).toMatchObject({
      ok: true,
      value: { pendingDesecration: { before: pending, after: after.pendingDesecration } },
    })
    if (result.ok) result.value.pendingDesecration?.after?.options?.push('changed')
    expect(after.pendingDesecration.options).toHaveLength(3)
    const equal = compareCraftStates(catalog, after, {
      ...after,
      pendingDesecration: { ...config, ...pending },
    })
    if (!equal.ok) throw new Error(equal.error)
    expect(equal.value).not.toHaveProperty('pendingDesecration')
  }
})
