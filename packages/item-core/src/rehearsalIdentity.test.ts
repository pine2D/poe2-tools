import { describe, expect, it } from 'vitest'
import type { CatalogMod, CraftCatalog } from './catalog'
import * as core from './index'
import {
  addCraftAffix,
  applyCraftOperation,
  type CraftOperation,
  type CraftResult,
  type CraftState,
  createCraftState,
  prepareCraftOperation,
} from './rehearsal'

const mods: CatalogMod[] = ['p1', 'p2', 's1', 's2'].map((id) => ({
  id,
  name: id,
  group: id,
  kind: id.startsWith('p') ? 'prefix' : 'suffix',
  level: 1,
  lines: [`${id} (1-10)`],
  statOrder: [1],
  tags: [],
  addsTags: [],
  eligibility: [{ tag: 'focus', value: 1 }],
  tradeHashes: {},
}))
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '2026-09-15',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
  bases: [
    {
      id: 'Focus',
      name: 'Focus',
      type: 'Focus',
      tags: ['focus'],
      requirements: {},
      properties: {},
      implicit: null,
      implicitTags: [],
      sourceQuality: null,
      socketLimit: 0,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: mods,
}
function state(): CraftState {
  return {
    baseId: 'Focus',
    itemLevel: 70,
    rarity: 'rare',
    sourceText: null,
    affixes: [
      { modId: 'p1', lines: ['p1 2'] },
      { modId: 's1', lines: ['s1 3'] },
    ],
  }
}
function value<T>(result: CraftResult<T>): T {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function identified(): CraftState {
  return {
    ...state(),
    nextAffixId: 3,
    affixes: [
      { modId: 'p1', lines: ['p1 2'], affixId: 'a1' },
      { modId: 's1', lines: ['s1 3'], affixId: 'a2' },
    ],
  }
}

describe('身份模式的公共状态入口', () => {
  it('旧输入深拷贝且序列化不新增身份字段，旧操作输出仍保持原 JSON', () => {
    const input = state()
    const result = value(createCraftState(catalog, input))
    expect(JSON.stringify(result)).toBe(JSON.stringify(input))
    expect(result.affixes[0]?.lines).not.toBe(input.affixes[0]?.lines)
    expect(
      JSON.stringify(
        value(
          applyCraftOperation(catalog, input, {
            currency: 'annulment',
            modIds: [],
            removeModId: 'p1',
          }),
        ),
      ),
    ).toBe(
      '{"baseId":"Focus","itemLevel":70,"rarity":"rare","sourceText":null,"affixes":[{"modId":"s1","lines":["s1 3"]}]}',
    )
  })

  it('接受并深拷贝已有身份；显式启用按初始顺序分配且幂等', () => {
    const input = identified()
    const checked = value(createCraftState(catalog, input))
    expect(checked).toEqual(input)
    expect(checked.affixes[0]?.lines).not.toBe(input.affixes[0]?.lines)
    expect(core.enableCraftAffixIdentity).toBeTypeOf('function')
    const legacy = state()
    const enabled = value(core.enableCraftAffixIdentity(catalog, legacy))
    expect(enabled).toEqual(input)
    expect(legacy).toEqual(state())
    expect(value(core.enableCraftAffixIdentity(catalog, enabled))).toEqual(enabled)
    const sparse = { ...input, nextAffixId: 8, affixes: input.affixes.slice(1) }
    expect(value(core.enableCraftAffixIdentity(catalog, sparse))).toEqual(sparse)
  })

  it('拒绝混态、显式 undefined、重复 ID、非规范 ID 和非法游标', () => {
    const input = identified()
    const invalid = [
      { ...state(), nextAffixId: undefined },
      { ...state(), affixes: [{ ...state().affixes[0], affixId: undefined }] },
      { ...input, nextAffixId: undefined },
      ...[0, -1, 2, 2.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((nextAffixId) => ({
        ...input,
        nextAffixId,
      })),
      { ...input, affixes: [input.affixes[0], state().affixes[1]] },
      ...['a0', 'a01', 'a-1', 'a1.5', 'a9007199254740992', 'a1\n', '', undefined].map(
        (affixId) => ({
          ...input,
          affixes: [{ ...input.affixes[0], affixId }, input.affixes[1]],
        }),
      ),
      { ...input, affixes: [input.affixes[0], { ...input.affixes[1], affixId: 'a1' }] },
    ]
    const withoutCursor = { ...input }
    delete withoutCursor.nextAffixId
    invalid.push(withoutCursor)
    for (const candidate of invalid) {
      expect(createCraftState(catalog, candidate as CraftState).ok).toBe(false)
    }
  })

  it('身份不授权同组重复，启用也不修复无效状态', () => {
    const input = identified()
    input.affixes[1] = { modId: 'p1', lines: ['p1 5'], affixId: 'a2' }
    expect(createCraftState(catalog, input).ok).toBe(false)
    expect(core.enableCraftAffixIdentity).toBeTypeOf('function')
    expect(core.enableCraftAffixIdentity(catalog, input).ok).toBe(false)
  })
})

describe('普通通货的实例生命周期', () => {
  it('空白装备启用从 a1 分配；点金替换全部旧实例且延续游标', () => {
    const empty = { ...state(), rarity: 'normal' as const, affixes: [] }
    const enabled = value(core.enableCraftAffixIdentity(catalog, empty))
    expect(enabled).toEqual({ ...empty, nextAffixId: 1 })
    const magic = value(
      applyCraftOperation(catalog, enabled, {
        currency: 'transmutation',
        modIds: ['p1'],
        rolls: [{ modId: 'p1', values: [4] }],
      }),
    )
    expect(magic.affixes).toEqual([{ modId: 'p1', lines: ['p1 4(1-10)'], affixId: 'a1' }])
    expect(magic.nextAffixId).toBe(2)
    const rare = value(
      applyCraftOperation(catalog, magic, {
        currency: 'alchemy',
        modIds: ['p1', 's1', 'p2', 's2'],
      }),
    )
    expect(rare.affixes.map((affix) => affix.affixId)).toEqual(['a2', 'a3', 'a4', 'a5'])
    expect(rare.nextAffixId).toBe(6)
    expect(enabled).toEqual({ ...empty, nextAffixId: 1 })
  })

  it('神圣保持破裂实例，旧数值 selector 仍能唯一定位可重掷实例', () => {
    const initial = identified()
    const first = initial.affixes[0]
    if (!first) throw new Error('缺少测试前缀')
    first.fractured = true
    const result = value(
      applyCraftOperation(catalog, initial, {
        currency: 'divine',
        modIds: [],
        rolls: [{ modId: 's1', values: [8] }],
      }),
    )
    expect(result.affixes).toEqual([
      { modId: 'p1', lines: ['p1 2'], affixId: 'a1', fractured: true },
      { modId: 's1', lines: ['s1 8(1-10)'], affixId: 'a2' },
    ])
    expect(result.nextAffixId).toBe(3)
    expect(
      applyCraftOperation(catalog, initial, {
        currency: 'annulment',
        modIds: [],
        removeModId: 'p1',
        removeAffixId: 'a1',
      }).ok,
    ).toBe(false)
    expect(initial.affixes[0]).toEqual(first)
  })

  it('剥离仅移除所选 ID，新增不复用旧 ID，同快照重算保持确定', () => {
    const initial = identified()
    const removed = value(
      applyCraftOperation(catalog, initial, {
        currency: 'annulment',
        modIds: [],
        removeModId: 'p1',
        removeAffixId: 'a1',
      }),
    )
    expect(removed.affixes).toEqual([{ modId: 's1', lines: ['s1 3'], affixId: 'a2' }])
    expect(removed.nextAffixId).toBe(3)
    const added = value(addCraftAffix(catalog, removed, 'p2'))
    expect(added.affixes[1]).toEqual({ modId: 'p2', lines: ['p2 (1-10)'], affixId: 'a3' })
    expect(added.nextAffixId).toBe(4)
    expect(value(addCraftAffix(catalog, removed, 'p2'))).toEqual(added)
    expect(initial).toEqual(identified())
    expect(
      value(prepareCraftOperation(catalog, initial, 'annulment', { modId: 'p1', affixId: 'a1' }))
        .state,
    ).toEqual(removed)
    expect(value(prepareCraftOperation(catalog, initial, 'annulment', 'p1')).state).toEqual(removed)
  })

  it('混沌替换结束旧实例，新数值按新 ID 定位；神圣重掷保留全部 ID 和游标', () => {
    const initial = identified()
    const operation: CraftOperation = {
      currency: 'chaos',
      removeModId: 'p1',
      removeAffixId: 'a1',
      modIds: ['p1'],
      rolls: [{ modId: 'p1', affixId: 'a3', values: [6] }],
    }
    const replaced = value(applyCraftOperation(catalog, initial, operation))
    expect(replaced.affixes).toEqual([
      { modId: 's1', lines: ['s1 3'], affixId: 'a2' },
      { modId: 'p1', lines: ['p1 6(1-10)'], affixId: 'a3' },
    ])
    expect(replaced.nextAffixId).toBe(4)
    expect(value(applyCraftOperation(catalog, initial, operation))).toEqual(replaced)
    const rolled = value(
      applyCraftOperation(catalog, replaced, {
        currency: 'divine',
        modIds: [],
        rolls: [
          { modId: 'p1', affixId: 'a3', values: [8] },
          { modId: 's1', affixId: 'a2', values: [9] },
        ],
      }),
    )
    expect(rolled).toEqual({
      ...replaced,
      affixes: [
        { modId: 's1', lines: ['s1 9(1-10)'], affixId: 'a2' },
        { modId: 'p1', lines: ['p1 8(1-10)'], affixId: 'a3' },
      ],
    })
    expect(initial).toEqual(identified())
  })

  it('无效身份 selector、roll 重复或缺项失败且不修改原状态', () => {
    const initial = identified()
    const operations = [
      { currency: 'annulment', modIds: [], removeModId: 'p1', removeAffixId: 'a2' },
      { currency: 'annulment', modIds: [], removeModId: 'p1', removeAffixId: 'a9' },
      { currency: 'annulment', modIds: [], removeAffixId: 'a1' },
      { currency: 'annulment', modIds: [], removeModId: 'p1', removeAffixId: undefined },
      { currency: 'exalted', modIds: ['p2'], removeAffixId: 'a1' },
      {
        currency: 'divine',
        modIds: [],
        rolls: [
          { modId: 'p1', affixId: 'a2', values: [6] },
          { modId: 's1', affixId: 'a1', values: [7] },
        ],
      },
      {
        currency: 'divine',
        modIds: [],
        rolls: [
          { modId: 'p1', affixId: 'a1', values: [6] },
          { modId: 'p1', values: [7] },
        ],
      },
      { currency: 'divine', modIds: [], rolls: [{ modId: 'p1', affixId: 'a1', values: [6] }] },
      {
        currency: 'divine',
        modIds: [],
        rolls: [
          { modId: 'p1', affixId: undefined, values: [6] },
          { modId: 's1', values: [7] },
        ],
      },
    ]
    for (const operation of operations) {
      expect(applyCraftOperation(catalog, initial, operation as CraftOperation).ok).toBe(false)
      expect(initial).toEqual(identified())
    }
  })

  it('游标已到安全整数上限时新增明确失败且不溢出', () => {
    const initial = { ...identified(), nextAffixId: Number.MAX_SAFE_INTEGER }
    expect(createCraftState(catalog, initial).ok).toBe(true)
    expect(addCraftAffix(catalog, initial, 'p2').ok).toBe(false)
    expect(initial.nextAffixId).toBe(Number.MAX_SAFE_INTEGER)
  })
})
