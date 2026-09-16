import { expect, it } from 'vitest'
import { catalog, dictionary } from './catalystTestFixture'
import { collectCraftCosts } from './craftCosts'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import type { CraftResult } from './rehearsal'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const version = 'basic-2026-09-16-v81'
const iron = `pob2:augment:${JSON.stringify(['Iron Rune', 'armour'])}`
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function project(baseId = 'Runeforged Adherent Cuffs') {
  return {
    schemaVersion: 1,
    rulesVersion: version,
    sourceCommit: catalog._meta.sourceCommit,
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    initialState: {
      baseId,
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      nextAffixId: 1,
      sourceText: null,
      sockets: [],
      quality: 20,
    },
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
    operations: [{ kind: 'artificer' }, { kind: 'socket', socketIndex: 0, augmentId: iron }],
    cursor: 2,
  }
}
const read = (p: unknown) => parseTargetCraftProject(JSON.stringify(p), catalog, dictionary)
const wardStrategy = {
  maxSteps: 8,
  rules: [
    { conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
    {
      conditions: [
        { kind: 'not', condition: { kind: 'item-property', property: 'Ward', min: 200 } },
      ],
      action: { kind: 'stop' },
    },
  ],
}

it('v81保存全部未来孔位操作并按游标恢复，不把来源品质视为增效后基底', () => {
  for (const cursor of [0, 1, 2]) {
    const restored = must(read({ ...project(), cursor }))
    expect(restored.states.map((s) => s.sockets)).toEqual([[], [null], [iron]])
    expect(restored.states.map((s) => s.quality)).toEqual([20, 20, 20])
    expect(restored.project.operations).toHaveLength(2)
    const costs = must(collectCraftCosts(catalog, restored.project.operations.slice(0, cursor)))
    expect(costs.reduce((sum, cost) => sum + cost.count, 0)).toBe(cursor)
    const text = must(serializeTargetCraftProject(restored.project, catalog, dictionary))
    expect(must(loadTargetWorkbenchProject(text, catalog, dictionary)).project).toEqual(
      restored.project,
    )
  }
})

it('旧目标版本拒绝锻造起点以及尚未命中的嵌套Ward条件', () => {
  const ordinary = { ...project('Adherent Cuffs'), operations: [], cursor: 0 }
  for (const rulesVersion of [
    'basic-2026-09-16-v80',
    'basic-2026-09-16-v79',
    'basic-2026-09-12-v74',
  ]) {
    expect(read({ ...ordinary, rulesVersion }).ok).toBe(true)
    expect(read({ ...project(), cursor: 0, rulesVersion }).ok).toBe(false)
    expect(read({ ...ordinary, strategy: wardStrategy, rulesVersion }).ok).toBe(false)
  }
  expect(read({ ...ordinary, strategy: wardStrategy }).ok).toBe(true)
})

it('v72/v73合法基线不能通过迁移夹带新基底或未执行Ward策略', () => {
  const { targetDefinitions: _, orphanedTargets: __, ...plain } = project('Adherent Cuffs')
  for (const rulesVersion of ['basic-2026-09-12-v72', 'basic-2026-09-12-v73']) {
    const legacy = { ...plain, rulesVersion, operations: [], cursor: 0 }
    if (rulesVersion.endsWith('v72')) {
      const { nextAffixId: _, ...state } = legacy.initialState
      Object.assign(legacy, { initialState: state })
    }
    const reader = rulesVersion.endsWith('v72') ? parseCraftProject : parseIdentityCraftProject
    const readLegacy = (p: unknown) => reader(JSON.stringify(p), catalog, dictionary)
    expect(readLegacy(legacy).ok).toBe(true)
    for (const invalid of [
      { ...legacy, initialState: { ...legacy.initialState, baseId: 'Runeforged Adherent Cuffs' } },
      { ...legacy, strategy: wardStrategy },
    ]) {
      expect(readLegacy(invalid).ok).toBe(false)
      expect(loadTargetWorkbenchProject(JSON.stringify(invalid), catalog, dictionary).ok).toBe(
        false,
      )
    }
  }
})

it('沿用新旧方案保留接收装备的未来历史并选择v81，v80效果仍可回放', () => {
  const current = must(read({ ...project(), cursor: 0 }))
  const ordinary = { ...project('Adherent Cuffs'), operations: [], cursor: 0 }
  const oldTemplate = must(
    read({
      ...ordinary,
      rulesVersion: 'basic-2026-09-16-v80',
      strategy: { maxSteps: 8, rules: wardStrategy.rules.slice(0, 1) },
    }),
  )
  const reuse = (a: unknown, b: unknown) =>
    must(reuseTargetCraftPlan(JSON.stringify(a), JSON.stringify(b), catalog, dictionary))
  const kept = reuse(current.project, oldTemplate.project)
  expect(kept.project.rulesVersion).toBe(version)
  expect(kept.project.operations).toEqual(current.project.operations)
  expect(kept.states).toEqual(current.states)
  const wardTemplate = must(read({ ...ordinary, strategy: wardStrategy }))
  const upgraded = reuse(oldTemplate.project, wardTemplate.project)
  expect(upgraded.project.rulesVersion).toBe(version)
  expect(upgraded.project.strategy).toEqual(wardStrategy)
  const newRune = `pob2:augment:${JSON.stringify(['Greater Rune of Tithing', 'armour'])}`
  expect(
    read({
      ...project(),
      operations: [{ kind: 'artificer' }, { kind: 'socket', socketIndex: 0, augmentId: newRune }],
    }).ok,
  ).toBe(true)
})
