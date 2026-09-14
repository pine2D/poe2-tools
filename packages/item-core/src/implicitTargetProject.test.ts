import { expect, it } from 'vitest'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { implicitTargetFixture } from './implicitTargetFixture'

it('v23保存固有目标身份，全游标恢复；旧版本字段存在即拒绝', () => {
  const { catalog, state } = implicitTargetFixture()
  const project: CraftProject = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: {
      ...state,
      implicitLines: ['(10-20)% increased Flask Charges gained', 'Has 1(1-2) Charm Slot'],
    },
    targetImplicitValues: [{ lineIndex: 1, bounds: [{ index: 0, min: 2 }] }],
    cursor: 0,
    operations: [{ currency: 'divine', modIds: [], rolls: [], implicitValues: [15, 2] }],
  }
  expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v68')
  for (const cursor of [0, 1]) {
    const restored = parseCraftProject(serializeCraftProject({ ...project, cursor }), catalog)
    expect(restored).toMatchObject({
      ok: true,
      value: { project: { targetImplicitValues: project.targetImplicitValues, cursor } },
    })
    if (restored.ok) {
      const bound = restored.value.project.targetImplicitValues?.[0]?.bounds[0]
      if (bound) bound.min = 1
      expect(project.targetImplicitValues?.[0]?.bounds[0]?.min).toBe(2)
    }
  }
  for (const targetImplicitValues of [[], project.targetImplicitValues])
    expect(
      parseCraftProject(
        JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-12-v22', targetImplicitValues }),
        catalog,
      ).ok,
    ).toBe(false)
  const { targetImplicitValues: _, ...old } = project
  expect(
    parseCraftProject(JSON.stringify({ ...old, rulesVersion: 'basic-2026-09-12-v22' }), catalog).ok,
  ).toBe(true)
  for (const targetImplicitValues of [
    [{ lineIndex: 9, bounds: [{ index: 0, min: 2 }] }],
    [{ lineIndex: 1, bounds: [] }],
    [{ lineIndex: 1, bounds: [{ index: 0, min: 2 }], extra: true }],
    null,
  ])
    expect(
      parseCraftProject(JSON.stringify({ ...project, targetImplicitValues }), catalog).ok,
    ).toBe(false)
  expect(
    parseCraftProject(
      JSON.stringify({
        ...project,
        operations: [{ currency: 'divine', modIds: [], rolls: [], implicitValues: [15, 3] }],
      }),
      catalog,
    ).ok,
  ).toBe(false)
})

it('所有旧版本包括空字段拒绝；序列化不能丢弃undefined或非finite条件', () => {
  const { catalog, state } = implicitTargetFixture()
  const project: CraftProject = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: {
      ...state,
      implicitLines: ['(10-20)% increased Flask Charges gained', 'Has 1(1-2) Charm Slot'],
    },
    cursor: 0,
    operations: [],
    targetImplicitValues: [],
  }
  for (let version = 2; version <= 22; version++)
    expect(
      parseCraftProject(
        JSON.stringify({ ...project, rulesVersion: `basic-2026-09-12-v${version}` }),
        catalog,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('固有属性目标字段') })
  for (const targetImplicitValues of [
    undefined,
    [{ lineIndex: 1, bounds: [{ index: 0, min: undefined, max: 3 }] }],
    [{ lineIndex: 1, bounds: [{ index: 0, min: NaN }] }],
    [{ lineIndex: 1, bounds: [{ index: 0, max: Infinity }] }],
    [{ lineIndex: 1, bounds: [{ index: 0, min: 2 }], extra: true }],
  ])
    expect(() =>
      serializeCraftProject({ ...project, targetImplicitValues } as CraftProject),
    ).toThrow()
})
