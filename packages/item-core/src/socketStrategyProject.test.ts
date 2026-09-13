import { expect, it } from 'vitest'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { socketHash, socketStrategyCatalog, socketStrategyState } from './socketStrategyFixture'

const catalog = socketStrategyCatalog()
const project = {
  schemaVersion: 1,
  rulesVersion: CRAFT_RULES_VERSION,
  sourceCommit: catalog._meta.sourceCommit,
  initialState: socketStrategyState(),
  operations: [],
  cursor: 0,
  augmentSourceHash: socketHash,
  strategy: {
    maxSteps: 20,
    rules: [
      {
        conditions: [{ kind: 'always' }],
        action: { kind: 'socket', augmentId: 'fire', socketIndex: 'first-empty' },
      },
    ],
  },
}
it('尚未操作且未声明孔位时，策略也须核对符文身份与来源', () => {
  const p = structuredClone(project)
  delete p.initialState.sockets
  expect(parseCraftProject(JSON.stringify(p), catalog).ok).toBe(true)
  expect(
    parseCraftProject(JSON.stringify({ ...p, augmentSourceHash: undefined }), catalog).ok,
  ).toBe(false)
  expect(parseCraftProject(JSON.stringify(p), { ...catalog, augments: [] }).ok).toBe(false)
})
it('v40拒绝新动作和孔数条件，旧通货策略仍可升级', () => {
  for (const rule of [
    project.strategy.rules[0],
    { conditions: [{ kind: 'always' }], action: { kind: 'artificer' } },
    { conditions: [{ kind: 'open-sockets', min: 0, max: 0 }], action: { kind: 'stop' } },
  ])
    expect(
      parseCraftProject(
        JSON.stringify({
          ...project,
          rulesVersion: 'basic-2026-09-12-v40',
          strategy: { maxSteps: 20, rules: [rule] },
        }),
        catalog,
      ).ok,
    ).toBe(false)
  expect(
    parseCraftProject(
      JSON.stringify({
        ...project,
        rulesVersion: 'basic-2026-09-12-v40',
        strategy: {
          maxSteps: 20,
          rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
        },
      }),
      catalog,
    ).ok,
  ).toBe(true)
})
