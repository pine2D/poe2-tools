import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import { evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import type { CraftResult, CraftState } from './rehearsal'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

const catalog = boneCatalog()
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function strategy(source: 'unrevealed' | 'revealed', count: number) {
  return {
    maxSteps: 20,
    rules: [
      {
        conditions: [{ kind: 'desecrated-count' as const, source, min: count, max: count }],
        action: { kind: 'stop' as const },
      },
    ],
  }
}
function check(state: CraftState, source: 'unrevealed' | 'revealed', count: number) {
  expect(evaluateCraftStrategy(catalog, state, strategy(source, count), 0)).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
  expect(evaluateCraftStrategy(catalog, state, strategy(source, count + 1), 0)).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
}
it('六个隐藏槽的固定候选和回响不减少数量，确认后减少且普通结果不是亵渎词缀', () => {
  let state = must(
    applyCraftStep(catalog, boneState(), { kind: 'putrefy', boneId: 'preserved_rib' }),
  )
  check(state, 'unrevealed', 6)
  state = must(
    applyCraftStep(catalog, state, {
      kind: 'desecration-offer',
      modIds: ['prefix1', 'prefix2', 'prefix3'],
      revealOmen: 'abyssal_echoes',
    }),
  )
  check(state, 'unrevealed', 6)
  state = must(
    applyCraftStep(catalog, state, {
      kind: 'desecration-reroll',
      modIds: ['prefix2', 'prefix3', 'prefix4'],
    }),
  )
  check(state, 'unrevealed', 6)
  state = must(
    applyCraftStep(catalog, state, { kind: 'desecration-reveal', modId: 'prefix2', values: [5] }),
  )
  check(state, 'unrevealed', 5)
  check(state, 'revealed', 0)
})
it('单槽隐藏数量从一变零，已揭示数量按真实亵渎标记计数', () => {
  let state = boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2'])
  check(state, 'unrevealed', 0)
  state = must(
    applyCraftStep(catalog, state, {
      kind: 'desecrate',
      boneId: 'preserved_rib',
      affixKind: 'suffix',
    }),
  )
  check(state, 'unrevealed', 1)
  state = must(
    applyCraftStep(catalog, state, {
      kind: 'desecration-offer',
      modIds: ['suffix3', 'exclusive1', 'exclusive2'],
    }),
  )
  state = must(
    applyCraftStep(catalog, state, {
      kind: 'desecration-reveal',
      modId: 'exclusive1',
      values: [5],
    }),
  )
  check(state, 'unrevealed', 0)
  check(state, 'revealed', 1)
})
it('范围只接受整数闭区间和明确的计数来源', () => {
  expect(readCraftStrategy(strategy('unrevealed', 0)).ok).toBe(true)
  for (const patch of [
    { min: -1 },
    { max: 8 },
    { min: 1.5 },
    { min: 2, max: 1 },
    { source: 'all' },
    { extra: 1 },
  ]) {
    const input = strategy('unrevealed', 1)
    const condition = input.rules[0]?.conditions[0]
    if (!condition) throw Error('缺少条件夹具')
    Object.assign(condition, patch)
    expect(readCraftStrategy(input).ok).toBe(false)
  }
})
it('新条件包括未执行嵌套条件必须用 v92，空项目及条件项目保持版本', () => {
  const input = {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-17-v92',
    initialState: {
      baseId: 'Synthetic Base',
      itemLevel: 64,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
    },
    operations: [],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
    strategy: {
      maxSteps: 20,
      rules: [
        {
          conditions: [
            {
              kind: 'not',
              condition: {
                kind: 'any',
                conditions: strategy('unrevealed', 0).rules[0]?.conditions,
              },
            },
          ],
          action: { kind: 'stop' },
        },
      ],
    },
  }
  const result = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
  expect(result.project).toEqual(input)
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...input, rulesVersion: 'basic-2026-09-16-v91' }),
      catalog,
    ),
  ).toMatchObject({
    ok: false,
    error: expect.stringContaining('v92'),
  })
  const { strategy: _strategy, ...empty } = input
  expect(must(loadTargetWorkbenchProject(JSON.stringify(empty), catalog)).project).toEqual(empty)
})
