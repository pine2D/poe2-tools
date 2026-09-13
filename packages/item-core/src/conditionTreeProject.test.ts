import { expect, it } from 'vitest'
import { collectCraftCosts } from './craftCosts'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { evaluateCraftStrategy } from './craftStrategy'
import { catalog, state } from './partialTargetFixture'
import { strategyStageAt } from './strategyStages'

const project = (): CraftProject => ({
  schemaVersion: 1,
  rulesVersion: CRAFT_RULES_VERSION,
  sourceCommit: catalog()._meta.sourceCommit,
  initialState: state('normal'),
  operations: [
    { currency: 'transmutation', modIds: ['p1'] },
    { currency: 'regal', modIds: ['s1'] },
  ],
  cursor: 2,
  strategyStartStep: 0,
  strategy: {
    maxSteps: 10,
    flow: {
      entryStageId: 'a',
      stages: [
        { id: 'a', name: '制作' },
        { id: 'b', name: '结束' },
      ],
    },
    rules: [
      {
        stageId: 'a',
        conditions: [
          {
            kind: 'not',
            condition: {
              kind: 'any',
              conditions: [
                { kind: 'rarity', value: 'magic' },
                { kind: 'rarity', value: 'rare' },
              ],
            },
          },
        ],
        action: { kind: 'currency', currency: 'transmutation' },
      },
      {
        stageId: 'a',
        nextStageId: 'b',
        conditions: [
          {
            kind: 'all',
            conditions: [
              { kind: 'rarity', value: 'magic' },
              { kind: 'not', condition: { kind: 'targets-met', value: true } },
            ],
          },
        ],
        action: { kind: 'currency', currency: 'regal' },
      },
      { stageId: 'b', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
    ],
  },
})
it('嵌套条件按历史重算阶段与动作，保存恢复只有实际材料', () => {
  const p = project(),
    parsed = parseCraftProject(serializeCraftProject(p), catalog())
  if (!parsed.ok || !p.strategy) throw Error('项目失败')
  expect(parsed.value.project.strategy).toEqual(p.strategy)
  for (let cursor = 0; cursor <= 2; cursor++) {
    const phase = strategyStageAt(
      catalog(),
      parsed.value.states,
      p.operations,
      p.strategy,
      0,
      cursor,
    )
    expect(phase).toEqual({ ok: true, value: cursor === 2 ? 'b' : 'a' })
    const current = parsed.value.states[cursor]
    if (!phase.ok || !current) throw Error('阶段错误')
    expect(
      evaluateCraftStrategy(catalog(), current, p.strategy, cursor, {}, phase.value),
    ).toMatchObject({
      ok: true,
      value:
        cursor === 2
          ? { kind: 'stop' }
          : { kind: 'action', action: { currency: cursor === 0 ? 'transmutation' : 'regal' } },
    })
  }
  expect(collectCraftCosts(catalog(), p.operations)).toMatchObject({
    ok: true,
    value: [{ count: 1 }, { count: 1 }],
  })
})
it('v45禁止树，旧叶可升级，深层不存在目标不能藏进项目', () => {
  const p = project()
  expect(
    parseCraftProject(JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-12-v45' }), catalog()).ok,
  ).toBe(false)
  const rule = p.strategy?.rules[0]
  if (!p.strategy || !rule) throw Error('缺策略')
  rule.conditions = [
    {
      kind: 'any',
      conditions: [
        { kind: 'always' },
        {
          kind: 'not',
          condition: { kind: 'selected-targets', modIds: ['unknown'], min: 1, value: true },
        },
      ],
    },
  ]
  expect(parseCraftProject(JSON.stringify(p), catalog())).toMatchObject({
    ok: false,
    error: expect.stringContaining('目标词缀不在'),
  })
  for (const rule of p.strategy.rules) rule.conditions = [{ kind: 'always' }]
  expect(
    parseCraftProject(JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-12-v45' }), catalog()),
  ).toMatchObject({ ok: true, value: { project: { rulesVersion: CRAFT_RULES_VERSION } } })
})
