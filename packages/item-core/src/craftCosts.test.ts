import { expect, it } from 'vitest'
import { boneCatalog } from './boneTestFixture'
import { collectCraftCosts, parseCraftPricing, quoteCraftCosts } from './craftCosts'
import type { CraftStep } from './craftSteps'

it('三档通货独立计数，组合预兆与回响只按实际消费步骤计费', () => {
  const steps: CraftStep[] = [
    { currency: 'exalted', omen: 'greater_sinistral_exaltation', modIds: [] },
    { currency: 'perfect_exalted', omen: 'sinistral_exaltation', modIds: [] },
    {
      kind: 'desecrate',
      boneId: 'preserved_jawbone',
      affixKind: 'prefix',
      directionOmen: 'sinistral_necromancy',
      lichOmen: 'liege',
    },
    { kind: 'desecration-offer', modIds: ['a', 'b', 'c'], revealOmen: 'abyssal_echoes' },
    { kind: 'desecration-reroll', modIds: ['d', 'e', 'f'] },
    { kind: 'desecration-reveal', modId: 'd', values: [] },
  ]
  const r = collectCraftCosts(boneCatalog(), steps)
  if (!r.ok) throw Error(r.error)
  const counts = Object.fromEntries(r.value.map((m) => [m.id, m.count]))
  expect(counts['currency:exalted']).toBe(1)
  expect(counts['currency:perfect_exalted']).toBe(1)
  expect(counts['omen:Omen of Sinistral Exaltation']).toBe(2)
  expect(counts['omen:Omen of Abyssal Echoes']).toBe(1)
  expect(counts['bone:preserved_jawbone']).toBe(1)
  expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(9)
})
it('同名符文不同效果合并为一种材料，未知材料不会默默少计', () => {
  const catalog = boneCatalog()
  catalog.augments = [
    {
      id: 'a',
      name: 'Rune A',
      category: 'armour',
      type: 'Rune',
      localMod: false,
      lines: [],
      statOrder: [],
      tradeHashes: {},
      levelReq: 1,
    },
    {
      id: 'b',
      name: 'Rune A',
      category: 'weapon',
      type: 'Rune',
      localMod: false,
      lines: [],
      statOrder: [],
      tradeHashes: {},
      levelReq: 1,
    },
  ]
  const r = collectCraftCosts(catalog, [
    { kind: 'socket', socketIndex: 0, augmentId: 'a' },
    { kind: 'socket', socketIndex: 0, augmentId: 'b' },
  ])
  expect(r).toMatchObject({ ok: true, value: [{ id: 'augment:Rune A', count: 2 }] })
  expect(
    collectCraftCosts(catalog, [{ kind: 'essence', essenceId: 'unknown', values: [] }]).ok,
  ).toBe(false)
})
it('报价区分缺失与显式零，十进制总额、起点和未来路线分别计算', () => {
  const catalog = boneCatalog()
  const costs = collectCraftCosts(catalog, [
    { currency: 'exalted', omen: 'greater_sinistral_exaltation', modIds: [] },
  ])
  if (!costs.ok) throw Error(costs.error)
  const pricing = {
    unit: 'divine' as const,
    baseCost: 0.1,
    prices: {
      'currency:exalted': 0.2,
      'omen:Omen of Greater Exaltation': 0,
      'omen:Omen of Sinistral Exaltation': 0.3,
    },
  }
  expect(quoteCraftCosts(costs.value, pricing, true)).toMatchObject({
    ok: true,
    value: { total: 0.6, knownSubtotal: 0.6, missing: [] },
  })
  expect(quoteCraftCosts(costs.value, pricing, false)).toMatchObject({
    ok: true,
    value: { total: 0.5 },
  })
  expect(
    quoteCraftCosts(costs.value, { unit: 'divine', prices: { 'currency:exalted': 0.2 } }, true),
  ).toMatchObject({
    ok: true,
    value: {
      total: null,
      knownSubtotal: 0.2,
      missingBase: true,
      missing: expect.arrayContaining(['omen:Omen of Greater Exaltation']),
    },
  })
})
it('报价严格验证身份、单位、精度、限额及未知字段', () => {
  const catalog = boneCatalog()
  const valid = { unit: 'divine', prices: { 'currency:exalted': 0.000001 } }
  expect(parseCraftPricing(valid, catalog).ok).toBe(true)
  for (const value of [-1, Infinity, NaN, 1000001, 0.0000001])
    expect(parseCraftPricing({ ...valid, prices: { 'currency:exalted': value } }, catalog).ok).toBe(
      false,
    )
  for (const bad of [
    { ...valid, unit: 'yuan' },
    { ...valid, prices: { unknown: 1 } },
    { ...valid, baseCost: undefined },
    { ...valid, unexpected: 1 },
  ])
    expect(parseCraftPricing(bad, catalog).ok).toBe(false)
})
