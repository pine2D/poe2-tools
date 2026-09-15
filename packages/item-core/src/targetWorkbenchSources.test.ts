import { expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { CRAFT_RULES_VERSION, type CraftProject } from './craftProject'
import { serializeTargetCraftProject, upgradeTargetCraftProject } from './craftProjectTargets'
import { evaluateDefinitionCraftStrategy } from './definitionStrategy'
import { essenceSourceHash } from './essences'
import type { CraftResult } from './rehearsal'
import { reuseTargetCraftPlan } from './targetWorkbenchProject'

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function legacy(baseId: string): CraftProject {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: { baseId, itemLevel: 86, rarity: 'normal', affixes: [], sourceText: null },
    operations: [],
    cursor: 0,
  }
}
function fixture() {
  const oldCurrent: CraftProject = {
    ...legacy('Crude Bow'),
    operations: [{ kind: 'vaal', outcome: 'unchanged' }],
    pricing: { unit: 'divine', prices: {}, baseCost: 2 },
  }
  const oldTemplate: CraftProject = {
    ...legacy('Gold Ring'),
    pricing: { unit: 'divine', prices: {}, baseCost: 99 },
    strategy: {
      maxSteps: 10,
      rules: [
        {
          conditions: [{ kind: 'selected-targets', modIds: ['FireResist2'], min: 1, value: false }],
          action: { kind: 'stop' },
        },
      ],
    },
  }
  return {
    oldCurrent,
    oldTemplate,
    current: must(upgradeTargetCraftProject(JSON.stringify(oldCurrent), catalog)),
    template: must(upgradeTargetCraftProject(JSON.stringify(oldTemplate), catalog)),
  }
}

it('真实目录跨基底沿用补充新必需来源，失联反向条件仍阻止执行并保留接收未来历史与报价', () => {
  const { current, template } = fixture()
  const before = structuredClone({ current, template })
  // FireResist2 在戒指上有普通资格，在弓上仅作为已失联的原目标类型保留。
  expect(template.project).not.toHaveProperty('essenceSourceHash')
  const result = must(
    reuseTargetCraftPlan(
      must(serializeTargetCraftProject(current.project, catalog)),
      must(serializeTargetCraftProject(template.project, catalog)),
      catalog,
    ),
  )
  expect(result.project.essenceSourceHash).toBe(essenceSourceHash(catalog))
  expect(result.project.targetDefinitions).toEqual(template.project.targetDefinitions)
  expect(result.project.orphanedTargets).toEqual([{ targetId: 't1', modId: 'FireResist2' }])
  expect(result.project.strategy).toEqual(template.project.strategy)
  expect(result.project.initialState).toEqual(current.project.initialState)
  expect(result.project.operations).toEqual([{ kind: 'vaal', outcome: 'unchanged' }])
  expect(result.project.cursor).toBe(0)
  expect(result.states).toEqual(current.states)
  expect(result.states).toHaveLength(2)
  expect(result.project.pricing).toEqual({ unit: 'divine', prices: {}, baseCost: 2 })
  const state = result.states[result.project.cursor]
  const strategy = result.project.strategy
  if (!state || !strategy) throw Error('缺少测试状态或策略')
  expect(
    evaluateDefinitionCraftStrategy(catalog, state, strategy, result.project.cursor, {
      definitions: result.project.targetDefinitions,
    }),
  ).toMatchObject({ ok: true, value: { kind: 'blocked', message: expect.stringContaining('t1') } })
  expect(serializeTargetCraftProject(result.project, catalog).ok).toBe(true)
  expect({ current, template }).toEqual(before)
})

it('旧原文和新版两侧输入的非法来源先拒绝，不能在沿用时用当前指纹修复', () => {
  const { oldCurrent, oldTemplate, current, template } = fixture()
  for (const invalid of [oldTemplate, template.project]) {
    const result = reuseTargetCraftPlan(
      JSON.stringify(current.project),
      JSON.stringify({ ...invalid, essenceSourceHash: 'wrong' }),
      catalog,
    )
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('收藏方案无效') })
  }
  for (const invalid of [oldCurrent, current.project]) {
    const result = reuseTargetCraftPlan(
      JSON.stringify({ ...invalid, essenceSourceHash: 'wrong' }),
      JSON.stringify(template.project),
      catalog,
    )
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('当前项目无效') })
  }
})
