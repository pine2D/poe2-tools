import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import { applyFracture, prepareFracture } from './fracture'

it('四词缀稀有选择一组破裂，只增锁定标记且不改输入', () => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2'])
  const original = structuredClone(state)
  expect(prepareFracture(catalog, state)).toMatchObject({
    ok: true,
    value: { candidates: state.affixes, unresolvedModIds: [] },
  })
  const result = applyFracture(catalog, state, { kind: 'fracture', modId: 'prefix1' })
  expect(result).toEqual({
    ok: true,
    value: {
      ...state,
      affixes: state.affixes.map((a) => (a.modId === 'prefix1' ? { ...a, fractured: true } : a)),
    },
  })
  expect(state).toEqual(original)
  expect(applyCraftStep(catalog, state, { kind: 'fracture', modId: 'prefix1' })).toEqual(result)
  if (result.ok)
    expect(required(result.value.affixes[0]).lines).not.toBe(required(state.affixes[0]).lines)
})

it('普通移除和定向空池不能移除锁定组，神圣完整参数排除锁定组', async () => {
  const { applyCraftOperation, prepareCraftOperation, removableCraftAffixes } = await import(
    './rehearsal'
  )
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'suffix1'])
  required(state.affixes[0]).fractured = true
  expect(removableCraftAffixes(catalog, state, 'annulment')).toMatchObject({
    ok: true,
    value: [state.affixes[1]],
  })
  expect(removableCraftAffixes(catalog, state, 'annulment', 'sinistral_annulment').ok).toBe(false)
  for (const currency of ['annulment', 'chaos', 'greater_chaos', 'perfect_chaos'] as const)
    expect(
      applyCraftOperation(catalog, state, {
        currency,
        removeModId: 'prefix1',
        modIds: currency === 'annulment' ? [] : ['prefix2'],
      }).ok,
    ).toBe(false)
  expect(
    applyCraftOperation(catalog, state, {
      currency: 'divine',
      modIds: [],
      rolls: [{ modId: 'suffix1', values: [8] }],
    }),
  ).toMatchObject({
    ok: true,
    value: { affixes: [state.affixes[0], { modId: 'suffix1', lines: ['suffix1 8(1-10)'] }] },
  })
  expect(
    applyCraftOperation(catalog, state, {
      currency: 'divine',
      modIds: [],
      rolls: [
        { modId: 'prefix1', values: [5] },
        { modId: 'suffix1', values: [8] },
      ],
    }).ok,
  ).toBe(false)
  expect(
    prepareCraftOperation(catalog, { ...state, affixes: [required(state.affixes[0])] }, 'divine')
      .ok,
  ).toBe(false)
})

it('完美精华和满六骨骼移除池过滤锁定，并且直接apply不能绕过', async () => {
  const { prepareEssenceCraft } = await import('./essenceCraft')
  const { prepareDesecration } = await import('./boneCraft')
  const catalog = boneCatalog()
  catalog._meta.sources.push({ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' })
  const essenceId = 'Metadata/Items/Currency/CurrencyPerfectEssenceLife'
  catalog.essences = [
    {
      id: essenceId,
      name: 'Perfect Essence of Life',
      type: 'Life',
      tierLevel: 1,
      mods: { Helmet: 'prefix4' },
    },
  ]
  const state = boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])
  required(state.affixes[0]).fractured = true
  const essence = prepareEssenceCraft(catalog, state, essenceId)
  expect(essence).toMatchObject({ ok: true })
  if (essence.ok)
    expect(essence.value.removableAffixes.map((a) => a.modId)).toEqual(['prefix2', 'prefix3'])
  expect(
    applyCraftStep(catalog, state, {
      kind: 'essence',
      essenceId,
      removeModId: 'prefix1',
      values: [5],
    }).ok,
  ).toBe(false)
  const bone = prepareDesecration(catalog, state, 'preserved_rib')
  expect(bone.ok).toBe(true)
  if (bone.ok) expect(bone.value.removableAffixes.map((a) => a.modId)).not.toContain('prefix1')
  expect(
    applyCraftStep(catalog, state, {
      kind: 'desecrate',
      boneId: 'preserved_rib',
      affixKind: 'prefix',
      removeModId: 'prefix1',
    }).ok,
  ).toBe(false)
})

it('3加占位与Echoes两个候选阶段破裂后保持配置，其它pending操作不放开', () => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'prefix2', 'prefix3'])
  for (const options of [
    {},
    { options: ['suffix1', 'suffix2', 'suffix3'], revealOmen: 'abyssal_echoes' as const },
    {
      options: ['suffix1', 'suffix2', 'suffix3'],
      revealOmen: 'abyssal_echoes' as const,
      rerollOptions: ['suffix2', 'exclusive1', 'exclusive2'],
    },
  ]) {
    const pending = {
      ...state,
      pendingDesecration: { boneId: 'preserved_rib' as const, kind: 'suffix' as const, ...options },
    }
    const result = applyCraftStep(catalog, pending, { kind: 'fracture', modId: 'prefix1' })
    expect(result).toMatchObject({
      ok: true,
      value: { pendingDesecration: pending.pendingDesecration },
    })
    if (result.ok) {
      expect(result.value.pendingDesecration).not.toBe(pending.pendingDesecration)
      expect(
        applyCraftStep(catalog, result.value, {
          currency: 'annulment',
          removeModId: 'prefix2',
          modIds: [],
        }).ok,
      ).toBe(false)
    }
  }
})

it('未知结果不从候选池消失但不能锁定；亵渎不可选、工艺独立保留', () => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2'])
  required(state.affixes[0]).lines = ['prefix1 (1-10)']
  required(state.affixes[1]).crafted = true
  required(state.affixes[3]).desecrated = true
  const prepared = prepareFracture(catalog, state)
  expect(prepared).toMatchObject({
    ok: true,
    value: { candidates: state.affixes.slice(0, 3), unresolvedModIds: ['prefix1'] },
  })
  expect(applyFracture(catalog, state, { kind: 'fracture', modId: 'prefix1' }).ok).toBe(false)
  expect(applyFracture(catalog, state, { kind: 'fracture', modId: 'suffix2' }).ok).toBe(false)
  const result = applyFracture(catalog, state, { kind: 'fracture', modId: 'prefix2' })
  expect(result).toMatchObject({
    ok: true,
    value: { affixes: expect.arrayContaining([{ ...state.affixes[1], fractured: true }]) },
  })
  if (result.ok) expect(prepareFracture(catalog, result.value).ok).toBe(false)
  expect(prepareFracture(catalog, boneState(['prefix1', 'prefix2', 'suffix1'])).ok).toBe(false)
  expect(prepareFracture(catalog, { ...boneState(), rarity: 'magic' }).ok).toBe(false)
  expect(
    applyFracture(catalog, state, { kind: 'fracture', modId: 'prefix2', extra: true } as never).ok,
  ).toBe(false)
})

it('锁定不释放工艺槽，普通追加与固有神圣保留锁定', async () => {
  const { applyCraftOperation } = await import('./rehearsal')
  const { prepareEssenceCraft } = await import('./essenceCraft')
  const catalog = boneCatalog()
  required(catalog.bases[0]).implicit = 'Implicit (1-10)'
  const state = boneState(['prefix1'])
  required(state.affixes[0]).fractured = true
  required(state.affixes[0]).crafted = true
  const added = applyCraftOperation(catalog, state, { currency: 'exalted', modIds: ['suffix1'] })
  expect(added).toMatchObject({
    ok: true,
    value: { affixes: expect.arrayContaining([state.affixes[0]]) },
  })
  const divine = applyCraftOperation(catalog, state, {
    currency: 'divine',
    modIds: [],
    rolls: [],
    implicitValues: [8],
  })
  expect(divine).toMatchObject({
    ok: true,
    value: { affixes: state.affixes, implicitLines: ['Implicit 8(1-10)'] },
  })
  catalog._meta.sources.push({ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' })
  const essenceId = 'Metadata/Items/Currency/CurrencyPerfectEssenceLife'
  catalog.essences = [
    {
      id: essenceId,
      name: 'Perfect Essence of Life',
      type: 'Life',
      tierLevel: 1,
      mods: { Helmet: 'prefix4' },
    },
  ]
  expect(prepareEssenceCraft(catalog, state, essenceId)).toMatchObject({
    ok: false,
    error: expect.stringContaining('工艺'),
  })
  delete required(state.affixes[0]).crafted
  expect(prepareEssenceCraft(catalog, state, essenceId, 'sinistral_crystallisation').ok).toBe(false)
})

it('目录固定文本可锁定，非网格实值不被生成网格错误收紧', () => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2'])
  required(state.affixes[0]).lines = ['prefix1 5.5']
  expect(applyFracture(catalog, state, { kind: 'fracture', modId: 'prefix1' })).toMatchObject({
    ok: true,
    value: {
      affixes: expect.arrayContaining([
        { modId: 'prefix1', lines: ['prefix1 5.5'], fractured: true },
      ]),
    },
  })
  required(catalog.modifiers[0]).lines = ['Fixed 5']
  required(state.affixes[0]).lines = ['Fixed 5']
  expect(applyFracture(catalog, state, { kind: 'fracture', modId: 'prefix1' }).ok).toBe(true)
})

it('已固定巫妖与方向预兆的pending在破裂后保持合同', () => {
  const catalog = boneCatalog('Ring')
  const state = {
    ...boneState(['prefix1', 'prefix2', 'prefix3']),
    pendingDesecration: {
      boneId: 'preserved_collarbone' as const,
      kind: 'suffix' as const,
      directionOmen: 'dextral_necromancy' as const,
      lichOmen: 'liege' as const,
      options: ['exclusive1', 'exclusive2', 'exclusive3'],
    },
  }
  const fractured = applyCraftStep(catalog, state, { kind: 'fracture', modId: 'prefix1' })
  expect(fractured).toMatchObject({
    ok: true,
    value: { pendingDesecration: state.pendingDesecration },
  })
  if (!fractured.ok) return
  const revealed = applyCraftStep(catalog, fractured.value, {
    kind: 'desecration-reveal',
    modId: 'exclusive1',
    values: [8],
  })
  expect(revealed).toMatchObject({
    ok: true,
    value: {
      affixes: expect.arrayContaining([
        { modId: 'prefix1', lines: ['prefix1 5'], fractured: true },
        { modId: 'exclusive1', lines: ['exclusive1 8(1-10)'], desecrated: true },
      ]),
    },
  })
})
