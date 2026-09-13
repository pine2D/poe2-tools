import { expect, it } from 'vitest'
import { catalog, dictionary, imported } from './catalystTestFixture'
import { CRAFT_RULES_VERSION, type CraftProject, parseCraftProject } from './craftProject'
import { statScalabilitySourceHash } from './statScalability'
import { analyzeCraftTargets } from './targets'

function project(): CraftProject {
  const source = imported()
  if (!source.ok) throw new Error(source.error)
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: CRAFT_RULES_VERSION,
    initialState: source.value,
    operations: [
      {
        currency: 'divine',
        modIds: [],
        rolls: [{ modId: 'IncreasedLife1', values: [10] }],
        implicitValues: [10],
      },
    ],
    cursor: 1,
    targetModIds: ['IncreasedLife1'],
    targetValues: [
      { modId: 'IncreasedLife1', basis: 'effective', bounds: [{ index: 0, min: 22 }] },
    ],
    scalabilitySourceHash: statScalabilitySourceHash(catalog) as string,
  }
}
it('全游标保存有效阈值，恢复后按各步基础值计算达成状态', () => {
  for (const cursor of [0, 1]) {
    const p = { ...project(), cursor }
    const restored = parseCraftProject(JSON.stringify(p), catalog, dictionary)
    if (!restored.ok) throw new Error(restored.error)
    expect(restored.value.project.targetValues).toEqual(p.targetValues)
    const state = restored.value.states[cursor]
    if (!state) throw new Error('缺少恢复状态')
    const analysis = analyzeCraftTargets(catalog, state, p.targetModIds ?? [], p.targetValues)
    expect(analysis).toMatchObject({ ok: true, value: { targets: [{ matched: cursor === 0 }] } })
  }
})
it('旧v36和缺指纹不能注入有效值语义，无品质起点也需指纹', () => {
  const p = project()
  for (const other of [
    { ...p, rulesVersion: 'basic-2026-09-12-v36' },
    { ...p, scalabilitySourceHash: undefined },
    {
      ...p,
      initialState: {
        baseId: 'Gold Ring',
        itemLevel: 86,
        rarity: 'normal',
        sourceText: null,
        affixes: [],
      },
      operations: [],
      cursor: 0,
      scalabilitySourceHash: undefined,
    },
  ])
    expect(parseCraftProject(JSON.stringify(other), catalog, dictionary).ok).toBe(false)
})

it('无品质起点携带指纹可恢复有效目标，不能因此套用不存在的品质', () => {
  const p: CraftProject = {
    ...project(),
    initialState: {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'normal',
      sourceText: null,
      affixes: [],
    },
    operations: [],
    cursor: 0,
  }
  const restored = parseCraftProject(JSON.stringify(p), catalog, dictionary)
  if (!restored.ok) throw new Error(restored.error)
  expect(restored.value.project.scalabilitySourceHash).toEqual(p.scalabilitySourceHash)
  expect(restored.value.project.targetValues).toEqual(p.targetValues)
  const state = restored.value.states[0]
  if (!state) throw new Error('缺少起点')
  const analysis = analyzeCraftTargets(catalog, state, ['IncreasedLife1'], p.targetValues)
  expect(analysis).toMatchObject({ ok: true, value: { targets: [{ matched: false }], steps: [] } })
})
