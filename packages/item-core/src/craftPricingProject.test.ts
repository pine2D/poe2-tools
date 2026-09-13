import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { collectCraftCosts, quoteCraftCosts } from './craftCosts'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'

it('v34 报价随项目保存，撤销游标只影响消费，旧项目不能注入报价', () => {
  const catalog = boneCatalog()
  const initialState = { ...boneState(), rarity: 'normal' as const }
  delete initialState.sockets
  const project: CraftProject = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState,
    operations: [
      {
        currency: 'transmutation',
        modIds: ['prefix1'],
        rolls: [{ modId: 'prefix1', values: [5] }],
      },
    ],
    cursor: 0,
    pricing: { unit: 'divine', baseCost: 2, prices: { 'currency:transmutation': 0.1 } },
  }
  for (const cursor of [0, 1]) {
    const r = parseCraftProject(serializeCraftProject({ ...project, cursor }), catalog)
    if (!r.ok) throw Error(r.error)
    expect(r.value.project.pricing).toEqual(project.pricing)
    expect(r.value.project.rulesVersion).toBe('basic-2026-09-12-v48')
    const costs = collectCraftCosts(catalog, r.value.project.operations.slice(0, cursor))
    if (!costs.ok || !r.value.project.pricing) throw Error('恢复失败')
    expect(quoteCraftCosts(costs.value, r.value.project.pricing, true)).toMatchObject({
      ok: true,
      value: { total: cursor ? 2.1 : 2 },
    })
  }
  for (let v = 2; v <= 33; v++)
    expect(
      parseCraftProject(
        JSON.stringify({ ...project, rulesVersion: `basic-2026-09-12-v${v}` }),
        catalog,
      ).ok,
    ).toBe(false)
  for (const pricing of [
    { unit: 'yuan', prices: {} },
    { unit: 'divine', prices: { unknown: 1 } },
    { unit: 'divine', baseCost: -1, prices: {} },
  ])
    expect(parseCraftProject(JSON.stringify({ ...project, pricing }), catalog).ok).toBe(false)
  expect(() =>
    serializeCraftProject({ ...project, pricing: undefined } as unknown as CraftProject),
  ).toThrow()
})
