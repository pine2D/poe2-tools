import { describe, expect, it } from 'vitest'
import type { CatalogAugment, CraftCatalog } from './catalog'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { applyCraftOperation, type CraftOperation, type CraftState } from './rehearsal'
import { socketEffects } from './sockets'

const fire: CatalogAugment = {
  id: 'fire',
  name: 'Perfect Desert Rune',
  category: 'armour',
  type: 'Rune',
  localMod: false,
  lines: ['+22% to Fire Resistance'],
  statOrder: [1014],
  tradeHashes: {},
  levelReq: 50,
}
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
  bases: [
    {
      id: 'helmet',
      name: 'Helmet',
      type: 'Helmet',
      tags: ['default'],
      requirements: {},
      properties: {},
      implicit: null,
      implicitTags: [],
      sourceQuality: null,
      socketLimit: null,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: ['life', 'mana'].map((id) => ({
    id,
    name: id,
    group: id,
    kind: 'prefix' as const,
    level: 1,
    lines: [`(10-20) ${id}`],
    statOrder: [1],
    tags: [],
    addsTags: [],
    eligibility: [{ tag: 'default', value: 1 }],
    tradeHashes: {},
  })),
  augments: [
    fire,
    { ...fire, id: 'cold', name: 'Glacial Rune', lines: ['+14% to Cold Resistance'] },
  ],
}
const state: CraftState = {
  baseId: 'helmet',
  itemLevel: 1,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
  sockets: [null],
}

describe('统一制作步骤', () => {
  it('已识别实例的移除和神圣步骤保留身份并严格核对类型', () => {
    const initial: CraftState = {
      ...state,
      rarity: 'rare',
      affixes: [
        { modId: 'life', lines: ['15 life'], affixId: 'a1' },
        { modId: 'mana', lines: ['16 mana'], affixId: 'a2' },
      ],
      nextAffixId: 3,
    }
    const snapshot = structuredClone(initial)
    const rerolled = applyCraftStep(catalog, initial, {
      currency: 'divine',
      modIds: [],
      rolls: [
        { modId: 'mana', affixId: 'a2', values: [20] },
        { modId: 'life', affixId: 'a1', values: [11] },
      ],
    })
    expect(rerolled.ok).toBe(true)
    if (!rerolled.ok) return
    expect(rerolled.value.affixes).toEqual([
      { modId: 'life', lines: ['11(10-20) life'], affixId: 'a1' },
      { modId: 'mana', lines: ['20(10-20) mana'], affixId: 'a2' },
    ])
    const removed = applyCraftStep(catalog, rerolled.value, {
      currency: 'annulment',
      modIds: [],
      removeModId: 'life',
      removeAffixId: 'a1',
    })
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(removed.value.affixes).toEqual([rerolled.value.affixes[1]])
    expect(removed.value.nextAffixId).toBe(3)
    expect(
      applyCraftStep(catalog, initial, {
        currency: 'annulment',
        modIds: [],
        removeModId: 'life',
        removeAffixId: 'a2',
      }).ok,
    ).toBe(false)
    expect(initial).toEqual(snapshot)
  })

  it.each<CraftStep>([
    { kind: 'artificer' },
    { kind: 'socket', socketIndex: 0, augmentId: 'fire' },
    { kind: 'vaal', outcome: 'unchanged' },
    { kind: 'essence', essenceId: 'unmigrated', values: [] },
    { kind: 'alloy', alloyId: 'unmigrated', removeModId: 'life', values: [] },
    { kind: 'liquid-emotion', emotionId: 'unmigrated', removeModId: 'life', values: [] },
  ])('未迁移的 $kind 操作明确拒绝实例状态', (step) => {
    const initial: CraftState = { ...state, nextAffixId: 1 }
    const result = applyCraftStep(catalog, initial, step)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('实例')
    expect(initial).toEqual({ ...state, nextAffixId: 1 })
  })

  it('胸甲连续打孔与镶嵌，每次仅追加一个空孔并完整保留属性', () => {
    const source = {
      ...catalog,
      bases: catalog.bases.map((base) => ({
        ...base,
        type: 'Body Armour',
        implicit: '+5 Strength',
      })),
    }
    const initial: CraftState = {
      ...state,
      rarity: 'rare',
      affixes: [{ modId: 'life', lines: ['15 life'] }],
      implicitLines: ['+5 Strength'],
      sourceText: 'original item',
      sockets: [],
    }
    const snapshot = structuredClone(initial)
    const first = applyCraftStep(source, initial, { kind: 'artificer' })
    expect(first).toEqual({ ok: true, value: { ...initial, sockets: [null] } })
    if (!first.ok) return
    const socketed = applyCraftStep(source, first.value, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: 'fire',
    })
    expect(socketed.ok).toBe(true)
    if (!socketed.ok) return
    const second = applyCraftStep(source, socketed.value, { kind: 'artificer' })
    expect(second).toEqual({ ok: true, value: { ...initial, sockets: ['fire', null] } })
    if (!second.ok) return
    const complete = applyCraftStep(source, second.value, {
      kind: 'socket',
      socketIndex: 1,
      augmentId: 'cold',
    })
    expect(complete).toEqual({ ok: true, value: { ...initial, sockets: ['fire', 'cold'] } })
    expect(second.value.sockets).not.toBe(socketed.value.sockets)
    expect(initial).toEqual(snapshot)
  })

  it.each(['normal', 'magic', 'rare'] as const)('物等1的%s头盔能从明确零孔打一个孔', (rarity) => {
    const input = { ...state, rarity, sockets: [] }
    expect(applyCraftStep(catalog, input, { kind: 'artificer' })).toEqual({
      ok: true,
      value: { ...input, sockets: [null] },
    })
  })

  it.each([
    ['Helmet', [null]],
    ['Helmet', ['fire']],
    ['Helmet', [null, null]],
    ['Body Armour', [null, null]],
    ['Body Armour', ['fire', 'cold']],
    ['Body Armour', [null, null, null]],
  ])('巧匠石按全部已有孔计数并拒绝已满或额外孔：%s %j', (type, sockets) => {
    const source = {
      ...catalog,
      bases: catalog.bases.map((base) => ({ ...base, type: String(type) })),
    }
    const input = { ...state, sockets } as CraftState
    const snapshot = structuredClone(input)
    expect(applyCraftStep(source, input, { kind: 'artificer' }).ok).toBe(false)
    expect(input).toEqual(snapshot)
  })

  it('巧匠石拒绝未知孔、传奇、非法物等和孔内物且不修改输入', () => {
    for (const patch of [
      { sockets: undefined },
      { sockets: ['unknown'] },
      { sockets: [undefined] },
      { rarity: 'unique', sockets: [] },
      { itemLevel: 0, sockets: [] },
    ]) {
      const input = { ...state, ...patch } as CraftState
      const snapshot = structuredClone(input)
      expect(applyCraftStep(catalog, input, { kind: 'artificer' }).ok).toBe(false)
      expect(input).toEqual(snapshot)
    }
  })

  it.each([
    'Has 3 Sockets',
    '60% increased effect of Socketed Augment Items',
    'Bonded modifiers are active',
  ])('明确零孔也拒绝特殊孔位基底：%s', (implicit) => {
    const source = { ...catalog, bases: catalog.bases.map((base) => ({ ...base, implicit })) }
    const input = { ...state, sockets: [] }
    expect(applyCraftStep(source, input, { kind: 'artificer' }).ok).toBe(false)
    expect(input.sockets).toEqual([])
  })

  it.each([
    { kind: 'artificer', currency: 'transmutation', modIds: ['life'] },
    { kind: 'artificer', socketIndex: 0 },
    { kind: 'artificer', augmentId: 'fire' },
    { kind: 'artificer', extra: undefined },
  ])('巧匠石步骤严格只允许kind字段：%j', (operation) => {
    const input = { ...state, sockets: [] }
    expect(applyCraftStep(catalog, input, operation as CraftStep).ok).toBe(false)
    expect(input.sockets).toEqual([])
  })

  it('空孔镶火抗再替换冰抗，只保留当前效果并不改变原状态或前后缀', () => {
    const snapshot = structuredClone(state)
    const first = applyCraftStep(catalog, state, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: 'fire',
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = applyCraftStep(catalog, first.value, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: 'cold',
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.value.sockets).toEqual(['cold'])
    expect(socketEffects(catalog, second.value).flatMap((effect) => effect.augment.lines)).toEqual([
      '+14% to Cold Resistance',
    ])
    expect(second.value.affixes).toEqual([])
    expect(first.value.sockets).toEqual(['fire'])
    expect(state).toEqual(snapshot)
  })

  it.each([
    { currency: 'annulment', modIds: [], removeModId: 'life' },
    { currency: 'chaos', modIds: ['mana'], removeModId: 'life' },
    { currency: 'divine', modIds: [], rolls: [{ modId: 'life', values: [18] }] },
  ] satisfies CraftOperation[])('普通通货 $currency 保留孔内物且不共享孔数组', (operation) => {
    const initial: CraftState = {
      ...state,
      rarity: 'rare',
      sockets: ['fire'],
      affixes: [{ modId: 'life', lines: ['15 life'] }],
    }
    const result = applyCraftStep(catalog, initial, operation)
    expect(result).toEqual(applyCraftOperation(catalog, initial, operation))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sockets).toEqual(['fire'])
    expect(result.value.sockets).not.toBe(initial.sockets)
    expect(initial.affixes).toEqual([{ modId: 'life', lines: ['15 life'] }])
  })

  it.each([
    { kind: 'socket', socketIndex: -1, augmentId: 'fire' },
    { kind: 'socket', socketIndex: 1, augmentId: 'fire' },
    { kind: 'socket', socketIndex: 0.5, augmentId: 'fire' },
    { kind: 'socket', socketIndex: '0', augmentId: 'fire' },
    { kind: 'socket', socketIndex: 0, augmentId: 'unknown' },
    { kind: 'socket', socketIndex: 0, augmentId: null },
    {
      kind: 'socket',
      socketIndex: 0,
      augmentId: 'fire',
      currency: 'transmutation',
      modIds: ['life'],
    },
    { kind: 'future', currency: 'transmutation', modIds: ['life'] },
    { kind: undefined, currency: 'transmutation', modIds: ['life'] },
    { currency: 'transmutation', modIds: ['life'], extra: true },
    { currency: 'transmutation', modIds: ['life'], removeModId: 1 },
    {
      currency: 'transmutation',
      modIds: ['life'],
      rolls: [{ modId: 'life', values: [12], extra: true }],
    },
    null,
    [],
  ])('拒绝无效步骤而不修改状态：%j', (operation) => {
    const snapshot = structuredClone(state)
    expect(applyCraftStep(catalog, state, operation as CraftStep).ok).toBe(false)
    expect(state).toEqual(snapshot)
  })

  it('缺省、零孔与不合法起点均不可镶嵌', () => {
    for (const input of [
      { ...state, sockets: undefined },
      { ...state, sockets: [] },
      { ...state, itemLevel: 0 },
      { ...state, rarity: 'unique' },
    ]) {
      expect(
        applyCraftStep(catalog, input as CraftState, {
          kind: 'socket',
          socketIndex: 0,
          augmentId: 'fire',
        }).ok,
      ).toBe(false)
    }
  })
})
