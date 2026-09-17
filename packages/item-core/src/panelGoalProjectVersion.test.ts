import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { type CraftProject, parseCraftProject, serializeCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { serializeIdentityCraftProject } from './craftProjectIdentitySerializer'
import {
  parseTargetCraftProject,
  serializeTargetCraftProject,
  type TargetCraftProject,
} from './craftProjectTargets'
import { inspectItem } from './export'
import { fluxCatalogSignature } from './fluxes'
import {
  PANEL_GOAL_RULES_VERSION,
  requiresPanelGoalProjectVersion,
} from './panelGoalProjectVersion'
import { parseItem } from './parse'
import { importIdentifiedCraftState } from './rehearsalImport'
import { statScalabilitySourceHash } from './statScalability'
import {
  loadTargetWorkbenchProject,
  restoreTargetWorkbenchProject,
  reuseTargetCraftPlan,
} from './targetWorkbenchProject'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
const goals = [{ kind: 'item-property', property: 'Armour', min: 40 }]
function project() {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-18-v114',
    initialState: {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
    },
    operations: [],
    cursor: 0,
    targetDefinitions: {
      nextTargetId: 1,
      targets: [],
      alternatives: [],
      values: [],
      panelGoals: goals,
    },
    orphanedTargets: [],
  }
}
it('v114 保留未知面板目标、完整未来和来源；所有游标保存恢复', () => {
  const input = {
    ...project(),
    initialState: { ...project().initialState, baseId: 'Rattling Sceptre', sockets: [] },
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    scalabilitySourceHash: statScalabilitySourceHash(catalog),
    operations: [{ kind: 'vaal', outcome: 'socket' }],
  }
  for (const cursor of [0, 1]) {
    const candidate = { ...input, cursor }
    const loaded = loadTargetWorkbenchProject(JSON.stringify(candidate), catalog)
    if (!loaded.ok) throw Error(loaded.error)
    expect(loaded.value.states).toHaveLength(2)
    const saved = serializeTargetCraftProject(loaded.value.project, catalog)
    if (!saved.ok) throw Error(saved.error)
    expect(JSON.parse(saved.value)).toEqual(candidate)
    expect(restoreTargetWorkbenchProject({ project: JSON.parse(saved.value) }, catalog)).toEqual(
      loaded,
    )
  }
  for (const key of ['augmentSourceHash', 'scalabilitySourceHash', 'sourceCommit'])
    expect(
      parseTargetCraftProject(JSON.stringify({ ...input, [key]: 'invalid' }), catalog).ok,
    ).toBe(false)
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({
        ...input,
        operations: [
          { kind: 'vaal', outcome: 'socket' },
          { kind: 'vaal', outcome: 'socket' },
        ],
      }),
      catalog,
    ).ok,
  ).toBe(false)
})
it('v2–v113 基线可读但拒绝目标内新字段，包括空数组；保存同样拒绝', () => {
  for (let n = 2; n <= 113; n++) {
    const { targetDefinitions, orphanedTargets, ...base } = project()
    const { panelGoals: _, ...definitions } = targetDefinitions
    const { nextAffixId: _id, ...legacy } = base.initialState
    const input = {
      ...base,
      rulesVersion: `basic-2026-09-${n >= 113 ? '18' : n >= 92 ? '17' : n >= 76 ? '16' : '12'}-v${n}`,
      initialState: n >= 73 ? base.initialState : legacy,
      ...(n >= 74 ? { targetDefinitions: definitions, orphanedTargets } : {}),
      ...(n === 75 ? { fluxCatalogSignature: fluxCatalogSignature(catalog) } : {}),
    }
    const read =
      n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
    expect(read(JSON.stringify(input), catalog).ok, `v${n}基线`).toBe(true)
    for (const panelGoals of [[], goals]) {
      const invalid = { ...input, targetDefinitions: { ...definitions, panelGoals } }
      expect(read(JSON.stringify(invalid), catalog)).toMatchObject({
        ok: false,
        error: expect.stringContaining('v114'),
      })
      if (n <= 72)
        expect(() => serializeCraftProject(invalid as unknown as CraftProject)).toThrow('v114')
      else if (n === 73)
        expect(serializeIdentityCraftProject(invalid as never, catalog).ok).toBe(false)
      else expect(serializeTargetCraftProject(invalid as never, catalog).ok).toBe(false)
    }
  }
})
it('纯面板收藏跨基底沿用保留条件，新版本不降级，无新能力不升级', () => {
  const { panelGoals: _, ...plain } = project().targetDefinitions
  const old = { ...project(), rulesVersion: 'basic-2026-09-12-v74', targetDefinitions: plain }
  expect(loadTargetWorkbenchProject(JSON.stringify(old), catalog)).toMatchObject({
    ok: true,
    value: { project: { rulesVersion: old.rulesVersion } },
  })
  const reused = reuseTargetCraftPlan(
    JSON.stringify(old),
    JSON.stringify({
      ...project(),
      initialState: { ...project().initialState, baseId: 'Armoured Cap' },
    }),
    catalog,
  )
  if (!reused.ok) throw Error(reused.error)
  expect(reused.value.project.targetDefinitions.panelGoals).toEqual(goals)
  expect(reused.value.project.rulesVersion).toBe(project().rulesVersion)
  const legacyTemplate = {
    ...old,
    strategy: {
      maxSteps: 1,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  const again = reuseTargetCraftPlan(
    JSON.stringify(reused.value.project),
    JSON.stringify(legacyTemplate),
    catalog,
  )
  expect(again).toMatchObject({
    ok: true,
    value: { project: { rulesVersion: project().rulesVersion } },
  })
})
it('保存与恢复拒绝访问器而不执行', () => {
  const input = project()
  Object.defineProperty(input.targetDefinitions, 'panelGoals', {
    enumerable: true,
    get() {
      throw Error('执行访问器')
    },
  })
  expect(serializeTargetCraftProject(input as unknown as TargetCraftProject, catalog).ok).toBe(
    false,
  )
  expect(restoreTargetWorkbenchProject({ project: input }, catalog).ok).toBe(false)
})

it('版本扫描只读取目标定义数据，不解释文本或执行访问器，循环安全', () => {
  expect(PANEL_GOAL_RULES_VERSION).toBe(project().rulesVersion)
  expect(requiresPanelGoalProjectVersion(project())).toBe(true)
  expect(requiresPanelGoalProjectVersion({ definitions: { panelGoals: [] } })).toBe(true)
  expect(requiresPanelGoalProjectVersion(project().targetDefinitions)).toBe(true)
  expect(requiresPanelGoalProjectVersion({ sourceText: JSON.stringify(project()) })).toBe(false)
  expect(requiresPanelGoalProjectVersion({ panelGoals: goals })).toBe(false)
  expect(
    requiresPanelGoalProjectVersion({
      get definitions() {
        throw Error('访问器')
      },
    }),
  ).toBe(false)
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  expect(requiresPanelGoalProjectVersion(cycle)).toBe(false)
  cycle.future = { targetDefinitions: { panelGoals: [] } }
  expect(requiresPanelGoalProjectVersion(cycle)).toBe(true)
})
it('v114 继承 v113 副手雕像完整未来和嵌套未执行指引的双来源门禁', () => {
  const input = {
    ...project(),
    initialState: { ...project().initialState, baseId: 'Splintered Tower Shield', sockets: [null] },
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    scalabilitySourceHash: statScalabilitySourceHash(catalog),
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId: 'pob2:augment:["Ox Idol","shield"]' },
      { kind: 'socket', socketIndex: 0, augmentId: 'pob2:augment:["Idol of Silk","shield"]' },
    ],
    strategy: {
      maxSteps: 1,
      rules: [
        {
          conditions: [{ kind: 'all', conditions: [{ kind: 'always' }] }],
          action: {
            kind: 'socket',
            socketIndex: 0,
            augmentId: 'pob2:augment:["Ox Idol","shield"]',
          },
        },
      ],
    },
  }
  for (const cursor of [0, 1, 2]) {
    const loaded = loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog)
    if (!loaded.ok) throw Error(loaded.error)
    expect(loaded.value.states).toHaveLength(3)
    const saved = serializeTargetCraftProject(loaded.value.project, catalog)
    if (!saved.ok) throw Error(saved.error)
    expect(JSON.parse(saved.value)).toEqual({ ...input, cursor })
  }
  for (const key of ['augmentSourceHash', 'scalabilitySourceHash'])
    for (const value of [undefined, 'invalid'])
      expect(
        loadTargetWorkbenchProject(JSON.stringify({ ...input, [key]: value }), catalog).ok,
      ).toBe(false)
})

it('导入原文在面板目标保存恢复后逐字保留', () => {
  const exported = exportCraftItemText(catalog, { ...project().initialState, rarity: 'normal' })
  if (!exported.ok) throw Error(exported.error)
  const parsed = parseItem(exported.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const dictionary = createCraftItemDictionary(catalog, {})
  const imported = importIdentifiedCraftState(
    catalog,
    'Gold Ring',
    parsed.item,
    inspectItem(parsed.item, dictionary),
  )
  if (!imported.ok) throw Error(imported.error)
  const input = { ...project(), initialState: imported.value }
  const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog, dictionary)
  if (!loaded.ok) throw Error(loaded.error)
  const saved = serializeTargetCraftProject(loaded.value.project, catalog, dictionary)
  if (!saved.ok) throw Error(saved.error)
  expect(JSON.parse(saved.value)).toEqual(input)
  expect(JSON.parse(saved.value).initialState.sourceText).toBe(exported.value.text)
})
