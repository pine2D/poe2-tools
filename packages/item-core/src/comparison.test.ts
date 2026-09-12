import { describe, expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import type { CraftCatalog } from './catalog'
import { compareCraftStates } from './comparison'
import type { CraftState } from './rehearsal'

const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '2026-09-12',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
  bases: [
    {
      id: 'ring',
      name: 'Ring',
      type: 'Ring',
      tags: ['default'],
      requirements: {},
      properties: {},
      implicit: '+(5-10) to Strength',
      implicitTags: [],
      sourceQuality: null,
      socketLimit: null,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: [
    {
      id: 'life',
      kind: 'prefix',
      lines: ['+(10-20) to maximum Life', '-(1-5) Damage taken', 'Grants Level 12 Skill'],
    },
    { id: 'resist', kind: 'suffix', lines: ['+(20-30)% to Fire Resistance'] },
    { id: 'skill', kind: 'prefix', lines: ['Grants Skill (1-3)'] },
    { id: 'unsupported', kind: 'suffix', lines: ['Value (1 to 3)'] },
  ].map((mod) => ({
    ...mod,
    kind: mod.kind as 'prefix' | 'suffix',
    name: mod.id,
    group: mod.id,
    level: 1,
    statOrder: [],
    tags: [],
    addsTags: [],
    eligibility: [{ tag: 'default', value: 1 }],
    tradeHashes: {},
  })),
}

function state(affixes: CraftState['affixes'] = []): CraftState {
  return { baseId: 'ring', itemLevel: 70, rarity: 'rare', sourceText: null, affixes }
}

function compare(before: CraftState, after: CraftState) {
  const result = compareCraftStates(catalog, before, after)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('制作状态前后对比', () => {
  const socketCatalog: CraftCatalog = {
    ...catalog,
    bases: catalog.bases.map((base) => ({ ...base, type: 'Body Armour' })),
    augments: [
      { id: 'fire', name: 'Desert Rune', lines: ['+12% to Fire Resistance'] },
      { id: 'cold', name: 'Glacial Rune', lines: ['+12% to Cold Resistance'] },
    ].map((rune) => ({
      ...rune,
      category: 'armour',
      type: 'Rune',
      localMod: false,
      statOrder: [],
      tradeHashes: {},
      levelReq: 1,
    })),
  }

  it.each([
    [[], [null]],
    [[null], []],
    [['fire'], ['fire', null]],
    [['fire', null], ['fire']],
  ])('新增空孔及撤销只记录孔数，不伪造符文变化：%j → %j', (before, after) => {
    expect(
      compareCraftStates(
        socketCatalog,
        { ...state(), sockets: before },
        { ...state(), sockets: after },
      ),
    ).toEqual({
      ok: true,
      value: {
        rarity: null,
        affixes: [],
        implicit: null,
        socketCount: { before: before.length, after: after.length },
      },
    })
  })

  it('孔数变化同时比较共同孔位的符文替换，反向撤销保持正确', () => {
    const before = { ...state(), sockets: ['fire'] }
    const after = { ...state(), sockets: ['cold', null] }
    const forward = compareCraftStates(socketCatalog, before, after)
    const backward = compareCraftStates(socketCatalog, after, before)
    expect(forward).toEqual({
      ok: true,
      value: {
        rarity: null,
        affixes: [],
        implicit: null,
        socketCount: { before: 1, after: 2 },
        sockets: [
          {
            socketIndex: 0,
            beforeId: 'fire',
            afterId: 'cold',
            beforeLines: ['+12% to Fire Resistance'],
            afterLines: ['+12% to Cold Resistance'],
          },
        ],
      },
    })
    expect(backward).toEqual({
      ok: true,
      value: {
        rarity: null,
        affixes: [],
        implicit: null,
        socketCount: { before: 2, after: 1 },
        sockets: [
          {
            socketIndex: 0,
            beforeId: 'cold',
            afterId: 'fire',
            beforeLines: ['+12% to Cold Resistance'],
            afterLines: ['+12% to Fire Resistance'],
          },
        ],
      },
    })
  })

  it('缺省未知孔不能与明确零孔或已有孔推演比较', () => {
    for (const sockets of [[], [null]]) {
      const known = { ...state(), sockets }
      expect(compareCraftStates(socketCatalog, state(), known).ok).toBe(false)
      expect(compareCraftStates(socketCatalog, known, state()).ok).toBe(false)
    }
    expect(compareCraftStates(socketCatalog, state(), state())).toEqual({
      ok: true,
      value: { rarity: null, affixes: [], implicit: null },
    })
  })

  it('按精确ID记录新增、移除与稀有度，保留完整属性组且不引用输入', () => {
    const before = {
      ...state([{ modId: 'life', lines: [...(catalog.modifiers[0]?.lines ?? [])] }]),
      rarity: 'magic' as const,
    }
    const after = state([{ modId: 'resist', lines: ['+25% to Fire Resistance'] }])
    const snapshot = structuredClone({ before, after, catalog })
    const result = compare(before, after)
    expect(result.rarity).toEqual({ before: 'magic', after: 'rare' })
    expect(result.affixes).toEqual([
      {
        modId: 'life',
        kind: 'removed',
        beforeLines: before.affixes[0]?.lines,
        afterLines: null,
        numeric: [],
      },
      {
        modId: 'resist',
        kind: 'added',
        beforeLines: null,
        afterLines: after.affixes[0]?.lines,
        numeric: [],
      },
    ])
    expect(result.affixes[0]?.beforeLines).not.toBe(before.affixes[0]?.lines)
    expect(result.affixes[1]?.afterLines).not.toBe(after.affixes[0]?.lines)
    expect({ before, after, catalog }).toEqual(snapshot)
  })

  it('多行乱序按目录识别数值，包括负数；只列实际变化', () => {
    const before = state([
      { modId: 'life', lines: ['-2 Damage taken', 'Grants Level 12 Skill', '+15 to maximum Life'] },
    ])
    const after = state([
      {
        modId: 'life',
        lines: ['+15(10-20) to maximum Life', '-4(-5--1) Damage taken', 'Grants Level 12 Skill'],
      },
    ])
    expect(compare(before, after).affixes).toEqual([
      {
        modId: 'life',
        kind: 'changed',
        beforeLines: before.affixes[0]?.lines,
        afterLines: after.affixes[0]?.lines,
        numeric: [{ index: 1, before: -2, after: -4 }],
      },
    ])
  })

  it('范围实际值、常量格式和行顺序相同时不产生伪变化', () => {
    const before = state([
      { modId: 'life', lines: ['+15 to maximum Life', '-2 Damage taken', 'Grants Level 12 Skill'] },
    ])
    const after = state([
      {
        modId: 'life',
        lines: [' grants level 12 skill ', '-2(-5--1) Damage taken', '+15(10-20) to maximum Life'],
      },
    ])
    expect(compare(before, after)).toEqual({ rarity: null, affixes: [], implicit: null })
  })

  it('未知范围变为实际值可见，固有属性缺省代表尚未掷值', () => {
    const before = state([{ modId: 'resist', lines: ['+(20-30)% to Fire Resistance'] }])
    const after = {
      ...state([{ modId: 'resist', lines: ['+25% to Fire Resistance'] }]),
      implicitLines: ['+8 to Strength'],
    }
    expect(compare(before, after).affixes[0]?.numeric).toEqual([
      { index: 0, before: null, after: 25 },
    ])
    expect(compare(before, after).implicit).toEqual({
      beforeLines: ['+(5-10) to Strength'],
      afterLines: ['+8 to Strength'],
      numeric: [{ index: 0, before: null, after: 8 }],
    })
    expect(compare(after, before).implicit?.numeric).toEqual([{ index: 0, before: 8, after: null }])
  })

  it('未支持生成的技能范围保守读取，不抛异常；未知语法相同保持无变化', () => {
    const before = state([
      { modId: 'skill', lines: ['Grants Skill (1-3)'] },
      { modId: 'unsupported', lines: ['Value (1 to 3)'] },
    ])
    const after = state([
      { modId: 'skill', lines: ['Grants Skill 2'] },
      { modId: 'unsupported', lines: ['Value (1 to 3)'] },
    ])
    expect(compare(before, after).affixes).toEqual([
      {
        modId: 'skill',
        kind: 'changed',
        beforeLines: ['Grants Skill (1-3)'],
        afterLines: ['Grants Skill 2'],
        numeric: [{ index: 0, before: null, after: 2 }],
      },
    ])
  })

  it.each([{ baseId: 'other' }, { itemLevel: 71 }, { sourceText: 'other source' }])(
    '拒绝不属于相同装备起点的状态 %j',
    (patch) => {
      expect(compareCraftStates(catalog, state(), { ...state(), ...patch })).toMatchObject({
        ok: false,
      })
    },
  )

  it('非法实际值或状态返回失败，不给出可信对比', () => {
    const invalid = state([{ modId: 'resist', lines: ['+999% to Fire Resistance'] }])
    expect(compareCraftStates(catalog, invalid, state())).toMatchObject({ ok: false })
    expect(compareCraftStates(catalog, state(), invalid)).toMatchObject({ ok: false })
  })
})

it('待揭示键插入顺序不构成变化，真实材料/侧/选项变化保持深复制', () => {
  const catalog = boneCatalog()
  const before: CraftState = {
    ...boneState(),
    pendingDesecration: {
      boneId: 'preserved_rib',
      kind: 'suffix',
      options: ['suffix1', 'suffix2', 'suffix3'],
    },
  }
  const reordered: CraftState = {
    ...boneState(),
    pendingDesecration: {
      options: ['suffix1', 'suffix2', 'suffix3'],
      kind: 'suffix',
      boneId: 'preserved_rib',
    },
  }
  const equal = compareCraftStates(catalog, before, reordered)
  expect(equal.ok).toBe(true)
  if (equal.ok) expect(equal.value).not.toHaveProperty('pendingDesecration')
  for (const pendingDesecration of [
    { boneId: 'gnawed_rib', kind: 'suffix', options: ['suffix1', 'suffix2', 'suffix3'] },
    { boneId: 'preserved_rib', kind: 'prefix', options: ['prefix1', 'prefix2', 'prefix3'] },
    { boneId: 'preserved_rib', kind: 'suffix', options: ['suffix2', 'suffix1', 'suffix3'] },
    { boneId: 'preserved_rib', kind: 'suffix' },
  ] as const) {
    const after: CraftState = {
      ...boneState(),
      pendingDesecration: {
        boneId: pendingDesecration.boneId,
        kind: pendingDesecration.kind,
        ...('options' in pendingDesecration ? { options: [...pendingDesecration.options] } : {}),
      },
    }
    const changed = compareCraftStates(catalog, before, after)
    expect(changed).toMatchObject({
      ok: true,
      value: {
        pendingDesecration: { before: before.pendingDesecration, after: after.pendingDesecration },
      },
    })
    if (!changed.ok || !changed.value.pendingDesecration) continue
    const previousOptions = changed.value.pendingDesecration.before?.options
    const nextOptions = changed.value.pendingDesecration.after?.options
    if (previousOptions) previousOptions[0] = 'changed-before'
    if (nextOptions) nextOptions[0] = 'changed-after'
    expect(before.pendingDesecration?.options?.[0]).toBe('suffix1')
    expect(after.pendingDesecration?.options?.[0]).not.toBe('changed-after')
  }
})
