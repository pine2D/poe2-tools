import { expect, it } from 'vitest'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { type CraftStrategy, evaluateCraftStrategy } from './craftStrategy'
import { catalog, state } from './partialTargetFixture'

const strategy: CraftStrategy = {
  maxSteps: 2,
  rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'currency', currency: 'regal' } }],
}
const project: CraftProject = {
  schemaVersion: 1,
  sourceCommit: catalog()._meta.sourceCommit,
  rulesVersion: CRAFT_RULES_VERSION,
  initialState: state('normal'),
  operations: [
    { currency: 'transmutation', modIds: ['p1'] },
    { currency: 'regal', modIds: ['s1'] },
  ],
  cursor: 2,
  strategy,
}
it('保存规则不保存派生状态，全部历史游标按各自状态和次数重算', () => {
  for (const cursor of [0, 1, 2]) {
    const restored = parseCraftProject(serializeCraftProject({ ...project, cursor }), catalog())
    if (!restored.ok) throw new Error(restored.error)
    expect(restored.value.project.strategy).toEqual(strategy)
    const s = restored.value.states[cursor]
    if (!s || !restored.value.project.strategy) throw new Error('缺少状态或规则')
    expect(
      evaluateCraftStrategy(catalog(), s, restored.value.project.strategy, cursor),
    ).toMatchObject({ ok: true, value: { kind: ['blocked', 'action', 'stop'][cursor] } })
  }
})
it('v38及更早项目不能注入规则，缺字段旧项目按原语义升级', () => {
  expect(
    parseCraftProject(
      JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-12-v38' }),
      catalog(),
    ).ok,
  ).toBe(false)
  const restored = parseCraftProject(
    JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-12-v38', strategy: undefined }),
    catalog(),
  )
  expect(restored.ok).toBe(true)
  if (restored.ok) expect(restored.value.project).not.toHaveProperty('strategy')
})
it('读取和序列化都拒绝不完整或恶意规则字段', () => {
  for (const strategy of [
    null,
    {},
    {
      maxSteps: 3,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop', modIds: ['p1'] } }],
    },
  ]) {
    expect(parseCraftProject(JSON.stringify({ ...project, strategy }), catalog()).ok).toBe(false)
    expect(() => serializeCraftProject({ ...project, strategy } as CraftProject)).toThrow()
  }
  expect(() =>
    serializeCraftProject({ ...project, strategy: undefined } as unknown as CraftProject),
  ).toThrow()
})
