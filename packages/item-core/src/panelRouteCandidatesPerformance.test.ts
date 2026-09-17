import { expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { readCraftProperty } from './itemProperties'
import type { CraftState } from './rehearsal'
import { planTargetDefinitionRoutes } from './targetDefinitionRoutes'

it.each(['Brimmed Helm', 'Crude Bow'])('真实目录有限预算面板路线：%s', (baseId) => {
  const state: CraftState = {
    baseId,
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    quality: 0,
    sockets: [],
    sourceText: null,
  }
  const property = baseId === 'Brimmed Helm' ? 'Armour' : 'physicalDps'
  const before = readCraftProperty(catalog, state, property)
  if (!before.ok) throw Error(before.error)
  const start = performance.now()
  const result = planTargetDefinitionRoutes(
    catalog,
    state,
    {
      nextTargetId: 1,
      targets: [],
      alternatives: [],
      values: [],
      panelGoals: [{ kind: 'item-property', property, min: before.value * 1.5 }],
    },
    { maxStates: 4, maxDepth: 3 },
  )
  if (!result.ok) throw Error(result.error)
  console.info(
    JSON.stringify({
      baseId,
      milliseconds: Math.round(performance.now() - start),
      states: result.value.examinedStates,
      applications: result.value.candidateApplications,
      truncated: result.value.truncated,
      routes: result.value.routes.length,
    }),
  )
  expect(result.value.candidateApplications).toBeLessThanOrEqual(4096)
  expect(result.value.examinedStates).toBeLessThanOrEqual(4)
  expect(result.value.routes.length).toBeGreaterThan(0)
  expect(result.value.truncated).toBe(true)
})
