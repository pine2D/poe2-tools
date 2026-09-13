import { expect, it } from 'vitest'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { catalog, state } from './partialTargetFixture'
import { strategyStageAt } from './strategyStages'

const project = (): CraftProject => ({
  schemaVersion: 1,
  rulesVersion: CRAFT_RULES_VERSION,
  sourceCommit: catalog()._meta.sourceCommit,
  initialState: state('normal'),
  operations: [{ currency: 'transmutation', modIds: ['p1'] }],
  cursor: 1,
  strategyStartStep: 0,
  strategy: {
    maxSteps: 10,
    flow: {
      stages: [
        { id: 'a', name: '检查' },
        { id: 'b', name: '加工' },
      ],
      entryStageId: 'a',
    },
    rules: [
      {
        stageId: 'a',
        nextStageId: 'b',
        conditions: [{ kind: 'always' }],
        action: { kind: 'jump' },
      },
      {
        stageId: 'b',
        conditions: [{ kind: 'always' }],
        action: { kind: 'currency', currency: 'transmutation' },
      },
    ],
  },
})
it('保存恢复后按每个游标展开，只有一个实际操作，无派生路径字段', () => {
  const p = project(),
    text = serializeCraftProject(p),
    result = parseCraftProject(text, catalog())
  if (!result.ok || !p.strategy) throw new Error('缺项目')
  expect(result.value.project.strategy).toEqual(p.strategy)
  expect(result.value.project.operations).toHaveLength(1)
  expect(text).not.toContain('route')
  for (const cursor of [0, 1])
    expect(
      strategyStageAt(catalog(), result.value.states, p.operations, p.strategy, 0, cursor),
    ).toEqual({ ok: true, value: cursor ? 'b' : 'a' })
  expect(parseCraftProject(JSON.stringify({ ...p, route: [] }), catalog()).ok).toBe(false)
})
it('旧v43不能注入jump，但原阶段配置可以合法升级并保留起点', () => {
  const p = project()
  expect(
    parseCraftProject(JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-12-v43' }), catalog()).ok,
  ).toBe(false)
  const legacy = {
    ...p,
    rulesVersion: 'basic-2026-09-12-v43',
    strategy: {
      ...p.strategy,
      rules: [{ stageId: 'a', conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  expect(parseCraftProject(JSON.stringify(legacy), catalog())).toMatchObject({
    ok: true,
    value: { project: { strategyStartStep: 0, rulesVersion: CRAFT_RULES_VERSION } },
  })
})
