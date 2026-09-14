import { describe, expect, it } from 'vitest'
import catalogData from '../../../data/craft/catalog.json'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts } from './craftCosts'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { type CraftState, createCraftState, prepareCraftOperation } from './rehearsal'
import { artificerSocketLimit, socketCandidates, socketCapacity } from './sockets'

const catalog = catalogData as CraftCatalog
const start: CraftState = {
  baseId: 'Crude Bow',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
  quality: 20,
  sockets: [null, null, null],
}

describe('瓦尔指定结果与腐化后镶嵌', () => {
  it('畸形腐化状态返回诊断，不在特殊孔检查中抛异常', () => {
    for (const patch of [{ affixes: null }, { affixes: [null] }, { implicitLines: null }]) {
      expect(
        createCraftState(catalog, { ...start, corrupted: true, ...patch } as unknown as CraftState)
          .ok,
      ).toBe(false)
    }
  })
  it('特殊孔基底不能借缺省或零孔绕过腐化入口，普通无孔首饰仍可预演属性不变', () => {
    for (const baseId of ['Kalguuran Forgehammer', 'Corona Amulet', 'Grasping Ring']) {
      for (const sockets of [undefined, []]) {
        const state: CraftState = {
          baseId,
          itemLevel: 86,
          rarity: 'normal',
          affixes: [],
          sourceText: null,
          ...(sockets === undefined ? {} : { sockets }),
        }
        expect(createCraftState(catalog, state).ok).toBe(true)
        expect(createCraftState(catalog, { ...state, corrupted: true })).toMatchObject({
          ok: false,
          error: expect.stringContaining('特殊孔'),
        })
        expect(applyCraftStep(catalog, state, { kind: 'vaal', outcome: 'unchanged' }).ok).toBe(
          false,
        )
      }
    }
    const state: CraftState = {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
    }
    expect(applyCraftStep(catalog, state, { kind: 'vaal', outcome: 'unchanged' }).ok).toBe(true)
    expect(applyCraftStep(catalog, state, { kind: 'vaal', outcome: 'socket' }).ok).toBe(false)
  })
  it('额外孔保留已有状态，随后镶嵌并覆盖；普通制作与重复腐化被拒绝', () => {
    const step = { kind: 'vaal', outcome: 'socket' } as unknown as CraftStep
    const result = applyCraftStep(catalog, start, step)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.value).toEqual({ ...start, corrupted: true, sockets: [null, null, null, null] })
    expect(start.sockets).toHaveLength(3)
    expect(socketCapacity(catalog, result.value)).toBe(4)
    expect(artificerSocketLimit(catalog, result.value)).toBe(0)
    const core = socketCandidates(catalog, result.value).find(
      (a) => a.name === 'Soul Core of Quipolatl',
    )
    const fire = socketCandidates(catalog, result.value).find((a) => a.name === 'Desert Rune')
    expect(core).toBeDefined()
    expect(fire).toBeDefined()
    if (!core || !fire) throw new Error('缺少实际镶嵌候选')
    const socket: CraftStep = { kind: 'socket', socketIndex: 3, augmentId: core.id }
    const applied = applyCraftStep(catalog, result.value, socket)
    if (!applied.ok) throw new Error(applied.error)
    expect(applyCraftStep(catalog, applied.value, { ...socket, augmentId: fire.id }).ok).toBe(true)
    for (const blocked of [
      step,
      { kind: 'artificer' },
      { currency: 'transmutation', modIds: [] },
    ]) {
      expect(applyCraftStep(catalog, applied.value, blocked as CraftStep)).toMatchObject({
        ok: false,
        error: expect.stringContaining('腐化'),
      })
    }
    expect(prepareCraftOperation(catalog, applied.value, 'transmutation')).toMatchObject({
      ok: false,
      error: expect.stringContaining('腐化'),
    })
    expect(collectCraftCosts(catalog, [step, socket])).toMatchObject({
      ok: true,
      value: [
        { id: 'currency:vaal', count: 1 },
        { id: `augment:${core.name}`, count: 1 },
      ],
    })
  })

  it('无变化只标记腐化，不猜孔数；拒绝伪造字段与已腐化，珠宝沿v70支持无变化', () => {
    const { sockets: _, ...unknownSockets } = start
    const result = applyCraftStep(catalog, unknownSockets, {
      kind: 'vaal',
      outcome: 'unchanged',
    } as unknown as CraftStep)
    expect(result).toEqual({ ok: true, value: { ...unknownSockets, corrupted: true } })
    for (const step of [
      { kind: 'vaal', outcome: 'socket' },
      { kind: 'vaal', outcome: 'enchant' },
      { kind: 'vaal', outcome: 'unchanged', omen: 'corruption' },
    ])
      expect(applyCraftStep(catalog, unknownSockets, step as unknown as CraftStep).ok).toBe(false)
    for (const corrupted of [false, 'true', null, undefined]) {
      expect(createCraftState(catalog, { ...start, corrupted } as unknown as CraftState).ok).toBe(
        false,
      )
    }
    expect(
      applyCraftStep(
        catalog,
        { ...unknownSockets, baseId: 'Ruby', quality: undefined } as unknown as CraftState,
        { kind: 'vaal', outcome: 'unchanged' } as unknown as CraftStep,
      ).ok,
    ).toBe(true)
  })
})
