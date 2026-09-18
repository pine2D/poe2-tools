import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { imported, catalog as realCatalog } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import { type CraftStrategy, evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import { catalog, state } from './partialTargetFixture'

const selected = (modIds = ['p1'], min = 1, value = true): CraftStrategy => ({
  maxSteps: 20,
  rules: [
    { conditions: [{ kind: 'selected-targets', modIds, min, value }], action: { kind: 'stop' } },
    { conditions: [{ kind: 'always' }], action: { kind: 'currency', currency: 'regal' } },
  ],
})
it('指定组已满足时能分流，不受其他显式或固有目标未达成影响', () => {
  const source = catalog(undefined, { implicit: 'Implicit (1-10)' })
  expect(
    evaluateCraftStrategy(
      source,
      { ...state('magic', ['p1']), implicitLines: ['Implicit 1'] },
      selected(),
      1,
      {
        targetModIds: ['p1', 's1'],
        targetImplicitValues: [{ lineIndex: 0, bounds: [{ index: 0, min: 9 }] }],
      },
    ),
  ).toMatchObject({ ok: true, value: { kind: 'stop', ruleIndex: 0 } })
  expect(
    evaluateCraftStrategy(catalog(), state('magic', ['p1']), selected(['s1']), 1, {
      targetModIds: ['p1', 's1'],
    }),
  ).toMatchObject({ ok: true, value: { kind: 'action', ruleIndex: 1 } })
})
it('替代档位及数值按主目标归并，逆向数量不把一个主组计两次', () => {
  const goals = {
    targetModIds: ['p1', 's1'],
    targetAlternatives: [{ targetModId: 'p1', modIds: ['high'] }],
    targetValues: [{ modId: 'high', bounds: [{ index: 0, min: 6 }] }],
  }
  const low = { ...state('magic', ['high']), itemLevel: 86 }
  expect(evaluateCraftStrategy(catalog(), low, selected(), 1, goals)).toMatchObject({
    ok: true,
    value: { kind: 'action' },
  })
  const high = { ...low, affixes: [{ modId: 'high', lines: ['high 6'] }] }
  expect(evaluateCraftStrategy(catalog(), high, selected(), 1, goals)).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
  expect(
    evaluateCraftStrategy(catalog(), high, selected(['p1', 's1'], 2, false), 1, goals),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
})
it('删除规则引用的主目标会阻塞而非命中反向条件，重新加回可恢复', () => {
  const input = selected(['p1'], 1, false)
  expect(
    evaluateCraftStrategy(catalog(), state('normal'), input, 0, { targetModIds: ['s1'] }),
  ).toMatchObject({
    ok: true,
    value: { kind: 'blocked', ruleIndex: 0, message: expect.stringContaining('p1') },
  })
  expect(
    evaluateCraftStrategy(catalog(), state('normal'), input, 0, { targetModIds: ['p1', 's1'] }),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
})
it('指定组沿用破裂要求，待揭示只检查实际已有组', () => {
  const goals = { targetModIds: ['p1'], targetFracturedModId: 'p1' }
  expect(
    evaluateCraftStrategy(catalog(), state('magic', ['p1']), selected(), 1, goals),
  ).toMatchObject({ ok: true, value: { kind: 'action' } })
  const locked = {
    ...state('rare', ['p1']),
    affixes: [{ modId: 'p1', lines: ['p1 5'], fractured: true as const }],
  }
  expect(evaluateCraftStrategy(catalog(), locked, selected(), 1, goals)).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
  const source = boneCatalog(),
    pending = applyCraftStep(source, boneState(['prefix1']), {
      kind: 'desecrate',
      boneId: 'preserved_rib',
      affixKind: 'suffix',
    })
  if (!pending.ok) throw Error(pending.error)
  expect(
    evaluateCraftStrategy(source, pending.value, selected(['prefix1']), 1, {
      targetModIds: ['prefix1', 'exclusive1'],
    }),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
  expect(
    evaluateCraftStrategy(source, pending.value, selected(['exclusive1']), 1, {
      targetModIds: ['prefix1', 'exclusive1'],
    }),
  ).toMatchObject({ ok: true, value: { kind: 'blocked' } })
})
it('有效值条件随当前催化品质重算，不使用基础值冒充', () => {
  const initial = imported()
  if (!initial.ok) throw Error(initial.error)
  const goals = {
    targetModIds: ['IncreasedLife1'],
    targetValues: [
      { modId: 'IncreasedLife1', basis: 'effective' as const, bounds: [{ index: 0, min: 22 }] },
    ],
  }
  expect(
    evaluateCraftStrategy(realCatalog, initial.value, selected(['IncreasedLife1']), 0, goals),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
  expect(
    evaluateCraftStrategy(
      realCatalog,
      { ...initial.value, catalyst: { id: 'Flesh', quality: 10 } },
      selected(['IncreasedLife1'], 1, false),
      0,
      goals,
    ),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
})
it('条件严格拒绝空列表、重复身份、越界数量及未知字段', () => {
  expect(readCraftStrategy(selected()).ok).toBe(true)
  const valid = { kind: 'selected-targets', modIds: ['p1'], min: 1, value: true }
  for (const change of [
    { modIds: [] },
    { modIds: ['p1', 'p2', 'p3', 'p4', 's1', 's2', 's3', 's4', 's5'] },
    { modIds: ['p1', 'p1'] },
    { modIds: [''] },
    { modIds: [1] },
    { min: 0 },
    { min: 2 },
    { min: 1.5 },
    { value: 1 },
    { extra: true },
  ])
    expect(
      readCraftStrategy({
        maxSteps: 10,
        rules: [{ conditions: [{ ...valid, ...change }], action: { kind: 'stop' } }],
      }).ok,
    ).toBe(false)
})
