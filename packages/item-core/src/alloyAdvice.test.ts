import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { analyzeAlloyTargets } from './alloyAdvice'
import { alloyTestFixture } from './alloyTestFixture'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts } from './craftCosts'
import { applyCraftStep } from './craftSteps'
import { evaluateCraftStrategy } from './craftStrategy'
import type { CraftState } from './rehearsal'
import { operationMatchesStrategyAction } from './strategyStages'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('缺少测试记录')
  return value
}

const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog = { ...primary, alloys: alloyTestFixture() }
const state: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  affixes: [
    { modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] },
    { modId: 'FireResist1', lines: ['+9% to Fire Resistance'] },
  ],
}
const target = 'AlloyMaximumRunicWard1'
const ids = [target, 'FireResist1']
const values = [{ modId: target, bounds: [{ index: 0, min: 45 }] }]

it('合金目标建议覆盖合法移除池，实际回放满足数值并计入独立材料', () => {
  const result = analyzeAlloyTargets(catalog, state, ids, values)
  if (!result.ok) throw Error(result.error)
  expect(result.value).toHaveLength(2)
  expect(result.value[0]).toMatchObject({
    operation: { removeModId: 'IncreasedLife1', values: [45] },
    lostTargetIds: [],
    atRiskTargetIds: ['FireResist1'],
  })
  const step = required(result.value[0]).operation
  const applied = applyCraftStep(catalog, state, step)
  if (!applied.ok) throw Error(applied.error)
  expect(analyzeCraftTargets(catalog, applied.value, ids, values)).toMatchObject({
    ok: true,
    value: { targets: [{ matched: true }, { matched: true }] },
  })
  expect(collectCraftCosts(catalog, [step])).toMatchObject({
    ok: true,
    value: [{ id: `alloy:${step.alloyId}`, count: 1 }],
  })
  expect(
    analyzeAlloyTargets(catalog, state, ids, values, [], { consumeCandidate: () => false }),
  ).toEqual({ ok: true, value: [] })
})

it('有界路线接入合金且可从结果继续条件指引，阶段必须匹配真实材料', () => {
  const routes = planCraftTargetRoutes(catalog, state, ids, values, [], {
    maxDepth: 1,
    maxStates: 15,
  })
  if (!routes.ok) throw Error(routes.error)
  const alloy = routes.value.routes.find((route) =>
    route.steps.some((step) => 'kind' in step.operation && step.operation.kind === 'alloy'),
  )
  expect(alloy).toBeDefined()
  const action = {
    kind: 'alloy' as const,
    alloyId: 'Metadata/Items/Currency/CurrencyVerisiumAlloy1',
  }
  const strategy = { maxSteps: 10, rules: [{ conditions: [{ kind: 'always' as const }], action }] }
  expect(evaluateCraftStrategy(catalog, state, strategy, 0)).toMatchObject({
    ok: true,
    value: { action },
  })
  const operation = required(required(alloy).steps[0]).operation
  expect(operationMatchesStrategyAction(state, action, operation)).toBe(true)
  expect(
    operationMatchesStrategyAction(
      state,
      { ...action, alloyId: 'Metadata/Items/Currency/CurrencyVerisiumAlloy5' },
      operation,
    ),
  ).toBe(false)
  const checked = evaluateCraftStrategy(catalog, required(alloy).finalState, strategy, 1)
  expect(checked).toMatchObject({ ok: true, value: { kind: 'blocked' } })
})
