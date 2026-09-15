import { expect, it } from 'vitest'
import { CRAFT_RULES_VERSION } from './craftProject'
import { serializeTargetCraftProject, upgradeTargetCraftProject } from './craftProjectTargets'
import { catalog as makeCatalog } from './partialTargetFixture'
import type { CraftResult } from './rehearsal'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog = makeCatalog(undefined, { socketLimit: null })
const must = <T>(r: CraftResult<T>): T => {
  if (!r.ok) throw Error(r.error)
  return r.value
}
function legacy() {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: {
      baseId: 'Focus',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
    },
    operations: [{ currency: 'transmutation', modIds: ['p1'] }],
    cursor: 0,
    targetModIds: ['p1'],
    pricing: { unit: 'divine', prices: {}, baseCost: 2 },
  }
}
const fresh = () => must(upgradeTargetCraftProject(JSON.stringify(legacy()), catalog))
it('统一入口升级旧原文、严格恢复v74，全部future实例保留', () => {
  const expected = fresh()
  expect(loadTargetWorkbenchProject(JSON.stringify(legacy()), catalog)).toEqual({
    ok: true,
    value: expected,
  })
  expect(loadTargetWorkbenchProject(JSON.stringify(expected.project), catalog)).toEqual({
    ok: true,
    value: expected,
  })
  const broken = structuredClone(expected.project)
  delete (broken.initialState as unknown as Record<string, unknown>).nextAffixId
  expect(loadTargetWorkbenchProject(JSON.stringify(broken), catalog).ok).toBe(false)
})
it('沿用完整目标身份域与孤儿，保留接收历史和报价，阶段从接收游标开始', () => {
  const current = fresh()
  const template = fresh()
  template.project.operations = []
  template.project.cursor = 0
  template.project.targetDefinitions = {
    nextTargetId: 8,
    targets: [{ targetId: 't6', modId: 's1' }],
    alternatives: [],
    values: [],
  }
  template.project.orphanedTargets = [{ targetId: 't7', modId: 's1' }]
  template.project.strategy = {
    maxSteps: 10,
    flow: { entryStageId: 'a', stages: [{ id: 'a', name: '检查' }] },
    rules: [
      {
        stageId: 'a',
        conditions: [{ kind: 'selected-targets', targetIds: ['t7'], min: 1, value: false }],
        action: { kind: 'stop' },
      },
    ],
  }
  template.project.strategyStartStep = 0
  template.project.pricing = { unit: 'divine', prices: {}, baseCost: 99 }
  const source = must(serializeTargetCraftProject(template.project, catalog))
  const result = must(reuseTargetCraftPlan(JSON.stringify(current.project), source, catalog))
  expect(result.states).toEqual(current.states)
  expect(result.project.operations).toEqual(current.project.operations)
  expect(result.project.pricing).toEqual(current.project.pricing)
  expect(result.project.targetDefinitions).toEqual(template.project.targetDefinitions)
  expect(result.project.orphanedTargets).toEqual(template.project.orphanedTargets)
  expect(result.project.strategy).toEqual(template.project.strategy)
  expect(result.project.strategyStartStep).toBe(current.project.cursor)
  expect(template.project.pricing.baseCost).toBe(99)
})
it('不沿用空方案，旧错来源与新版混用字段均不能先修复再接收', () => {
  const current = fresh()
  const empty = fresh()
  empty.project.targetDefinitions = { nextTargetId: 1, targets: [], alternatives: [], values: [] }
  expect(
    reuseTargetCraftPlan(JSON.stringify(current.project), JSON.stringify(empty.project), catalog)
      .ok,
  ).toBe(false)
  expect(
    loadTargetWorkbenchProject(JSON.stringify({ ...legacy(), essenceSourceHash: 'wrong' }), catalog)
      .ok,
  ).toBe(false)
  expect(
    loadTargetWorkbenchProject(JSON.stringify({ ...current.project, targetModIds: [] }), catalog)
      .ok,
  ).toBe(false)
})
