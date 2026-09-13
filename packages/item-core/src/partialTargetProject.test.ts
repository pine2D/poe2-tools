import { expect, it } from 'vitest'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { catalog, conflictingCatalog, state } from './partialTargetFixture'
import { analyzeCraftTargets, craftTargetsSatisfied } from './targets'

function project(): CraftProject {
  return {
    schemaVersion: 1,
    sourceCommit: catalog()._meta.sourceCommit,
    rulesVersion: CRAFT_RULES_VERSION,
    initialState: state('normal'),
    operations: [
      { currency: 'transmutation', modIds: ['p1'], rolls: [{ modId: 'p1', values: [5] }] },
    ],
    cursor: 1,
    targetModIds: ['p1', 's1'],
    minimumTargetCount: 1,
  }
}
it('全部游标保留至少一组语义，按各步装备重新判断', () => {
  for (const cursor of [0, 1]) {
    const p = { ...project(), cursor }
    const restored = parseCraftProject(serializeCraftProject(p), catalog())
    if (!restored.ok) throw new Error(restored.error)
    expect(restored.value.project.minimumTargetCount).toBe(1)
    const current = restored.value.states[cursor]
    if (!current) throw new Error('缺少状态')
    const analysis = analyzeCraftTargets(
      catalog(),
      current,
      p.targetModIds ?? [],
      [],
      [],
      undefined,
      [],
      undefined,
      restored.value.project.minimumTargetCount,
    )
    if (!analysis.ok) throw new Error(analysis.error)
    expect(craftTargetsSatisfied(analysis.value, restored.value.project.minimumTargetCount)).toBe(
      cursor === 1,
    )
  }
})
it('旧版本不能注入数量条件，非法和无目标条件不能保存恢复', () => {
  const p = project()
  expect(
    parseCraftProject(JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-12-v37' }), catalog()).ok,
  ).toBe(false)
  for (const minimumTargetCount of [0, 3, 1.5, null, '1']) {
    expect(parseCraftProject(JSON.stringify({ ...p, minimumTargetCount }), catalog()).ok).toBe(
      false,
    )
    expect(() => serializeCraftProject({ ...p, minimumTargetCount } as CraftProject)).toThrow()
  }
  expect(parseCraftProject(JSON.stringify({ ...p, targetModIds: undefined }), catalog()).ok).toBe(
    false,
  )
  expect(() =>
    serializeCraftProject({ ...p, minimumTargetCount: undefined } as unknown as CraftProject),
  ).toThrow()
  const legacy = { ...p, rulesVersion: 'basic-2026-09-12-v37', minimumTargetCount: undefined }
  const restored = parseCraftProject(JSON.stringify(legacy), catalog())
  expect(restored).toMatchObject({ ok: true })
  if (restored.ok) expect(restored.value.project).not.toHaveProperty('minimumTargetCount')
})

it('项目恢复拒绝数量组合无法容纳必选破裂组的配置', () => {
  const source = conflictingCatalog()
  const p = {
    ...project(),
    initialState: state('normal'),
    operations: [],
    cursor: 0,
    targetModIds: ['ess', 'fire', 'cold'],
    targetFracturedModId: 'ess',
    minimumTargetCount: 2,
  }
  expect(parseCraftProject(JSON.stringify(p), source)).toMatchObject({
    ok: false,
    error: expect.stringContaining('包含必选破裂组'),
  })
  expect(parseCraftProject(JSON.stringify({ ...p, minimumTargetCount: 1 }), source).ok).toBe(true)
})
