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
  cursor: 0,
  strategyStartStep: 0,
  strategy: {
    maxSteps: 20,
    flow: {
      stages: [
        { id: 'a', name: '阶段一' },
        { id: 'b', name: '阶段二' },
      ],
      entryStageId: 'a',
    },
    rules: [
      {
        stageId: 'a',
        nextStageId: 'b',
        conditions: [{ kind: 'always' }],
        action: { kind: 'currency', currency: 'transmutation' },
      },
      { stageId: 'b', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
    ],
  },
})
it('保存流程起点并逐游标重算阶段，已撤销的后续历史仍能恢复', () => {
  const p = project(),
    parsed = parseCraftProject(serializeCraftProject(p), catalog())
  if (!parsed.ok || !p.strategy) throw new Error('项目失败')
  expect(parsed.value.project.strategyStartStep).toBe(0)
  for (const cursor of [0, 1])
    expect(
      strategyStageAt(catalog(), parsed.value.states, p.operations, p.strategy, 0, cursor),
    ).toMatchObject({ ok: true, value: cursor === 0 ? 'a' : 'b' })
  expect(parseCraftProject(JSON.stringify({ ...p, strategyStartStep: 1 }), catalog()).ok).toBe(true)
})
it('拒绝缺失或越界起点、无流程起点、旧版本注入；合法旧策略升级', () => {
  const p = project()
  for (const strategyStartStep of [undefined, -1, 2, 0.5, '0', null])
    expect(parseCraftProject(JSON.stringify({ ...p, strategyStartStep }), catalog()).ok).toBe(false)
  expect(parseCraftProject(JSON.stringify({ ...p, strategy: undefined }), catalog()).ok).toBe(false)
  expect(
    parseCraftProject(JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-12-v42' }), catalog()).ok,
  ).toBe(false)
  const legacy = {
    ...p,
    strategyStartStep: undefined,
    rulesVersion: 'basic-2026-09-12-v42',
    strategy: {
      maxSteps: 20,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  expect(parseCraftProject(JSON.stringify(legacy), catalog())).toMatchObject({
    ok: true,
    value: { project: { rulesVersion: CRAFT_RULES_VERSION } },
  })
  delete p.strategyStartStep
  expect(() => serializeCraftProject(p)).toThrow()
})
