import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts, craftMaterials, parseCraftPricing, quoteCraftCosts } from './craftCosts'
import { applyFluxCraft, type FluxCraftOperation } from './fluxCraft'
import { FLUXES } from './fluxes'
import { checkCraftStrategyAction, readCraftStrategyAction } from './strategyActions'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
function state() {
  const result = enableCraftAffixIdentity(catalog, {
    baseId: 'Gold Ring',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    affixes: [
      { modId: 'ColdResist4', lines: ['+21% to Cold Resistance'] },
      { modId: 'LightningResist4', lines: ['+23% to Lightning Resistance'] },
    ],
  })
  if (!result.ok) throw Error(result.error)
  return result.value
}
const operation: FluxCraftOperation = {
  kind: 'flux',
  fluxId: FLUXES[0].id,
  rolls: [
    { affixId: 'a1', modId: 'FireResist4', values: [22] },
    { affixId: 'a2', modId: 'FireResist4', values: [25] },
  ],
}
it('实际多项转换按每次一份计费，未应用无费用，可信材料报价可解析', () => {
  expect(applyFluxCraft(catalog, state(), operation).ok).toBe(true)
  const id = `flux:${FLUXES[0].id}`
  expect(craftMaterials(catalog)).toContainEqual({ id, name: 'Blazing Flux' })
  expect(collectCraftCosts(catalog, [])).toEqual({ ok: true, value: [] })
  expect(collectCraftCosts(catalog, [operation])).toEqual({
    ok: true,
    value: [{ id, name: 'Blazing Flux', count: 1 }],
  })
  const pricing = { unit: 'divine' as const, prices: { [id]: 2.5 } }
  expect(parseCraftPricing(pricing, catalog)).toEqual({ ok: true, value: pricing })
  expect(quoteCraftCosts([{ id, name: 'Blazing Flux', count: 1 }], pricing)).toMatchObject({
    ok: true,
    value: { total: 2.5 },
  })
  const { fluxes: _, ...primary } = catalog
  expect(craftMaterials(primary).some((m) => m.id.startsWith('flux:'))).toBe(false)
  expect(collectCraftCosts(primary, [operation]).ok).toBe(false)
  expect(parseCraftPricing(pricing, primary).ok).toBe(false)
  expect(collectCraftCosts(catalog, [{ ...operation, fluxId: 'unknown' }]).ok).toBe(false)
})
it('指引只读取四种明确材料，开始时复用真实资格，缺来源或破裂组合阻塞', () => {
  const action = { kind: 'flux' as const, fluxId: FLUXES[0].id }
  expect(readCraftStrategyAction(action)).toEqual(action)
  for (const bad of [
    { ...action, fluxId: 'unknown' },
    { ...action, omen: undefined },
    { ...action, rolls: [] },
    { kind: 'flux' },
    { ...action, fluxId: undefined },
  ])
    expect(readCraftStrategyAction(bad)).toBeNull()
  expect(checkCraftStrategyAction(catalog, state(), action)).toEqual({ ok: true, value: null })
  const { fluxes: _, ...primary } = catalog
  expect(checkCraftStrategyAction(primary, state(), action).ok).toBe(false)
  const fractured = state()
  const first = fractured.affixes[0]
  if (!first) throw Error('缺少测试词缀')
  first.fractured = true
  expect(checkCraftStrategyAction(catalog, fractured, action)).toMatchObject({
    ok: false,
    error: expect.stringContaining('尚未核实'),
  })
})
