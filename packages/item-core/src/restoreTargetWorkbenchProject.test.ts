import { expect, it, vi } from 'vitest'
import { CRAFT_RULES_VERSION } from './craftProject'
import * as targetProjects from './craftProjectTargets'
import { catalog as makeCatalog } from './partialTargetFixture'
import { loadTargetWorkbenchProject, restoreTargetWorkbenchProject } from './targetWorkbenchProject'

const catalog = makeCatalog(undefined, { socketLimit: null })
function legacy() {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: {
      baseId: 'Focus',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
    },
    operations: [{ currency: 'transmutation', modIds: ['p1'] }],
    cursor: 0,
  }
}
function modern() {
  const result = loadTargetWorkbenchProject(JSON.stringify(legacy()), catalog)
  if (!result.ok) throw Error(result.error)
  return result.value
}

it('现代项目挂载仅做一次严格解析回放', () => {
  const input = modern()
  const parse = vi.spyOn(targetProjects, 'parseTargetCraftProject')
  try {
    expect(restoreTargetWorkbenchProject(input, catalog).ok).toBe(true)
    expect(parse).toHaveBeenCalledTimes(1)
  } finally {
    parse.mockRestore()
  }
})

it('挂载从原项目完整回放，忽略伪造 states 且不修改输入', () => {
  const expected = modern()
  const input = { project: expected.project, states: [{ ...expected.states[0], baseId: 'forged' }] }
  const snapshot = structuredClone(input)
  expect(restoreTargetWorkbenchProject(input, catalog)).toEqual({ ok: true, value: expected })
  expect(input).toEqual(snapshot)
  expect(expected.states).toHaveLength(2)
  const statesGetter = vi.fn(() => [])
  expect(
    restoreTargetWorkbenchProject(
      {
        project: expected.project,
        get states() {
          return statesGetter()
        },
      },
      catalog,
    ),
  ).toEqual({ ok: true, value: expected })
  expect(statesGetter).not.toHaveBeenCalled()
})

it('撤销游标之后的坏完整未来与伪造来源仍拒绝', () => {
  const input = modern()
  input.project.operations.push({ currency: 'transmutation', modIds: ['p1'] })
  expect(restoreTargetWorkbenchProject(input, catalog).ok).toBe(false)
  expect(
    restoreTargetWorkbenchProject(
      { project: { ...modern().project, sourceCommit: 'wrong' }, states: [] },
      catalog,
    ).ok,
  ).toBe(false)
})

it('提取 project 与 stringify 之前拒绝访问器和 toJSON，不执行用户代码', () => {
  const getter = vi.fn(() => modern().project)
  const toJSON = vi.fn(() => modern().project)
  for (const input of [
    {
      get project() {
        return getter()
      },
      states: [],
    },
    {
      project: {
        ...modern().project,
        get cursor() {
          getter()
          return 0
        },
      },
      states: [],
    },
    { project: { ...modern().project, toJSON }, states: [] },
    { project: Object.assign(Object.create({ toJSON }), modern().project), states: [] },
  ])
    expect(restoreTargetWorkbenchProject(input, catalog).ok).toBe(false)
  expect(getter).not.toHaveBeenCalled()
  expect(toJSON).not.toHaveBeenCalled()
})

it.each(['basic-2026-09-12-v74', 'basic-2026-09-17-v96', 'basic-2026-09-17-v98'])(
  '有效 %s 原版本保留，完整未来恢复',
  (rulesVersion) => {
    const project = { ...modern().project, rulesVersion }
    const expected = loadTargetWorkbenchProject(JSON.stringify(project), catalog)
    expect(expected.ok).toBe(true)
    expect(restoreTargetWorkbenchProject({ project, states: [] }, catalog)).toEqual(expected)
  },
)

it('旧项目仍通过统一升级入口恢复', () => {
  expect(restoreTargetWorkbenchProject({ project: legacy(), states: [] }, catalog)).toEqual({
    ok: true,
    value: modern(),
  })
})

it('非法包装与循环项目失败返回，不抛出或丢失非法字段', () => {
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  for (const input of [
    null,
    undefined,
    [],
    {},
    { project: undefined },
    { project: cycle },
    { project: { ...modern().project, extra: undefined } },
  ])
    expect(restoreTargetWorkbenchProject(input, catalog).ok).toBe(false)
})
