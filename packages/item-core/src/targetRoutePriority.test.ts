import { expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import type { CraftState } from './rehearsal'
import { planCraftTargetRoutes, targetRouteContextPriority } from './targetRoutes'
import { analyzeCraftTargets, type CraftTargetValues } from './targets'

it('原生多上下文取有效阶段分的最大值，未启用上下文不能用零遮蔽惩罚', () => {
  const state: CraftState = {
    baseId: 'Ruby',
    itemLevel: 86,
    rarity: 'rare',
    affixes: [],
    sourceText: null,
  }
  const disabled = {
    enabled: false,
    priority: () => {
      throw Error('不应求未启用上下文的分数')
    },
  }
  expect(
    targetRouteContextPriority([
      disabled,
      { enabled: true, priority: () => -0.75 },
      { enabled: true, priority: () => -0.85 },
    ])(state),
  ).toBe(-0.75)
  expect(targetRouteContextPriority([disabled])(state)).toBe(0)
  expect(targetRouteContextPriority([])(state)).toBe(0)
})

it('精确有效值保留负阶段分，在有限状态内优先准备兼容终结增效的基础值', () => {
  const ids = [
    'JewelFireDamage',
    'JewelArmour',
    'JewelPhysicalDamage',
    'JewelArmourBreakDuration',
    'CraftedJewelPrefixEffect',
  ]
  const values: CraftTargetValues[] = [
    { modId: 'JewelArmour', basis: 'effective', bounds: [{ index: 0, min: 20, max: 20 }] },
  ]
  const state: CraftState = {
    baseId: 'Ruby',
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
  }
  // 基线在 13 个状态完成。固定搜索预算验证排序，不依赖机器速度。
  const result = planCraftTargetRoutes(catalog, state, ids, values, [], { maxStates: 16 })
  if (!result.ok) throw Error(result.error)
  const route = result.value.routes[0]
  expect(route).toBeDefined()
  if (!route) throw Error('缺少完整路线')
  expect(result.value.candidateApplications).toBeLessThanOrEqual(1024)
  expect(route.steps[0]?.operation).toMatchObject({
    currency: 'alchemy',
    rolls: expect.arrayContaining([{ modId: 'JewelArmour', values: [14] }]),
  })
  let current = state
  for (const step of route.steps) {
    const next = applyCraftStep(catalog, current, step.operation)
    if (!next.ok) throw Error(next.error)
    expect(next.value).toEqual(step.state)
    current = next.value
  }
  const progress = analyzeCraftTargets(catalog, current, ids, values)
  if (!progress.ok) throw Error(progress.error)
  expect(progress.value.targets.every((target) => target.matched)).toBe(true)
}, 30000)
