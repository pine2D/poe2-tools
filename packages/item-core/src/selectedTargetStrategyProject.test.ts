import { expect, it } from 'vitest'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { evaluateCraftStrategy } from './craftStrategy'
import { catalog, state } from './partialTargetFixture'

const project: CraftProject = {
  schemaVersion: 1,
  rulesVersion: CRAFT_RULES_VERSION,
  sourceCommit: catalog()._meta.sourceCommit,
  initialState: state('normal'),
  operations: [],
  cursor: 0,
  targetModIds: ['p1', 's1'],
  strategy: {
    maxSteps: 20,
    rules: [
      {
        conditions: [{ kind: 'selected-targets', modIds: ['p1'], min: 1, value: true }],
        action: { kind: 'stop' },
      },
    ],
  },
}
it('配置和残留引用能保存恢复，未知目录身份不能伪装成待修复目标', () => {
  const parsed = parseCraftProject(serializeCraftProject(project), catalog())
  expect(parsed.ok).toBe(true)
  const stale = parseCraftProject(JSON.stringify({ ...project, targetModIds: ['s1'] }), catalog())
  if (!stale.ok) throw Error(stale.error)
  expect(stale.value.project.strategy).toEqual(project.strategy)
  if (!stale.value.project.strategy) throw Error('缺少规则')
  const initial = stale.value.states[0]
  if (!initial) throw Error('缺少起点')
  expect(
    evaluateCraftStrategy(catalog(), initial, stale.value.project.strategy, 0, stale.value.project),
  ).toMatchObject({ ok: true, value: { kind: 'blocked' } })
  const invalid = structuredClone(project)
  const rule = invalid.strategy?.rules[0]
  if (!rule) throw Error('缺少测试规则')
  rule.conditions = [{ kind: 'selected-targets', modIds: ['unknown'], min: 1, value: true }]
  expect(parseCraftProject(JSON.stringify(invalid), catalog()).ok).toBe(false)
})
it('v41拒绝指定目标条件，既有条件策略仍可升级', () => {
  expect(
    parseCraftProject(
      JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-12-v41' }),
      catalog(),
    ).ok,
  ).toBe(false)
  expect(
    parseCraftProject(
      JSON.stringify({
        ...project,
        rulesVersion: 'basic-2026-09-12-v41',
        strategy: {
          maxSteps: 20,
          rules: [{ conditions: [{ kind: 'targets-met', value: true }], action: { kind: 'stop' } }],
        },
      }),
      catalog(),
    ).ok,
  ).toBe(true)
})
