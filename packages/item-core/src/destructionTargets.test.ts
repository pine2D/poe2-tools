import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts } from './craftCosts'
import { applyCraftStep } from './craftSteps'
import type { CraftResult, CraftState } from './rehearsal'
import { findTargetCapacityContext } from './targetCapacityContext'
import { planTargetDefinitionRoutes } from './targetDefinitionRoutes'
import { craftTargetDefinitionCandidates, validateTargetDefinitions } from './targetDefinitions'
import { extractTargetDefinitions } from './targetExtraction'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const augmentId = 'pob2:augment:["Thrud\'s Might","weapon"]'
const modId = 'DestructionInfluenceSpeedModifierEffect'
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
const source: CraftState = {
  baseId: 'Crude Bow',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  sockets: [augmentId],
  nextAffixId: 2,
  affixes: [{ affixId: 'a1', modId, lines: ['30% increased Explicit Speed Modifier magnitudes'] }],
}

it('已镶来源支持目标提取与独立搜索，无来源不能提前授权', () => {
  const definitions = must(extractTargetDefinitions(catalog, source, [modId], false, false))
  expect(validateTargetDefinitions(catalog, source, definitions).ok).toBe(true)
  expect(
    craftTargetDefinitionCandidates(catalog, source.baseId, source).some((m) => m.id === modId),
  ).toBe(true)
  expect(craftTargetDefinitionCandidates(catalog, source.baseId).some((m) => m.id === modId)).toBe(
    false,
  )
  const initial = { ...source, sockets: [null], affixes: [], nextAffixId: 1 }
  expect(validateTargetDefinitions(catalog, initial, definitions).ok).toBe(false)
  expect(findTargetCapacityContext(catalog, [initial, source], definitions)).toEqual(source)
})

it.each([false, true])('未执行来源支持逐步打孔镶嵌与目标制作路线，需打孔=%s', (needsSocket) => {
  const definitions = must(extractTargetDefinitions(catalog, source, [modId], false, false))
  const initial: CraftState = {
    ...source,
    rarity: 'normal',
    sockets: needsSocket ? [] : [null],
    affixes: [],
    nextAffixId: 1,
  }
  const result = must(
    planTargetDefinitionRoutes(
      catalog,
      initial,
      definitions,
      { maxStates: 24, maxDepth: 4 },
      [],
      source,
    ),
  )
  expect(result.routes.length).toBeGreaterThan(0)
  for (const route of result.routes) {
    let current = initial
    for (const step of route.steps) current = must(applyCraftStep(catalog, current, step.operation))
    expect(current.affixes.some((a) => a.modId === modId)).toBe(true)
    expect(current.sockets?.includes(augmentId)).toBe(true)
    const costs = must(
      collectCraftCosts(
        catalog,
        route.steps.map((step) => step.operation),
      ),
    )
    expect(costs.find((cost) => cost.name === "Thrud's Might")?.count).toBe(1)
    expect(costs.find((cost) => cost.id === 'currency:artificer')?.count ?? 0).toBe(
      needsSocket ? 1 : 0,
    )
  }
  expect(initial.affixes).toEqual([])
})
