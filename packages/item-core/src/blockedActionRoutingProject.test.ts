import { expect, it } from 'vitest'
import { collectCraftCosts } from './craftCosts'
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
        { id: 'a', name: '升稀有' },
        { id: 'b', name: '准备' },
        { id: 'c', name: '结束' },
      ],
    },
    rules: [
      {
        stageId: 'a',
        nextStageId: 'c',
        onBlockedStageId: 'b',
        conditions: [{ kind: 'always' }],
        action: { kind: 'currency', currency: 'regal' },
      },
      {
        stageId: 'b',
        nextStageId: 'a',
        conditions: [{ kind: 'always' }],
        action: { kind: 'currency', currency: 'transmutation' },
      },
      { stageId: 'c', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
    ],
  },
})
it('恢复按最终实际动作推进，未执行的原动作不收费或写入历史', () => {
  const p = project(),
    text = serializeCraftProject(p),
    parsed = parseCraftProject(text, catalog())
  if (!parsed.ok || !p.strategy) throw new Error('项目失败')
  expect(parsed.value.project.strategy).toEqual(p.strategy)
  for (const [cursor, expected] of ['a', 'a', 'c'].entries())
    expect(
      strategyStageAt(catalog(), parsed.value.states, p.operations, p.strategy, 0, cursor),
    ).toEqual({ ok: true, value: expected })
  expect(collectCraftCosts(catalog(), p.operations)).toMatchObject({
    ok: true,
    value: [{ count: 1 }, { count: 1 }],
  })
  expect(text).not.toContain('blockedReason')
})
it('v44拒绝失败转向，合法旧flow仍升级，外来派生路径拒绝', () => {
  const p = project()
  expect(
    parseCraftProject(JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-12-v44' }), catalog()).ok,
  ).toBe(false)
  const original = p.strategy?.rules[0]
  if (!original || !p.strategy) throw new Error('缺规则')
  delete original.onBlockedStageId
  expect(
    parseCraftProject(JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-12-v44' }), catalog()),
  ).toMatchObject({ ok: true, value: { project: { rulesVersion: CRAFT_RULES_VERSION } } })
  expect(
    parseCraftProject(JSON.stringify({ ...p, route: [{ blockedReason: '外来原因' }] }), catalog())
      .ok,
  ).toBe(false)
})
