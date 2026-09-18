import { expect, it } from 'vitest'
import { parseTargetCraftProject } from './craftProjectTargets'
import { catalog, state } from './partialTargetFixture'
import { requiresSpendingProjectVersion } from './spendingProjectVersion'
import { reuseTargetCraftPlan } from './targetWorkbenchProject'

const data = catalog()
const project = {
  schemaVersion: 1,
  rulesVersion: 'basic-2026-09-18-v122',
  sourceCommit: data._meta.sourceCommit,
  initialState: { ...state('normal'), nextAffixId: 1 },
  operations: [],
  cursor: 0,
  targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
  orphanedTargets: [],
  strategy: {
    maxSteps: 10,
    rules: [
      {
        conditions: [{ kind: 'not', condition: { kind: 'spent-cost', unit: 'divine', min: 10 } }],
        action: { kind: 'stop' },
      },
    ],
  },
}
it('沿用费用指引升级v122，去除费用条件不降版并保留未重做历史', () => {
  const receiver = {
    ...project,
    rulesVersion: 'basic-2026-09-18-v121',
    strategy: {
      maxSteps: 10,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
    operations: [{ currency: 'transmutation', modIds: ['p1'] }],
    cursor: 0,
  }
  const result = reuseTargetCraftPlan(JSON.stringify(receiver), JSON.stringify(project), data)
  if (!result.ok) throw Error(result.error)
  expect(result.value.project.rulesVersion).toBe(project.rulesVersion)
  expect(result.value.project.operations).toEqual(receiver.operations)
  expect(result.value.project.cursor).toBe(0)
  const retained = reuseTargetCraftPlan(
    JSON.stringify(result.value.project),
    JSON.stringify(receiver),
    data,
  )
  if (!retained.ok) throw Error(retained.error)
  expect(retained.value.project.rulesVersion).toBe(project.rulesVersion)
  expect(retained.value.project.operations).toEqual(receiver.operations)
  expect(retained.value.project.cursor).toBe(0)
})
it('v122保存未执行费用条件，v121拒绝嵌套夹带，单独报价保持兼容', () => {
  const read = (value: unknown) => parseTargetCraftProject(JSON.stringify(value), data)
  const restored = read(project)
  expect(restored, restored.ok ? '' : restored.error).toMatchObject({
    ok: true,
    value: { project: { rulesVersion: project.rulesVersion, strategy: project.strategy } },
  })
  expect(read({ ...project, rulesVersion: 'basic-2026-09-18-v121' })).toMatchObject({
    ok: false,
    error: expect.stringContaining('v122'),
  })
  const { strategy: _, ...plain } = project
  expect(
    read({
      ...plain,
      rulesVersion: 'basic-2026-09-18-v121',
      pricing: { unit: 'divine', prices: {} },
    }).ok,
  ).toBe(true)
})
it('能力检测只读数据字段，不执行访问器或解释原文', () => {
  expect(requiresSpendingProjectVersion(project)).toBe(true)
  expect(requiresSpendingProjectVersion({ sourceText: JSON.stringify(project) })).toBe(false)
  expect(
    requiresSpendingProjectVersion({
      get kind() {
        throw Error('不得读取')
      },
    }),
  ).toBe(false)
})
