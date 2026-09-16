import { expect, it } from 'vitest'
import { desecrationCandidates } from './boneCraft'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep, type CraftStep } from './craftSteps'
import type { CraftState } from './rehearsal'

it('少词缀稀有装备腐化为六槽，依次揭示前三后三且输入不变', () => {
  const catalog = boneCatalog()
  // 每侧至少五族，确保最后一个槽位仍能固定三项。
  for (const kind of ['prefix', 'suffix'] as const) {
    const mod = required(catalog.modifiers.find((entry) => entry.id === `${kind}4`))
    catalog.modifiers.push({ ...mod, id: `${kind}5`, group: `${kind}5` })
  }
  let state = boneState(['prefix1', 'prefix2', 'suffix1'])
  const run = (step: CraftStep) => {
    const before = structuredClone(state)
    const result = applyCraftStep(catalog, state, step)
    expect(state).toEqual(before)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    state = result.value
  }
  run({ kind: 'putrefy', boneId: 'preserved_rib' } as CraftStep)
  expect(state).toMatchObject({
    corrupted: true,
    affixes: [],
    pendingDesecration: { putrefaction: { prefix: 3, suffix: 3 } },
  })
  for (const kind of ['prefix', 'prefix', 'prefix', 'suffix', 'suffix', 'suffix']) {
    expect(state.pendingDesecration?.kind).toBe(kind)
    const options = desecrationCandidates(catalog, state).slice(0, 3)
    expect(options).toHaveLength(3)
    expect(options.every((mod) => !mod.desecratedOnly)).toBe(true)
    run({ kind: 'desecration-offer', modIds: options.map((mod) => mod.id) })
    run({ kind: 'desecration-reveal', modId: required(options[0]).id, values: [5] })
  }
  expect(state.affixes).toHaveLength(6)
  expect(state.affixes.every((affix) => !affix.desecrated)).toBe(true)
  expect(state).not.toHaveProperty('pendingDesecration')
})

it('破裂身份保留、珠宝四槽及严格计数、固定选项验证', async () => {
  const { preparePutrefaction } = await import('./putrefaction')
  const { createCraftState } = await import('./rehearsal')
  const { JEWEL_SOURCE } = await import('./jewels')
  const catalog = boneCatalog()
  const start: CraftState = {
    ...boneState(['prefix1', 'suffix1']),
    affixes: [
      { modId: 'prefix1', affixId: 'a1', lines: ['prefix1 5'], fractured: true },
      { modId: 'suffix1', affixId: 'a2', lines: ['suffix1 5'] },
    ],
    nextAffixId: 3,
  }
  const prepared = preparePutrefaction(catalog, start, 'preserved_rib')
  expect(prepared).toMatchObject({
    ok: true,
    value: {
      slots: { prefix: 2, suffix: 3 },
      retainedAffixes: [start.affixes[0]],
      removedAffixes: [start.affixes[1]],
    },
  })
  const applied = applyCraftStep(catalog, boneState(), { kind: 'putrefy', boneId: 'preserved_rib' })
  if (!applied.ok) throw new Error(applied.error)
  const state = applied.value
  const pending = required(state.pendingDesecration)
  for (const patch of [
    { putrefaction: { prefix: 2, suffix: 3 } },
    { putrefaction: { prefix: 3, suffix: 3, extra: 1 } },
    { putrefaction: { prefix: 3.5, suffix: 3 } },
    { kind: 'suffix' },
    { options: ['exclusive1', 'exclusive2', 'exclusive3'] },
  ])
    expect(
      createCraftState(catalog, {
        ...state,
        pendingDesecration: { ...pending, ...patch },
      } as CraftState).ok,
    ).toBe(false)
  const clone = createCraftState(catalog, state)
  if (!clone.ok) throw new Error(clone.error)
  required(required(clone.value.pendingDesecration).putrefaction).prefix = 0
  expect(required(pending.putrefaction).prefix).toBe(3)
  const jewel = boneCatalog('Jewel')
  required(jewel.bases[0]).id = 'Ruby'
  jewel._meta.sources.push(JEWEL_SOURCE)
  expect(
    preparePutrefaction(jewel, { ...boneState(), baseId: 'Ruby' }, 'preserved_cranium'),
  ).toMatchObject({ ok: true, value: { slots: { prefix: 2, suffix: 2 } } })
})

it('逐槽清空回响与选项，拒绝不足候选、越界、来源专属及非法施加', async () => {
  const { preparePutrefaction } = await import('./putrefaction')
  const catalog = boneCatalog()
  for (const boneId of ['ancient_rib', 'gnawed_rib', 'preserved_jawbone'] as const)
    expect(preparePutrefaction(catalog, boneState(), boneId).ok).toBe(false)
  expect(
    preparePutrefaction(catalog, { ...boneState(), corrupted: true }, 'preserved_rib').ok,
  ).toBe(false)
  expect(
    applyCraftStep(catalog, boneState(), {
      kind: 'putrefy',
      boneId: 'preserved_rib',
      extra: 1,
    } as CraftStep).ok,
  ).toBe(false)
  const applied = applyCraftStep(catalog, boneState(), { kind: 'putrefy', boneId: 'preserved_rib' })
  if (!applied.ok) throw new Error(applied.error)
  const offered = applyCraftStep(catalog, applied.value, {
    kind: 'desecration-offer',
    modIds: ['prefix1', 'prefix2', 'prefix3'],
    revealOmen: 'abyssal_echoes',
  })
  if (!offered.ok) throw new Error(offered.error)
  for (const values of [[], [0], [11], [1.5]])
    expect(
      applyCraftStep(catalog, offered.value, {
        kind: 'desecration-reveal',
        modId: 'prefix1',
        values,
      }).ok,
    ).toBe(false)
  const rerolled = applyCraftStep(catalog, offered.value, {
    kind: 'desecration-reroll',
    modIds: ['prefix2', 'prefix3', 'prefix4'],
  })
  if (!rerolled.ok) throw new Error(rerolled.error)
  const next = applyCraftStep(catalog, rerolled.value, {
    kind: 'desecration-reveal',
    modId: 'prefix1',
    values: [5],
  })
  if (!next.ok) throw new Error(next.error)
  expect(next.value.pendingDesecration).toEqual({
    boneId: 'preserved_rib',
    kind: 'prefix',
    putrefaction: { prefix: 2, suffix: 3 },
  })
  expect(
    applyCraftStep(catalog, next.value, {
      kind: 'desecration-reroll',
      modIds: ['prefix2', 'prefix3', 'prefix4'],
    }).ok,
  ).toBe(false)
  expect(desecrationCandidates(catalog, next.value).some((mod) => mod.id === 'prefix1')).toBe(false)
  const limited = {
    ...catalog,
    modifiers: catalog.modifiers.filter((mod) => !['prefix3', 'prefix4'].includes(mod.id)),
  }
  expect(
    applyCraftStep(limited, applied.value, {
      kind: 'desecration-offer',
      modIds: ['prefix1', 'prefix2', 'exclusive1'],
    }).ok,
  ).toBe(false)
})

it('拒绝没有来源、已有亵渎及特殊范围珠宝，保留普通镶嵌与品质', async () => {
  const { preparePutrefaction } = await import('./putrefaction')
  const { JEWEL_SOURCE } = await import('./jewels')
  const catalog = boneCatalog()
  const existing = {
    ...boneState(),
    pendingDesecration: { boneId: 'preserved_rib', kind: 'prefix' },
  } as CraftState
  expect(preparePutrefaction(catalog, existing, 'preserved_rib').ok).toBe(false)
  expect(
    preparePutrefaction(
      catalog,
      { ...boneState(), affixes: [{ modId: 'prefix1', lines: ['prefix1 5'], desecrated: true }] },
      'preserved_rib',
    ).ok,
  ).toBe(false)
  const noSource = { ...catalog, _meta: { ...catalog._meta, sources: [] } }
  expect(preparePutrefaction(noSource, boneState(), 'preserved_rib').ok).toBe(false)
  const radius = boneCatalog('Jewel')
  Object.assign(required(radius.bases[0]), {
    id: 'Time-Lost Ruby',
    subType: 'Radius',
    tags: ['radius_jewel'],
  })
  radius._meta.sources.push(JEWEL_SOURCE)
  expect(
    preparePutrefaction(radius, { ...boneState(), baseId: 'Time-Lost Ruby' }, 'preserved_cranium')
      .ok,
  ).toBe(false)
  const start = {
    ...boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3']),
    quality: 20,
    sockets: [null],
  }
  const applied = applyCraftStep(catalog, start, { kind: 'putrefy', boneId: 'preserved_rib' })
  expect(applied).toMatchObject({
    ok: true,
    value: { quality: 20, sockets: [null], affixes: [], corrupted: true },
  })
})

it('腐烂待揭示状态不可伪造残留工艺属性', async () => {
  const { createCraftState } = await import('./rehearsal')
  const state: CraftState = {
    ...boneState(),
    corrupted: true,
    affixes: [{ modId: 'prefix1', lines: ['prefix1 5'], crafted: true }],
    pendingDesecration: {
      boneId: 'preserved_rib',
      kind: 'prefix',
      putrefaction: { prefix: 2, suffix: 3 },
    },
  }
  expect(createCraftState(boneCatalog(), state).ok).toBe(false)
})

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('合成样本缺失')
  return value
}

it('未证实的双工艺容量符文组合不开放腐烂预兆', async () => {
  const { readFileSync } = await import('node:fs')
  const { preparePutrefaction } = await import('./putrefaction')
  const catalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
  const state: CraftState = {
    baseId: 'Adherent Cuffs',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    affixes: [],
    sockets: [`pob2:augment:${JSON.stringify(["Astrid's Creativity", 'armour'])}`],
  }
  expect(preparePutrefaction(catalog, state, 'preserved_rib').ok).toBe(false)
})
