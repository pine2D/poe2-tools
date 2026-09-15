import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { prepareAlloyCraft } from './alloyCraft'
import { alloyTestFixture } from './alloyTestFixture'
import type { CatalogMod, CraftCatalog } from './catalog'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { prepareEssenceCraft } from './essenceCraft'
import { prepareLiquidEmotionCraft } from './liquidEmotionCraft'
import { inspectNumericLines } from './numeric'
import { type CraftAffix, type CraftResult, type CraftState, createCraftState } from './rehearsal'

const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog = { ...primary, alloys: alloyTestFixture() }
const ring: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  affixes: [
    { modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] },
    { modId: 'FireResist1', lines: ['+10% to Fire Resistance'] },
  ],
}
const jewel: CraftState = {
  ...ring,
  baseId: 'Ruby',
  affixes: [{ modId: 'JewelFireDamage', lines: ['10% increased Fire Damage'] }],
}
const perfect = 'Metadata/Items/Currency/CurrencyPerfectEssenceMana'
const lesser = 'Metadata/Items/Currency/CurrencyLesserEssenceMana'
const alloy = 'Metadata/Items/Currency/CurrencyVerisiumAlloy1'
const emotion = 'Metadata/Items/Currency/DistilledEmotion1'
function required<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
const cases = [
  {
    name: '精华',
    state: ring,
    prepare: (state: CraftState) => prepareEssenceCraft(catalog, state, perfect),
    step: { kind: 'essence', essenceId: perfect },
  },
  {
    name: '合金',
    state: ring,
    prepare: (state: CraftState) => prepareAlloyCraft(catalog, state, alloy),
    step: { kind: 'alloy', alloyId: alloy },
  },
  {
    name: '液态情感',
    state: jewel,
    prepare: (state: CraftState) => prepareLiquidEmotionCraft(catalog, state, emotion),
    step: { kind: 'liquid-emotion', emotionId: emotion },
  },
] as const

describe.each(cases)('$name 的词缀实例', ({ state: legacy, prepare, step }) => {
  const baseline = required<{ mod: CatalogMod; removableAffixes: CraftAffix[] }>(prepare(legacy))
  const values = required(inspectNumericLines(baseline.mod.lines)).map((range) => range.min)
  const removeModId = legacy.affixes[0]?.modId ?? ''
  const operation = { ...step, removeModId, values } as CraftStep

  it('候选与旧模式一致且独立预演不消耗实例游标', () => {
    const state = required(enableCraftAffixIdentity(catalog, legacy))
    const snapshot = structuredClone(state)
    const result = required<{ mod: CatalogMod; removableAffixes: CraftAffix[] }>(prepare(state))
    expect(result.removableAffixes).toEqual(state.affixes)
    expect(result.removableAffixes.map((a) => a.modId)).toEqual(
      baseline.removableAffixes.map((a) => a.modId),
    )
    expect(prepare(state)).toEqual({ ok: true, value: result })
    expect(state).toEqual(snapshot)
  })

  it('替换结束旧实例、分配新实例，并能继续准确移除工艺词缀', () => {
    const state = required(enableCraftAffixIdentity(catalog, legacy))
    const snapshot = structuredClone(state)
    const selected = { ...operation, removeAffixId: 'a1' } as CraftStep
    const result = required(applyCraftStep(catalog, state, selected))
    expect(result.affixes.slice(0, -1)).toEqual(state.affixes.slice(1))
    expect(result.affixes.at(-1)).toMatchObject({
      modId: baseline.mod.id,
      affixId: `a${state.nextAffixId}`,
      crafted: true,
    })
    expect(result.nextAffixId).toBe(state.nextAffixId + 1)
    expect(createCraftState(catalog, result)).toEqual({ ok: true, value: result })
    expect(required(applyCraftStep(catalog, state, selected))).toEqual(result)
    const oldResult = required(applyCraftStep(catalog, legacy, operation))
    const { nextAffixId: _, ...semantic } = result
    expect({
      ...semantic,
      affixes: result.affixes.map(({ affixId: _, ...affix }) => affix),
    }).toEqual(oldResult)
    const removed = required(
      applyCraftStep(catalog, result, {
        currency: 'annulment',
        modIds: [],
        removeModId: baseline.mod.id,
        removeAffixId: `a${state.nextAffixId}`,
      }),
    )
    expect(removed.affixes).toEqual(state.affixes.slice(1))
    expect(removed.nextAffixId).toBe(result.nextAffixId)
    expect(state).toEqual(snapshot)
  })

  it('旧唯一类型选择可用于实例状态，但指定身份不能退回类型匹配', () => {
    const state = required(enableCraftAffixIdentity(catalog, legacy))
    expect(applyCraftStep(catalog, state, operation)).toEqual(
      applyCraftStep(catalog, state, { ...operation, removeAffixId: 'a1' } as CraftStep),
    )
    for (const removeAffixId of ['a99', 'a2', '', undefined]) {
      expect(applyCraftStep(catalog, state, { ...operation, removeAffixId } as CraftStep).ok).toBe(
        false,
      )
    }
    expect(
      applyCraftStep(catalog, legacy, { ...operation, removeAffixId: 'a1' } as CraftStep).ok,
    ).toBe(false)
  })

  it('实例身份不能绕过破裂保护', () => {
    const state = required(
      enableCraftAffixIdentity(catalog, {
        ...legacy,
        affixes: legacy.affixes.map((affix, index) =>
          index === 0 ? { ...affix, fractured: true } : affix,
        ),
      }),
    )
    expect(
      applyCraftStep(catalog, state, { ...operation, removeAffixId: 'a1' } as CraftStep).ok,
    ).toBe(false)
  })
})

it('升级精华分配新实例并保留旧实例，不接受任何移除字段', () => {
  const legacy: CraftState = { ...ring, rarity: 'magic' }
  const state = required(enableCraftAffixIdentity(catalog, legacy))
  const prepared = required(prepareEssenceCraft(catalog, legacy, lesser))
  const values = required(inspectNumericLines(prepared.mod.lines)).map((range) => range.min)
  expect(prepareEssenceCraft(catalog, state, lesser).ok).toBe(true)
  const step: CraftStep = { kind: 'essence', essenceId: lesser, values }
  const result = required(applyCraftStep(catalog, state, step))
  expect(result.affixes.slice(0, -1)).toEqual(state.affixes)
  expect(result.affixes.at(-1)).toMatchObject({
    affixId: 'a3',
    modId: prepared.mod.id,
    crafted: true,
  })
  expect(result.nextAffixId).toBe(4)
  expect(result.rarity).toBe('rare')
  for (const fields of [
    { removeAffixId: 'a1' },
    { removeAffixId: undefined },
    { removeModId: undefined },
    { removeModId: 'IncreasedLife1' },
  ])
    expect(applyCraftStep(catalog, state, { ...step, ...fields } as CraftStep).ok).toBe(false)
})
