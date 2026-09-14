import { expect, it } from 'vitest'
import { catalog, dictionary, imported } from './catalystTestFixture'
import { CRAFT_RULES_VERSION, type CraftProject, parseCraftProject } from './craftProject'
import { type CraftStrategy, evaluateCraftStrategy } from './craftStrategy'
import { statScalabilitySourceHash } from './statScalability'

const strategy: CraftStrategy = {
  maxSteps: 10,
  rules: [
    {
      conditions: [{ kind: 'quality', source: 'catalyst', catalystId: 'Flesh', min: 1 }],
      action: { kind: 'currency', currency: 'exalted', omen: 'catalysing_exaltation' },
    },
    {
      conditions: [{ kind: 'quality', source: 'catalyst', min: 0, max: 0 }],
      action: { kind: 'stop' },
    },
  ],
}
function project(): CraftProject {
  const input = imported()
  if (!input.ok) throw Error(input.error)
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: CRAFT_RULES_VERSION,
    initialState: input.value,
    scalabilitySourceHash: statScalabilitySourceHash(catalog) as string,
    strategy,
    cursor: 1,
    operations: [{ currency: 'exalted', omen: 'catalysing_exaltation', modIds: ['FireResist1'] }],
  }
}
const restore = (input: unknown) => parseCraftProject(JSON.stringify(input), catalog, dictionary)

it('v67 保存品质分流且在各历史游标重算；未知未来 v68 拒绝', () => {
  expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v67')
  expect(restore({ ...project(), rulesVersion: 'basic-2026-09-12-v68' }).ok).toBe(false)
  for (const cursor of [0, 1]) {
    const result = restore({ ...project(), cursor })
    if (!result.ok) throw Error(result.error)
    expect(result.value.project.strategy).toEqual(strategy)
    const state = result.value.states[cursor]
    if (!state) throw Error('缺少历史状态')
    expect(state.catalyst?.quality).toBe(cursor === 0 ? 20 : 0)
    expect(evaluateCraftStrategy(catalog, state, strategy, cursor)).toMatchObject({
      ok: true,
      value: { kind: cursor === 0 ? 'action' : 'stop', ruleIndex: cursor },
    })
  }
})

it('旧项目不能将新品质条件藏在未执行规则或嵌套树中', () => {
  for (let version = 2; version <= 54; version++) {
    for (const condition of [
      strategy.rules[0]?.conditions[0],
      {
        kind: 'not',
        condition: { kind: 'any', conditions: [{ kind: 'quality', source: 'ordinary', min: 20 }] },
      },
    ]) {
      const input = {
        ...project(),
        operations: [],
        cursor: 0,
        rulesVersion: `basic-2026-09-12-v${version}`,
        strategy: {
          maxSteps: 10,
          rules: [
            { conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
            { conditions: [condition], action: { kind: 'stop' } },
          ],
        },
      }
      const result = restore(input)
      expect(result.ok).toBe(false)
      if (version >= 39)
        expect(result).toMatchObject({ ok: false, error: expect.stringContaining('品质条件') })
    }
  }
})

it('旧 v54 催化消费项目可升级，品质来源与缩放指纹核验仍保留', () => {
  const legacy = { ...project(), rulesVersion: 'basic-2026-09-12-v54', strategy: undefined }
  expect(restore(legacy)).toMatchObject({
    ok: true,
    value: { project: { rulesVersion: CRAFT_RULES_VERSION } },
  })
  expect(restore({ ...project(), scalabilitySourceHash: undefined }).ok).toBe(false)
  expect(
    restore({
      ...project(),
      initialState: { ...project().initialState, catalyst: { id: 'Flesh', quality: 10 } },
    }).ok,
  ).toBe(false)
})
