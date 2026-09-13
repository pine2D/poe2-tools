import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { boneCatalog } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import type { CraftState } from './rehearsal'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets, craftTargetCandidates } from './targets'

function fixture() {
  const catalog = boneCatalog('Ring')
  required(catalog.bases[0]).tags.push('genesis_tree_minion')
  const mod = required(catalog.modifiers.find((entry) => entry.id === 'prefix1'))
  mod.eligibility = [
    { tag: 'genesis_tree_minion', value: 1 },
    { tag: 'default', value: 0 },
  ]
  const state: CraftState = {
    baseId: 'Synthetic Base',
    itemLevel: 80,
    rarity: 'rare',
    sourceText: null,
    affixes: [{ modId: mod.id, lines: ['prefix1 5'] }],
  }
  return { catalog, state }
}

it('已有Genesis属性可设数值目标，通过神圣达成并保留普通身份', () => {
  const { catalog, state } = fixture()
  expect(craftTargetCandidates(catalog, state.baseId).map((mod) => mod.id)).toContain('prefix1')
  const values = [{ modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }]
  const advice = analyzeCraftTargets(catalog, state, ['prefix1'], values)
  expect(advice).toMatchObject({
    ok: true,
    value: { targets: [{ present: true, matched: false }] },
  })
  const plan = planCraftTargetRoutes(catalog, state, ['prefix1'], values)
  expect(plan.ok).toBe(true)
  if (!plan.ok) return
  expect(plan.value.routes.length).toBeGreaterThan(0)
  for (const route of plan.value.routes) {
    let current = state
    for (const step of route.steps) {
      const applied = applyCraftStep(catalog, current, step.operation)
      expect(applied.ok).toBe(true)
      if (!applied.ok) return
      current = applied.value
    }
    expect(current.affixes[0]).toEqual({ modId: 'prefix1', lines: ['prefix1 8(1-10)'] })
  }
})

it('缺失Genesis目标明确尚不支持新增，不能建议移除冲突后重造', () => {
  const { catalog, state } = fixture()
  const other = required(catalog.modifiers.find((mod) => mod.id === 'prefix2'))
  other.group = required(catalog.modifiers.find((mod) => mod.id === 'prefix1')).group
  state.affixes = [{ modId: other.id, lines: ['prefix2 5'] }]
  const advice = analyzeCraftTargets(catalog, state, ['prefix1'])
  expect(advice).toMatchObject({
    ok: true,
    value: { targets: [{ present: false, matched: false }] },
  })
  if (!advice.ok) return
  expect(advice.value.targets[0]?.reasons).toEqual([
    '此 Genesis Tree 专属目标尚不支持新增；可导入已有属性后保留或调整数值。',
  ])
  const plan = planCraftTargetRoutes(catalog, state, ['prefix1'])
  expect(plan).toMatchObject({ ok: true, value: { routes: [] } })
})
