import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import { readDefinitionCraftStrategy } from './definitionStrategy'
import { prepareFluxCraft } from './fluxCraft'
import { FLUXES } from './fluxes'
import type { CraftState } from './rehearsal'
import { checkCraftStrategyAction, readCraftStrategyAction } from './strategyActions'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
const state: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  nextAffixId: 3,
  affixes: [
    { affixId: 'a1', modId: 'ColdResist1', lines: ['+8% to Cold Resistance'] },
    { affixId: 'a2', modId: 'LightningResist1', lines: ['+9% to Lightning Resistance'] },
  ],
}

it('四个已知Flux材料可配置，未知字段、材料及显式undefined拒绝', () => {
  for (const flux of FLUXES) {
    const action = { kind: 'flux', fluxId: flux.id }
    expect(readCraftStrategyAction(action)).toEqual(action)
    expect(
      readDefinitionCraftStrategy({
        maxSteps: 5,
        rules: [{ conditions: [{ kind: 'always' }], action }],
      }),
    ).toEqual({
      ok: true,
      value: { maxSteps: 5, rules: [{ conditions: [{ kind: 'always' }], action }] },
    })
    expect(readCraftStrategyAction({ ...action, omen: undefined })).toBeNull()
    expect(readCraftStrategyAction({ ...action, values: [] })).toBeNull()
  }
  expect(readCraftStrategyAction({ kind: 'flux', fluxId: 'unknown' })).toBeNull()
  expect(readCraftStrategyAction({ kind: 'flux', fluxId: undefined })).toBeNull()
})

it('指引开始检查复用完整Flux资格且不改变实例或游标', () => {
  const action = { kind: 'flux' as const, fluxId: FLUXES[0].id }
  const before = structuredClone(state)
  expect(checkCraftStrategyAction(catalog, state, action)).toEqual({ ok: true, value: null })
  for (const current of [
    { ...state, corrupted: true as const },
    {
      ...state,
      affixes: [
        {
          ...state.affixes[0],
          modId: 'FireResist1',
          affixId: 'a1',
          lines: ['+8% to Fire Resistance'],
        },
      ],
    },
  ]) {
    const expected = prepareFluxCraft(catalog, current, action.fluxId)
    expect(expected.ok).toBe(false)
    expect(checkCraftStrategyAction(catalog, current, action)).toEqual(expected)
  }
  const { fluxes: _, ...primary } = catalog
  expect(checkCraftStrategyAction(primary, state, action)).toEqual(
    prepareFluxCraft(primary, state, action.fluxId),
  )
  expect(state).toEqual(before)
})

it('转换后同类实例仍可在策略中精确移除，未知数值不污染另一条破裂候选', () => {
  const item: CraftState = {
    ...state,
    affixes: [
      { affixId: 'a1', modId: 'FireResist4', lines: ['+22% to Fire Resistance'] },
      { affixId: 'a2', modId: 'FireResist4', lines: ['+25% to Fire Resistance'] },
    ],
  }
  expect(
    applyCraftStep(catalog, item, {
      currency: 'annulment',
      modIds: [],
      removeModId: 'FireResist4',
      removeAffixId: 'a1',
    }).ok,
  ).toBe(true)
  expect(
    checkCraftStrategyAction(catalog, item, { kind: 'currency', currency: 'annulment' }).ok,
  ).toBe(true)
  const fire = catalog.modifiers.find((mod) => mod.id === 'FireResist4')
  const life = catalog.modifiers.find((mod) => mod.id === 'IncreasedLife1')
  if (!fire || !life) throw Error('缺少固定目录词缀')
  const mixed: CraftState = {
    ...item,
    nextAffixId: 5,
    affixes: [
      { affixId: 'a1', modId: fire.id, lines: fire.lines },
      ...item.affixes.slice(1),
      { affixId: 'a3', modId: fire.id, lines: ['+22% to Fire Resistance'] },
      { affixId: 'a4', modId: life.id, lines: life.lines },
    ],
  }
  expect(
    applyCraftStep(catalog, mixed, { kind: 'fracture', modId: fire.id, affixId: 'a2' }).ok,
  ).toBe(true)
  expect(checkCraftStrategyAction(catalog, mixed, { kind: 'fracture' }).ok).toBe(true)
  const unknown = {
    ...mixed,
    affixes: mixed.affixes.map((affix) => ({
      ...affix,
      lines: affix.modId === fire.id ? fire.lines : life.lines,
    })),
  }
  expect(checkCraftStrategyAction(catalog, unknown, { kind: 'fracture' }).ok).toBe(false)
})
