import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { prepareExtractionCraft } from './extraction'
import {
  applyMasterworkCraft,
  isMasterworkCraftOperation,
  prepareMasterworkCraft,
} from './masterwork'
import type { CraftState } from './rehearsal'
import { socketEffects } from './sockets'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const id = (name: string, category = 'armour') => `pob2:augment:${JSON.stringify([name, category])}`
const state = (
  name = 'Greater Rebirth Rune',
  category = 'armour',
  baseId = 'Adherent Cuffs',
): CraftState => ({
  baseId,
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
  quality: 20,
  sockets: [id(name, category)],
})
it.each([
  ['armour', 'Adherent Cuffs', 'Greater Rebirth Rune', 'Perfect Rebirth Rune'],
  ['weapon', 'Crude Bow', 'Greater Iron Rune', 'Perfect Iron Rune'],
  ['wand', 'Withered Wand', 'Greater Desert Rune', 'Perfect Desert Rune'],
])('升级%s已镶嵌高级符文且萃取按结果身份返还', (category, base, from, to) => {
  const initial = state(from, category, base)
  const before = structuredClone(initial)
  const prepared = prepareMasterworkCraft(catalog, initial, 0)
  if (!prepared.ok) throw Error(prepared.error)
  expect(prepared.value.operation).toEqual({
    kind: 'masterwork',
    socketIndex: 0,
    fromAugmentId: id(from, category),
    toAugmentId: id(to, category),
  })
  const result = applyMasterworkCraft(catalog, initial, prepared.value.operation)
  if (!result.ok) throw Error(result.error)
  expect(result.value.sockets).toEqual([id(to, category)])
  expect({ ...result.value, sockets: initial.sockets }).toEqual(initial)
  expect(initial).toEqual(before)
  const extraction = prepareExtractionCraft(catalog, result.value)
  if (!extraction.ok) throw Error(extraction.error)
  expect(extraction.value.returns[0]).toMatchObject({ name: to, count: 1 })
})
it('恐惧增效升级仍按原符文身份，保留品质及原文观察', () => {
  const input: CraftState = {
    ...state(),
    rarity: 'rare',
    sourceText: '独立原文观察',
    affixes: [
      {
        modId: 'EssenceLocalRuneAndSoulCoreEffect1',
        crafted: true,
        lines: ['60% increased effect of Socketed Augment Items'],
      },
    ],
  }
  const p = prepareMasterworkCraft(catalog, input, 0)
  if (!p.ok) throw Error(p.error)
  expect(p.value.from.lines).toEqual(['Regenerate 0.72% of maximum Life per second'])
  expect(p.value.to.lines).toEqual(['Regenerate 0.8% of maximum Life per second'])
  const r = applyMasterworkCraft(catalog, input, p.value.operation)
  if (!r.ok) throw Error(r.error)
  expect(socketEffects(catalog, r.value)[0]?.augment.lines).toEqual(p.value.to.lines)
  expect(r.value.sourceText).toBe(input.sourceText)
  expect(r.value.quality).toBe(20)
})
it('未知空孔、无完美档、已完美、低档、非符文与过期身份拒绝', () => {
  for (const input of [
    { ...state(), sockets: undefined },
    { ...state(), sockets: [null] },
    state('Perfect Rebirth Rune'),
    state('Rebirth Rune'),
    state('Lesser Rebirth Rune'),
    state('Greater Tempered Rune'),
    state('Soul Core of Tacati'),
  ])
    expect(prepareMasterworkCraft(catalog, input as CraftState, 0).ok).toBe(false)
  for (const index of [-1, 0.5, 1, NaN])
    expect(prepareMasterworkCraft(catalog, state(), index).ok).toBe(false)
  const p = prepareMasterworkCraft(catalog, state(), 0)
  if (!p.ok) throw Error(p.error)
  expect(applyMasterworkCraft(catalog, state('Greater Ward Rune'), p.value.operation).ok).toBe(
    false,
  )
  expect(
    applyMasterworkCraft(catalog, state(), {
      ...p.value.operation,
      toAugmentId: id('Perfect Ward Rune'),
    }).ok,
  ).toBe(false)
  expect(isMasterworkCraftOperation({ ...p.value.operation, extra: true })).toBe(false)
})
it('缺少材料/来源声明不能升级；腐化与待揭示保留明确边界', () => {
  const missing = {
    ...catalog,
    augments: catalog.augments?.filter((a) => a.name !== 'Masterwork Rune') ?? [],
  }
  expect(prepareMasterworkCraft(missing, state(), 0).ok).toBe(false)
  const broken = structuredClone(catalog)
  broken._meta.sources = broken._meta.sources.filter((s) => s.path !== 'src/Data/ModRunes.lua')
  expect(prepareMasterworkCraft(broken, state(), 0).ok).toBe(false)
  expect(prepareMasterworkCraft(catalog, { ...state(), corrupted: true }, 0).ok).toBe(false)
  expect(prepareMasterworkCraft(catalog, { ...state(), destroyed: true }, 0).ok).toBe(false)
})

import { collectCraftCosts } from './craftCosts'
import { applyCraftStep } from './craftSteps'
import { checkCraftStrategyAction, readCraftStrategyAction } from './strategyActions'

it('统一制作步骤、材料费用与条件动作识别升级，不计完美符文购买', () => {
  const p = prepareMasterworkCraft(catalog, state(), 0)
  if (!p.ok) throw Error(p.error)
  expect(applyCraftStep(catalog, state(), p.value.operation).ok).toBe(true)
  const cost = collectCraftCosts(catalog, [p.value.operation])
  expect(cost).toMatchObject({ ok: true, value: [{ id: 'augment:Masterwork Rune', count: 1 }] })
  const action = { kind: 'masterwork', socketIndex: 0 } as const
  expect(readCraftStrategyAction(action)).toEqual(action)
  expect(checkCraftStrategyAction(catalog, state(), action).ok).toBe(true)
  expect(readCraftStrategyAction({ ...action, socketIndex: -1 })).toBeNull()
})

import { operationMatchesStrategyAction } from './strategyStages'

it('分阶段升级指引只匹配同一孔位，手动升级另一孔不推进流程', () => {
  const action = { kind: 'masterwork', socketIndex: 0 } as const
  const step = {
    kind: 'masterwork',
    socketIndex: 1,
    fromAugmentId: id('Greater Rebirth Rune'),
    toAugmentId: id('Perfect Rebirth Rune'),
  } as const
  expect(operationMatchesStrategyAction(state(), action, step)).toBe(false)
  expect(operationMatchesStrategyAction(state(), action, { ...step, socketIndex: 0 })).toBe(true)
})
