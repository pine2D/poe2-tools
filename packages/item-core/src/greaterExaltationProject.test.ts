import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { exportCraftItemText } from './craftItemText'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { applyCraftStep } from './craftSteps'
import { planCraftTargetRoutes } from './targetRoutes'

it('v33 三种双组配置完整回放，全部旧版包括未来步骤拒绝注入', () => {
  const catalog = boneCatalog()
  const initialState = boneState(['prefix1', 'suffix1'])
  delete initialState.sockets
  const text = exportCraftItemText(catalog, initialState)
  if (!text.ok) throw Error(text.error)
  initialState.sourceText = text.value.text
  for (const [omen, modIds] of [
    ['greater_exaltation', ['prefix2', 'suffix2']],
    ['greater_sinistral_exaltation', ['prefix2', 'prefix3']],
    ['greater_dextral_exaltation', ['suffix2', 'suffix3']],
  ] as const) {
    const project: CraftProject = {
      schemaVersion: 1,
      rulesVersion: CRAFT_RULES_VERSION,
      sourceCommit: catalog._meta.sourceCommit,
      initialState,
      operations: [
        {
          currency: 'exalted',
          omen,
          modIds: [...modIds],
          rolls: modIds.map((modId) => ({ modId, values: [5] })),
        },
      ],
      cursor: 0,
    }
    for (const cursor of [0, 1]) {
      const r = parseCraftProject(serializeCraftProject({ ...project, cursor }), catalog)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
      expect(r.ok && r.value.project.rulesVersion).toBe('basic-2026-09-12-v51')
    }
    for (let v = 2; v <= 32; v++)
      expect(
        parseCraftProject(
          JSON.stringify({ ...project, rulesVersion: `basic-2026-09-12-v${v}` }),
          catalog,
        ).ok,
      ).toBe(false)
    expect(
      parseCraftProject(
        JSON.stringify({
          ...project,
          operations: [{ currency: 'exalted', omen, modIds: [modIds[0]] }],
        }),
        catalog,
      ).ok,
    ).toBe(false)
  }
})
it('双目标路线的双组步骤实际回放且不丢已有目标', () => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'suffix1'])
  const r = planCraftTargetRoutes(catalog, state, ['prefix1', 'prefix2', 'prefix3'])
  expect(
    r.ok &&
      r.value.routes.some((route) =>
        route.steps.some(
          (s) => 'currency' in s.operation && s.operation.omen === 'greater_sinistral_exaltation',
        ),
      ),
  ).toBe(true)
  if (!r.ok) throw Error(r.error)
  for (const route of r.value.routes) {
    let current = state
    for (const step of route.steps) {
      const result = applyCraftStep(catalog, current, step.operation)
      if (!result.ok) throw Error(result.error)
      expect(result.value).toEqual(step.state)
      current = result.value
    }
  }
})

it('新强效操作不能通过删除整个数值字段恢复成范围草稿', () => {
  const catalog = boneCatalog()
  const initialState = boneState(['prefix1', 'suffix1'])
  delete initialState.sockets
  const text = exportCraftItemText(catalog, initialState)
  if (!text.ok) throw Error(text.error)
  initialState.sourceText = text.value.text
  const project = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState,
    operations: [
      { currency: 'exalted', omen: 'greater_exaltation', modIds: ['prefix2', 'suffix2'] },
    ],
    cursor: 0,
  }
  expect(parseCraftProject(JSON.stringify(project), catalog)).toMatchObject({
    ok: false,
    error: expect.stringContaining('数值'),
  })
})
