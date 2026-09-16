import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { analyzeAlloyTargets } from './alloyAdvice'
import { alloyTestFixture } from './alloyTestFixture'
import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import type { CraftResult, CraftState } from './rehearsal'

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
