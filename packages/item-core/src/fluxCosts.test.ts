import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts, craftMaterials, parseCraftPricing, quoteCraftCosts } from './craftCosts'
import type { FluxCraftOperation } from './fluxCraft'
import { FLUXES } from './fluxes'

const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog: CraftCatalog = {
  ...primary,
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
it('多条转换只计一份溶剂，撤销切片和自填报价按实际应用计费', () => {
  const flux = FLUXES[0]
  const step: FluxCraftOperation = {
    kind: 'flux',
    fluxId: flux.id,
    rolls: [
      { affixId: 'a1', modId: 'FireResist1', values: [6] },
      { affixId: 'a2', modId: 'FireResist1', values: [10] },
    ],
  }
  const costs = collectCraftCosts(catalog, [step])
  expect(costs).toEqual({ ok: true, value: [{ id: `flux:${flux.id}`, name: flux.name, count: 1 }] })
  expect(collectCraftCosts(catalog, [])).toEqual({ ok: true, value: [] })
  const pricing = { unit: 'divine' as const, prices: { [`flux:${flux.id}`]: 0.25 }, baseCost: 1 }
  expect(parseCraftPricing(pricing, catalog).ok).toBe(true)
  if (!costs.ok) throw Error(costs.error)
  expect(quoteCraftCosts(costs.value, pricing, true)).toMatchObject({
    ok: true,
    value: { total: 1.25 },
  })
  expect(craftMaterials(primary).some((m) => m.id.startsWith('flux:'))).toBe(false)
  expect(collectCraftCosts(primary, [step]).ok).toBe(false)
  expect(parseCraftPricing(pricing, primary).ok).toBe(false)
})
