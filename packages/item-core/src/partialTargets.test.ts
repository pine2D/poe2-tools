import { expect, it } from 'vitest'
import { catalog, conflictingCatalog, mod, state } from './partialTargetFixture'
import { analyzeCraftTargets, craftTargetsSatisfied, validateCraftTargets } from './targets'

it('四组前缀可备选二组，全部模式仍拒绝超过三前缀', () => {
  const ids = ['p1', 'p2', 'p3', 'p4']
  expect(validateCraftTargets(catalog(), 'Focus', ids, 2)).toEqual({ ok: true, value: ids })
  expect(validateCraftTargets(catalog(), 'Focus', ids).ok).toBe(false)
  expect(validateCraftTargets(catalog(), 'Focus', ids, 4).ok).toBe(false)
})
it('部分数量严格校验，不接受零、非整数、越界、空目标数量或重复冲突组', () => {
  for (const count of [0, -1, 1.5, 3, NaN, Infinity])
    expect(validateCraftTargets(catalog(), 'Focus', ['p1', 's1'], count).ok).toBe(false)
  expect(validateCraftTargets(catalog(), 'Focus', [], 1).ok).toBe(false)
  expect(validateCraftTargets(catalog(), 'Focus', ['p1', 'high'], 1).ok).toBe(false)
  const source = catalog([
    mod('valid', 'prefix'),
    mod('bad', 'suffix', { eligibility: [{ tag: 'default', value: 0 }] }),
  ])
  expect(validateCraftTargets(source, 'Focus', ['valid', 'bad'], 1).ok).toBe(false)
})
it('满足一个目标即可停止建议，默认全部模式继续指导', () => {
  const current = state('rare', ['p1'])
  const partial = analyzeCraftTargets(
    catalog(),
    current,
    ['p1', 's1'],
    [],
    [],
    undefined,
    [],
    undefined,
    1,
  )
  if (!partial.ok) throw new Error(partial.error)
  expect(craftTargetsSatisfied(partial.value, 1)).toBe(true)
  expect(partial.value.steps).toEqual([])
  const all = analyzeCraftTargets(catalog(), current, ['p1', 's1'])
  if (!all.ok) throw new Error(all.error)
  expect(craftTargetsSatisfied(all.value)).toBe(false)
  expect(all.value.steps.length).toBeGreaterThan(0)
})
it('替代档位只算一组，数量达到也不能跳过破裂和固有条件', () => {
  const current = state('rare', ['high'])
  const result = analyzeCraftTargets(
    catalog(),
    current,
    ['p1', 's1'],
    [],
    [{ targetModId: 'p1', modIds: ['high'] }],
    undefined,
    [],
    undefined,
    1,
  )
  if (!result.ok) throw new Error(result.error)
  expect(craftTargetsSatisfied(result.value, 1)).toBe(true)
  expect(craftTargetsSatisfied(result.value, 2)).toBe(false)
  expect(craftTargetsSatisfied(result.value, 1, 's1')).toBe(false)
  expect(
    craftTargetsSatisfied(
      {
        ...result.value,
        implicitTargets: [{ lineIndex: 0, matched: false, numeric: [], reasons: [] }],
      },
      1,
    ),
  ).toBe(false)
})

it('合法数量组合必须包含必选破裂组，不能借用与它互斥的两组通过校验', () => {
  const source = conflictingCatalog()
  const ids = ['ess', 'fire', 'cold']
  expect(validateCraftTargets(source, 'Focus', ids, 2).ok).toBe(true)
  expect(
    analyzeCraftTargets(source, state('normal'), ids, [], [], undefined, [], 'ess', 2).ok,
  ).toBe(false)
  expect(
    analyzeCraftTargets(source, state('normal'), ids, [], [], undefined, [], 'ess', 1).ok,
  ).toBe(true)
})
