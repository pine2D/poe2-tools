import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import type { CatalogAugment } from './catalog'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { estimateDefences } from './defences'
import {
  applyExtractionCraft,
  isExtractionCraftOperation,
  prepareExtractionCraft,
} from './extraction'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { socketEffects } from './sockets'

const fire: CatalogAugment = {
  id: 'fire',
  name: 'Desert Rune',
  category: 'armour',
  type: 'Rune',
  localMod: false,
  lines: ['+12% to Fire Resistance'],
  statOrder: [1],
  tradeHashes: {},
  levelReq: 1,
}
const cold: CatalogAugment = {
  ...fire,
  id: 'cold',
  name: 'Glacial Rune',
  lines: ['+12% to Cold Resistance'],
}
const catalog = { ...boneCatalog('Body Armour'), augments: [fire, cold] }
const state: CraftState = {
  ...boneState(['prefix1']),
  nextAffixId: 2,
  affixes: [{ affixId: 'a1', modId: 'prefix1', lines: ['prefix1 5'] }],
  sockets: [fire.id, fire.id, cold.id],
}
const operation = { kind: 'extraction' } as const
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}

it('同材料逐孔累计返还数量，保留原孔索引和不同材料，不把重复ID去重', () => {
  expect(createCraftState(catalog, state).ok).toBe(true)
  expect(prepareExtractionCraft(catalog, state)).toEqual({
    ok: true,
    value: {
      returns: [
        { augmentId: 'fire', name: 'Desert Rune', count: 2, socketIndices: [0, 1] },
        { augmentId: 'cold', name: 'Glacial Rune', count: 1, socketIndices: [2] },
      ],
    },
  })
  expect(prepareExtractionCraft(catalog, { ...state, sockets: ['fire', null, 'fire'] })).toEqual({
    ok: true,
    value: {
      returns: [{ augmentId: 'fire', name: 'Desert Rune', count: 2, socketIndices: [0, 2] }],
    },
  })
})

it('普通、魔法、稀有及合法腐化、破裂、待揭示都可萃取，不选择词缀', () => {
  const states: CraftState[] = [
    { ...state, rarity: 'normal', affixes: [], nextAffixId: 1 },
    { ...state, rarity: 'magic' },
    state,
    { ...state, corrupted: true, sockets: ['fire', null, 'fire', 'cold'] },
    { ...state, affixes: state.affixes.map((affix) => ({ ...affix, fractured: true })) },
    { ...state, pendingDesecration: { boneId: 'preserved_rib', kind: 'suffix' } },
  ]
  for (const current of states) {
    expect(createCraftState(catalog, current).ok).toBe(true)
    expect(prepareExtractionCraft(catalog, current).ok).toBe(true)
    expect(applyCraftStep(catalog, current, operation)).toEqual({
      ok: true,
      value: { ...current, destroyed: true },
    })
  }
})

it('未知孔、全空、非法材料、超容量和绑定来源拒绝，不能按名字伪造返还', () => {
  const { sockets: _, ...unknown } = state
  for (const current of [
    unknown,
    { ...state, sockets: [] },
    { ...state, sockets: [null, null] },
    { ...state, sockets: ['missing'] },
    { ...state, sockets: ['fire', 'fire', 'fire', 'cold'] },
    { ...state, destroyed: true } as CraftState,
  ])
    expect(prepareExtractionCraft(catalog, current).ok).toBe(false)
  for (const changed of [
    { ...catalog, augments: [{ ...fire, isSocketBound: true }, cold] },
    { ...catalog, augments: [{ ...fire, lines: ['Unknown effect'] }, cold] },
    { ...catalog, bases: catalog.bases.map((base) => ({ ...base, implicit: 'Has 3 Sockets' })) },
  ]) {
    expect(createCraftState(changed, state).ok).toBe(false)
    expect(prepareExtractionCraft(changed, state).ok).toBe(false)
    expect(applyExtractionCraft(changed, state, operation).ok).toBe(false)
  }
})

it('操作只接受自有普通JSON中的kind，不能写入伪造返还或结果', () => {
  let reads = 0
  const getter = Object.defineProperty({}, 'kind', {
    enumerable: true,
    get() {
      reads++
      return 'extraction'
    },
  })
  for (const invalid of [
    null,
    [],
    {},
    { kind: 'other' },
    { ...operation, returns: [] },
    { ...operation, destroyed: true },
    { ...operation, count: 3 },
    { ...operation, extra: undefined },
    Object.create(operation),
    getter,
    Object.defineProperty({ ...operation }, 'extra', { value: 1 }),
  ]) {
    expect(isExtractionCraftOperation(invalid)).toBe(false)
    expect(applyExtractionCraft(catalog, state, invalid as typeof operation).ok).toBe(false)
  }
  expect(reads).toBe(0)
  expect(isExtractionCraftOperation(operation)).toBe(true)
})

it('预演不变输入，终态深拷贝原快照且所有后续制作、效果和文本出口拒绝', () => {
  const input = structuredClone(state)
  const original = structuredClone(input)
  Object.freeze(input.affixes[0]?.lines)
  Object.freeze(input.affixes[0])
  Object.freeze(input.affixes)
  Object.freeze(input.sockets)
  Object.freeze(input)
  const prepared = must(prepareExtractionCraft(catalog, input))
  prepared.returns[0]?.socketIndices.push(99)
  expect(must(prepareExtractionCraft(catalog, input)).returns[0]?.socketIndices).toEqual([0, 1])
  const terminal = must(applyCraftStep(catalog, input, operation))
  expect(terminal).toEqual({ ...original, destroyed: true })
  expect(terminal.affixes).not.toBe(input.affixes)
  expect(terminal.affixes[0]?.lines).not.toBe(input.affixes[0]?.lines)
  expect(terminal.sockets).not.toBe(input.sockets)
  expect(input).toEqual(original)
  const followups: CraftStep[] = [
    operation,
    { kind: 'architect', outcome: 'destroy' },
    { kind: 'artificer' },
    { kind: 'socket', socketIndex: 0, augmentId: 'cold' },
    { currency: 'exalted', modIds: ['suffix1'] },
    { kind: 'perfect-flux', previousMaxLevel: 13 },
    { kind: 'vaal', outcome: 'unchanged' },
  ]
  for (const next of followups)
    expect(applyCraftStep(catalog, terminal, next)).toMatchObject({
      ok: false,
      error: expect.stringContaining('摧毁'),
    })
  expect(createCraftState(catalog, terminal).ok).toBe(false)
  expect(socketEffects(catalog, terminal)).toEqual([])
  expect(estimateDefences(catalog, terminal).ok).toBe(false)
  expect(exportCraftItemText(catalog, terminal).ok).toBe(false)
})

it('建筑师摧毁不增加返还字段，也不能从终态重新萃取', () => {
  const initial = { ...state, corrupted: true as const }
  const terminal = must(applyCraftStep(catalog, initial, { kind: 'architect', outcome: 'destroy' }))
  expect(terminal).toEqual({ ...initial, destroyed: true })
  expect(terminal).not.toHaveProperty('returns')
  expect(prepareExtractionCraft(catalog, terminal).ok).toBe(false)
})
