import { expect, it } from 'vitest'
import { applyBoneCraft } from './boneCraft'
import { boneRevealOmenError } from './boneOmens'
import { type BoneCraftOperation, isBoneCraftOperation, isPendingDesecration } from './boneRules'
import { boneCatalog, boneState } from './boneTestFixture'
import { compareCraftStates } from './comparison'
import { type CraftState, createCraftState } from './rehearsal'

it('首组声明Echoes后可固定第二组，首组不丢且可最终选回', () => {
  const catalog = boneCatalog()
  const pending = applyBoneCraft(catalog, boneState(), {
    kind: 'desecrate',
    boneId: 'preserved_rib',
    affixKind: 'suffix',
  })
  if (!pending.ok) throw new Error(pending.error)
  const offered = applyBoneCraft(catalog, pending.value, {
    kind: 'desecration-offer',
    modIds: ['suffix1', 'suffix2', 'suffix3'],
    revealOmen: 'abyssal_echoes',
  })
  expect(offered.ok).toBe(true)
  if (!offered.ok) return
  const rerolled = applyBoneCraft(catalog, offered.value, {
    kind: 'desecration-reroll',
    modIds: ['suffix2', 'exclusive1', 'exclusive2'],
  })
  expect(rerolled).toMatchObject({
    ok: true,
    value: {
      pendingDesecration: {
        options: ['suffix1', 'suffix2', 'suffix3'],
        revealOmen: 'abyssal_echoes',
        rerollOptions: ['suffix2', 'exclusive1', 'exclusive2'],
      },
    },
  })
  if (!rerolled.ok) return
  const revealed = applyBoneCraft(catalog, rerolled.value, {
    kind: 'desecration-reveal',
    modId: 'suffix1',
    values: [7],
  })
  expect(revealed).toMatchObject({
    ok: true,
    value: { affixes: [{ modId: 'suffix1', lines: ['suffix1 7(1-10)'], desecrated: true }] },
  })
  expect(revealed.ok && revealed.value.pendingDesecration).toBeUndefined()
  expect(offered.value.pendingDesecration?.options).toEqual(['suffix1', 'suffix2', 'suffix3'])
})

it('第二组比较与克隆保留机会和两组，键序等价不误报', () => {
  const catalog = boneCatalog()
  const first = {
    boneId: 'preserved_rib' as const,
    kind: 'suffix' as const,
    options: ['suffix1', 'suffix2', 'suffix3'],
  }
  const before = { ...boneState(), pendingDesecration: first }
  const paid = {
    ...boneState(),
    pendingDesecration: { ...first, revealOmen: 'abyssal_echoes' as const },
  }
  const after = {
    ...boneState(),
    pendingDesecration: {
      ...paid.pendingDesecration,
      rerollOptions: ['suffix2', 'exclusive1', 'exclusive2'],
    },
  }
  expect(compareCraftStates(catalog, before, paid)).toMatchObject({
    ok: true,
    value: { pendingDesecration: { before: first, after: paid.pendingDesecration } },
  })
  const result = compareCraftStates(catalog, paid, after)
  expect(result).toMatchObject({
    ok: true,
    value: {
      pendingDesecration: { before: paid.pendingDesecration, after: after.pendingDesecration },
    },
  })
  if (result.ok) result.value.pendingDesecration?.after?.rerollOptions?.push('changed')
  expect(after.pendingDesecration.rerollOptions).toHaveLength(3)
  const equal = compareCraftStates(catalog, after, {
    ...after,
    pendingDesecration: {
      rerollOptions: [...after.pendingDesecration.rerollOptions],
      revealOmen: 'abyssal_echoes',
      ...first,
    },
  })
  if (!equal.ok) throw new Error(equal.error)
  expect(equal.value).not.toHaveProperty('pendingDesecration')
})

function firstGroup(echoes = true) {
  const catalog = boneCatalog()
  const state: CraftState = {
    ...boneState(),
    pendingDesecration: {
      boneId: 'preserved_rib',
      kind: 'suffix',
      options: ['suffix1', 'suffix2', 'suffix3'],
      ...(echoes ? { revealOmen: 'abyssal_echoes' as const } : {}),
    },
  }
  return { catalog, state }
}
it('首次声明后直接选首组也合法，不能晚补声明或重选两次，失败不改首组', () => {
  const { catalog, state } = firstGroup()
  const snapshot = structuredClone(state)
  expect(
    applyBoneCraft(catalog, state, { kind: 'desecration-reveal', modId: 'suffix2', values: [4] })
      .ok,
  ).toBe(true)
  expect(
    applyBoneCraft(catalog, firstGroup(false).state, {
      kind: 'desecration-reroll',
      modIds: ['suffix1', 'exclusive1', 'exclusive2'],
    }).ok,
  ).toBe(false)
  expect(
    applyBoneCraft(catalog, firstGroup(false).state, {
      kind: 'desecration-offer',
      modIds: ['suffix1', 'exclusive1', 'exclusive2'],
      revealOmen: 'abyssal_echoes',
    }).ok,
  ).toBe(false)
  const next = applyBoneCraft(catalog, state, {
    kind: 'desecration-reroll',
    modIds: ['suffix1', 'exclusive1', 'exclusive2'],
  })
  if (!next.ok) throw new Error(next.error)
  expect(
    applyBoneCraft(catalog, next.value, {
      kind: 'desecration-reroll',
      modIds: ['suffix2', 'exclusive1', 'exclusive2'],
    }).ok,
  ).toBe(false)
  expect(state).toEqual(snapshot)
})
it('两组跨组同ID/同group保持独立，最终仅生成一组且第二组选项深复制', () => {
  const { catalog, state } = firstGroup()
  const mod = catalog.modifiers.find((mod) => mod.id === 'exclusive1')
  if (!mod) throw new Error('fixture')
  mod.group = 'suffix1'
  const checked = createCraftState(catalog, state)
  expect(checked.ok).toBe(true)
  const next = applyBoneCraft(catalog, state, {
    kind: 'desecration-reroll',
    modIds: ['suffix1', 'exclusive1', 'exclusive2'],
  })
  if (!next.ok) throw new Error(next.error)
  const cloned = createCraftState(catalog, next.value)
  if (!cloned.ok) throw new Error(cloned.error)
  cloned.value.pendingDesecration?.rerollOptions?.push('mutated')
  expect(next.value.pendingDesecration?.rerollOptions).toHaveLength(3)
  const done = applyBoneCraft(catalog, next.value, {
    kind: 'desecration-reveal',
    modId: 'exclusive1',
    values: [9],
  })
  expect(done.ok && done.value.affixes).toHaveLength(1)
  expect(done.ok && done.value.affixes[0]?.modId).toBe('exclusive1')
})
it('严格字段依赖和每组三项门禁，外来pending不能伪造机会或池外第二组', () => {
  const { catalog, state } = firstGroup()
  const pending = state.pendingDesecration
  if (!pending) throw new Error('fixture')
  for (const value of [undefined, '', false, 'unknown', [], ['abyssal_echoes']]) {
    expect(
      isBoneCraftOperation({
        kind: 'desecration-offer',
        modIds: ['suffix1', 'suffix2', 'suffix3'],
        revealOmen: value,
      }),
    ).toBe(false)
    expect(isPendingDesecration({ ...pending, revealOmen: value })).toBe(false)
  }
  for (const modIds of [
    [],
    ['suffix1'],
    ['suffix1', 'suffix1', 'suffix2'],
    ['suffix1', 'suffix2', ''],
    ['suffix1', 'suffix2', 'suffix3', 'suffix4'],
  ]) {
    expect(isBoneCraftOperation({ kind: 'desecration-reroll', modIds })).toBe(false)
    expect(isPendingDesecration({ ...pending, rerollOptions: modIds })).toBe(false)
  }
  expect(
    isPendingDesecration({ boneId: 'preserved_rib', kind: 'suffix', revealOmen: 'abyssal_echoes' }),
  ).toBe(false)
  expect(
    isPendingDesecration({
      boneId: 'preserved_rib',
      kind: 'suffix',
      options: ['suffix1', 'suffix2', 'suffix3'],
      rerollOptions: ['suffix1', 'suffix2', 'suffix3'],
    }),
  ).toBe(false)
  expect(isPendingDesecration({ ...pending, rerollOptions: undefined })).toBe(false)
  for (const step of [
    {
      kind: 'desecration-reroll',
      modIds: ['suffix1', 'suffix2', 'suffix3'],
      revealOmen: 'abyssal_echoes',
    },
    { kind: 'desecration-reveal', modId: 'suffix1', values: [1], revealOmen: 'abyssal_echoes' },
    {
      kind: 'desecrate',
      boneId: 'preserved_rib',
      affixKind: 'suffix',
      revealOmen: 'abyssal_echoes',
    },
  ])
    expect(isBoneCraftOperation(step)).toBe(false)
  const forged = {
    ...state,
    pendingDesecration: { ...pending, rerollOptions: ['suffix1', 'prefix1', 'exclusive1'] },
  }
  expect(createCraftState(catalog, forged).ok).toBe(false)
  expect(
    applyBoneCraft(catalog, forged, { kind: 'desecration-reveal', modId: 'suffix1', values: [1] })
      .ok,
  ).toBe(false)
  expect(
    applyBoneCraft(catalog, state, {
      kind: 'desecration-reroll',
      modIds: ['suffix1', 'prefix1', 'exclusive1'],
    }).ok,
  ).toBe(false)
  const late = { ...pending, options: undefined }
  expect(
    createCraftState(catalog, { ...state, pendingDesecration: late } as unknown as CraftState).ok,
  ).toBe(false)
  const invalid = {
    kind: 'desecration-reroll',
    modIds: ['suffix1', 'suffix2', 'suffix3'],
    extra: true,
  }
  expect(applyBoneCraft(catalog, state, invalid as unknown as BoneCraftOperation).ok).toBe(false)
})
it.each([
  ['Helmet', 'gnawed_rib'],
  ['Helmet', 'preserved_rib'],
  ['Ring', 'gnawed_collarbone'],
  ['Ring', 'preserved_collarbone'],
  ['One Hand Sword', 'gnawed_jawbone'],
  ['One Hand Sword', 'preserved_jawbone'],
] as const)('%s %s加方向可使用Echoes，保留原物等/候选资格', (type, boneId) => {
  const catalog = boneCatalog(type)
  const state: CraftState = {
    ...boneState(),
    pendingDesecration: { boneId, kind: 'suffix', directionOmen: 'dextral_necromancy' },
  }
  const offered = applyBoneCraft(catalog, state, {
    kind: 'desecration-offer',
    modIds: ['suffix1', 'suffix2', 'suffix3'],
    revealOmen: 'abyssal_echoes',
  })
  expect(offered.ok).toBe(true)
  expect(createCraftState(catalog, { ...state, itemLevel: 65 }).ok).toBe(
    !boneId.startsWith('gnawed'),
  )
  const mod = catalog.modifiers.find((mod) => mod.id === 'exclusive1')
  if (!mod) throw new Error('fixture')
  mod.level = 100
  if (offered.ok)
    expect(
      applyBoneCraft(catalog, offered.value, {
        kind: 'desecration-reroll',
        modIds: ['suffix1', 'exclusive1', 'exclusive2'],
      }).ok,
    ).toBe(false)
})
it('腰带的远古锁骨和巫妖回响仍受门禁限制，普通无回响路径不收紧', () => {
  for (const pending of [
    { boneId: 'ancient_collarbone' as const, kind: 'suffix' as const },
    {
      boneId: 'preserved_collarbone' as const,
      kind: 'suffix' as const,
      lichOmen: 'liege' as const,
    },
  ]) {
    const catalog = boneCatalog('Belt')
    const state = { ...boneState(), pendingDesecration: pending }
    const modIds = ['exclusive1', 'exclusive2', 'exclusive3']
    expect(applyBoneCraft(catalog, state, { kind: 'desecration-offer', modIds }).ok).toBe(true)
    const blocked = applyBoneCraft(catalog, state, {
      kind: 'desecration-offer',
      modIds,
      revealOmen: 'abyssal_echoes',
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error).toContain('本工具尚未验证')
    expect(boneRevealOmenError(pending, 'abyssal_echoes')).toContain('本工具尚未验证')
    expect(
      createCraftState(catalog, {
        ...state,
        pendingDesecration: { ...pending, options: modIds, revealOmen: 'abyssal_echoes' },
      }).ok,
    ).toBe(false)
  }
})
