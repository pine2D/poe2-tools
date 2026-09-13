import { expect, it } from 'vitest'
import { catalog, imported } from './catalystTestFixture'
import { inspectNumericLines, renderNumericLines } from './numeric'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets, type CraftTargetValues, craftTargetsSatisfied } from './targets'

it('可选有效生命无解时，神圣仍可推进魔力目标；全部模式保持拒绝', () => {
  const source = imported()
  if (!source.ok) throw new Error(source.error)
  const mana = catalog.modifiers.find((mod) => mod.id === 'IncreasedMana1')
  if (!mana) throw new Error('缺少魔力目录')
  const ranges = inspectNumericLines(mana.lines)
  if (!ranges.ok || ranges.value.length !== 1) throw new Error('魔力范围异常')
  const range = ranges.value[0]
  if (!range) throw new Error('缺少范围')
  const rendered = renderNumericLines(mana.lines, [range.min])
  if (!rendered.ok) throw new Error(rendered.error)
  const current = {
    ...source.value,
    catalyst: { id: 'Flesh', quality: 10, declared: true as const },
    sourceText: null,
    affixes: [
      { modId: 'IncreasedLife1', lines: ['+10(10-19) to maximum Life'] },
      { modId: mana.id, lines: rendered.value },
    ],
  }
  const ids = ['IncreasedLife1', mana.id]
  const values: CraftTargetValues[] = [
    { modId: 'IncreasedLife1', basis: 'effective', bounds: [{ index: 0, min: 22 }] },
    { modId: mana.id, bounds: [{ index: 0, min: range.max }] },
  ]
  const partial = analyzeCraftTargets(
    catalog,
    current,
    ids,
    values,
    [],
    undefined,
    [],
    undefined,
    1,
  )
  const all = analyzeCraftTargets(catalog, current, ids, values)
  if (!partial.ok || !all.ok) throw new Error('分析失败')
  expect(partial.value.steps.some((step) => step.currency === 'divine')).toBe(true)
  expect(all.value.steps.some((step) => step.currency === 'divine')).toBe(false)
  const routes = planCraftTargetRoutes(catalog, current, ids, values, [], {
    minimumTargetCount: 1,
    maxDepth: 1,
    maxStates: 16,
  })
  if (!routes.ok) throw new Error(routes.error)
  expect(routes.value.routes.length).toBeGreaterThan(0)
  for (const route of routes.value.routes) {
    const final = analyzeCraftTargets(
      catalog,
      route.finalState,
      ids,
      values,
      [],
      undefined,
      [],
      undefined,
      1,
    )
    if (!final.ok) throw new Error(final.error)
    expect(craftTargetsSatisfied(final.value, 1)).toBe(true)
  }
})
it('数量满足仍需完成固有目标，不能在起点或重掷前停止', () => {
  const source = imported()
  if (!source.ok) throw new Error(source.error)
  const ids = ['IncreasedLife1', 'IncreasedMana1']
  const implicit = [{ lineIndex: 0, bounds: [{ index: 0, min: 15 }] }]
  const routes = planCraftTargetRoutes(
    catalog,
    source.value,
    ids,
    [],
    [],
    { minimumTargetCount: 1, maxDepth: 1, maxStates: 16 },
    implicit,
  )
  if (!routes.ok) throw new Error(routes.error)
  expect(routes.value.alreadyMatched).toBe(false)
  expect(routes.value.routes.length).toBeGreaterThan(0)
  for (const route of routes.value.routes)
    expect(route.finalState.implicitLines).toEqual(['15(6-15)% increased Rarity of Items found'])
})
