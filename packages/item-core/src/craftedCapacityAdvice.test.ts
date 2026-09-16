import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { analyzeAlloyTargets } from './alloyAdvice'
import { alloyTestFixture } from './alloyTestFixture'
import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { validateStoredTargetDefinitions } from './targetDefinitions'
import { validateCraftTargets } from './targets'

const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog = { ...primary, alloys: alloyTestFixture() }
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function oneCraft(): CraftState {
  return must(
    applyCraftStep(
      catalog,
      {
        baseId: 'Volatile Wand',
        itemLevel: 86,
        rarity: 'magic',
        sourceText: null,
        sockets: ['pob2:augment:["Astrid\'s Creativity","caster"]'],
        affixes: [{ modId: 'SpellDamageOnWeapon1', lines: ['30% increased Spell Damage'] }],
      },
      {
        kind: 'essence',
        essenceId: 'Metadata/Items/Currency/CurrencyGreaterEssenceCritical',
        values: [50],
      },
    ),
  )
}
it('Astrid已有精华仍建议第二组合金，回放保留原工艺与目标', () => {
  const state = oneCraft()
  const target = 'AlloyEffectOfSocketedAugments1'
  const steps = must(analyzeAlloyTargets(catalog, state, [target, 'SpellCriticalStrikeChance4']))
  const preserving = steps.find((s) => s.operation.removeModId === 'SpellDamageOnWeapon1')
  expect(preserving).toBeDefined()
  if (!preserving) throw Error('缺少保留精华的建议')
  const final = must(applyCraftStep(catalog, state, preserving.operation))
  expect(final.affixes.filter((a) => a.crafted)).toHaveLength(2)
  expect(preserving.lostTargetIds).toEqual([])
  expect(
    must(analyzeAlloyTargets(catalog, final, ['AlloyCastSpeedDamageAsExtraColdHybridOneHand1'])),
  ).toEqual([])
  expect(must(analyzeAlloyTargets(catalog, { ...state, sockets: [null] }, [target]))).toEqual([])
  expect(must(analyzeAlloyTargets(primary, state, [target]))).toEqual([])
})

it('第二工艺建议不越过合法移除池、物等和Astrid来源校验', () => {
  const state = oneCraft()
  const target = 'AlloyEffectOfSocketedAugments1'
  const frozen = {
    ...state,
    affixes: state.affixes.map((a) => (a.crafted ? a : { ...a, fractured: true as const })),
  }
  expect(
    must(analyzeAlloyTargets(catalog, frozen, [target])).every(
      (step) => step.operation.removeModId !== 'SpellDamageOnWeapon1',
    ),
  ).toBe(true)
  expect(must(analyzeAlloyTargets(catalog, { ...state, itemLevel: 1 }, [target]))).toEqual([])
  const invalid = structuredClone(catalog)
  invalid._meta.sources = invalid._meta.sources.filter((s) => s.path !== 'src/Data/ModRunes.lua')
  expect(analyzeAlloyTargets(invalid, state, [target]).ok).toBe(false)
})

it.each([false, true])(
  '君王镶嵌增效目标用合法代表值核对组合，不补写当前未知实际值（Serle=%s）',
  (serle) => {
    const state = oneCraft()
    if (serle) state.sockets?.push('pob2:augment:["Serle\'s Triumph","caster"]')
    const before = structuredClone(state)
    const ids = ['AlloyEffectOfSocketedAugments1', 'SpellCriticalStrikeChance4']
    expect(validateCraftTargets(catalog, state.baseId, ids, undefined, undefined, state).ok).toBe(
      true,
    )
    expect(
      validateStoredTargetDefinitions(
        catalog,
        state.baseId,
        {
          nextTargetId: 3,
          targets: ids.map((modId, i) => ({ modId, targetId: `t${i + 1}` })),
          alternatives: [],
          values: [],
        },
        state,
      ).ok,
    ).toBe(true)
    expect(
      createCraftState(catalog, {
        ...state,
        affixes: [
          {
            modId: ids[0] as string,
            lines: ['(20-30)% increased effect of Socketed Augment Items'],
            crafted: true,
          },
        ],
      }).ok,
    ).toBe(false)
    expect(state).toEqual(before)
  },
)

it('Serle与恐惧的固定增效目标组合仍可同时核对', () => {
  const state: CraftState = {
    baseId: 'Adherent Cuffs',
    rarity: 'rare',
    itemLevel: 86,
    sourceText: null,
    affixes: [],
    sockets: [
      'pob2:augment:["Serle\'s Triumph","armour"]',
      'pob2:augment:["Astrid\'s Creativity","armour"]',
    ],
  }
  const ids = ['EssenceLocalRuneAndSoulCoreEffect1', 'IncreasedLife7']
  expect(validateCraftTargets(catalog, state.baseId, ids, undefined, undefined, state).ok).toBe(
    true,
  )
  expect(
    validateStoredTargetDefinitions(
      catalog,
      state.baseId,
      {
        nextTargetId: 3,
        targets: ids.map((modId, i) => ({ modId, targetId: `t${i + 1}` })),
        alternatives: [],
        values: [],
      },
      state,
    ).ok,
  ).toBe(true)
})
