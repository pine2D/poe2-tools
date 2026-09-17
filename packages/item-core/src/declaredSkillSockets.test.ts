import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { exportCraftItemText } from './craftItemText'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import { createCraftState } from './rehearsal'
import {
  declareInitialSkillSockets,
  prepareSkillSocketsCraft,
  readCraftGrantedSkillSockets,
} from './skillSockets'
import { requiresSkillSocketTargetProjectVersion } from './skillSocketTargetProjectVersion'
import { statScalabilitySourceHash } from './statScalability'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
const state = {
  baseId: 'Rattling Sceptre',
  itemLevel: 86,
  rarity: 'normal' as const,
  affixes: [],
  sourceText: null,
  nextAffixId: 1,
}
const project = (declaredSkillSockets?: number) => ({
  schemaVersion: 1,
  sourceCommit: catalog._meta.sourceCommit,
  rulesVersion: 'basic-2026-09-17-v100',
  initialState: {
    ...state,
    ...(declaredSkillSockets === undefined ? {} : { declaredSkillSockets }),
  },
  operations: [],
  cursor: 0,
  targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
  orphanedTargets: [],
})
it('声明保持装备字段并参与读取、材料检查和原生文本出口', () => {
  const declared = declareInitialSkillSockets(catalog, state, 3)
  expect(declared).toEqual({ ok: true, value: { ...state, declaredSkillSockets: 3 } })
  if (!declared.ok) throw Error(declared.error)
  expect(readCraftGrantedSkillSockets(catalog, declared.value)).toMatchObject({
    ok: true,
    value: { sockets: 3 },
  })
  expect(prepareSkillSocketsCraft(catalog, declared.value, 'perfect', 2).ok).toBe(false)
  expect(prepareSkillSocketsCraft(catalog, declared.value, 'perfect', 3).ok).toBe(true)
  expect(exportCraftItemText(catalog, declared.value).ok).toBe(false)
  expect(declareInitialSkillSockets(catalog, { ...state, grantedSkillSockets: 4 }, 3).ok).toBe(
    false,
  )
  expect(
    createCraftState(catalog, { ...state, declaredSkillSockets: 5, grantedSkillSockets: 4 }).ok,
  ).toBe(false)
})
it('声明拒绝无效值、非数据字段；已有腐化仅允许观察', () => {
  for (const count of [undefined, null, 1, 6, 2.5, '3'])
    expect(createCraftState(catalog, { ...state, declaredSkillSockets: count } as never).ok).toBe(
      false,
    )
  let reads = 0
  for (const invalid of [
    Object.assign(Object.create({ declaredSkillSockets: 3 }), state),
    Object.defineProperty({ ...state }, 'declaredSkillSockets', { value: 3 }),
    Object.defineProperty({ ...state }, 'declaredSkillSockets', {
      enumerable: true,
      get() {
        reads++
        return 3
      },
    }),
  ])
    expect(createCraftState(catalog, invalid).ok).toBe(false)
  expect(reads).toBe(0)
  const observed = declareInitialSkillSockets(catalog, { ...state, corrupted: true }, 5)
  expect(observed.ok).toBe(true)
})
it('v100 完整未来和空项目保留版本，声明不得预装结果', () => {
  for (const cursor of [0, 1]) {
    const input = {
      ...project(3),
      operations: [{ kind: 'skill-sockets', tier: 'perfect', previousSockets: 3 }],
      cursor,
    }
    const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
    if (!loaded.ok) throw Error(loaded.error)
    expect(loaded.value.states.map((s) => [s.declaredSkillSockets, s.grantedSkillSockets])).toEqual(
      [
        [3, undefined],
        [3, 5],
      ],
    )
    const saved = serializeTargetCraftProject(loaded.value.project, catalog)
    if (!saved.ok) throw Error(saved.error)
    expect(JSON.parse(saved.value)).toEqual(input)
  }
  const blank = loadTargetWorkbenchProject(JSON.stringify(project()), catalog)
  expect(blank.ok).toBe(true)
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({
        ...project(3),
        initialState: { ...state, declaredSkillSockets: 3, grantedSkillSockets: 5 },
      }),
      catalog,
    ).ok,
  ).toBe(false)
})
it('v99 拒绝声明，复用方案不携带模板装备声明', () => {
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...project(3), rulesVersion: 'basic-2026-09-17-v99' }),
      catalog,
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('v100') })
  const reused = reuseTargetCraftPlan(
    JSON.stringify(project()),
    JSON.stringify({
      ...project(5),
      strategy: {
        maxSteps: 1,
        rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
      },
    }),
    catalog,
  )
  if (!reused.ok) throw Error(reused.error)
  expect(reused.value.project.initialState.declaredSkillSockets).toBeUndefined()
  expect(reused.value.project.rulesVersion).toBe('basic-2026-09-17-v100')
})

it('能力扫描区分 v99 条件与 v100 目标，拒绝全部旧版起点和嵌套目标', () => {
  expect(requiresSkillSocketTargetProjectVersion({ kind: 'granted-skill-sockets', min: 3 })).toBe(
    false,
  )
  expect(
    requiresSkillSocketTargetProjectVersion({
      nested: [{ kind: 'granted-skill-sockets', lineIndex: 0 }],
    }),
  ).toBe(true)
  for (let n = 2; n <= 99; n++) {
    const { targetDefinitions, orphanedTargets, ...rest } = project()
    const { nextAffixId: _, ...legacy } = state
    const input = {
      ...rest,
      rulesVersion: `basic-2026-09-${n >= 92 ? '17' : n >= 76 ? '16' : '12'}-v${n}`,
      initialState: n >= 73 ? state : legacy,
      ...(n >= 74 ? { targetDefinitions, orphanedTargets } : {}),
      ...(n === 75 ? { fluxCatalogSignature: fluxCatalogSignature(catalog) } : {}),
    }
    const parse =
      n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
    expect(parse(JSON.stringify(input), catalog).ok, `v${n}基线`).toBe(true)
    for (const patch of [
      { initialState: { ...input.initialState, declaredSkillSockets: 3 } },
      {
        targetImplicitValues: [
          { kind: 'granted-skill-sockets', lineIndex: 0, bounds: [{ index: 0, min: 4 }] },
        ],
      },
    ])
      expect(parse(JSON.stringify({ ...input, ...patch }), catalog), `v${n}`).toMatchObject({
        ok: false,
        error: expect.stringContaining('v100'),
      })
  }
})
it('导入声明在全部原文核对后恢复，不放行被篡改的等级与固有行', () => {
  const sourceText =
    'Item Class: Sceptres\nRarity: Normal\nRattling Sceptre\n--------\nItem Level: 86\n--------\nGrants Skill: Level 12 Skeletal Warrior Minion'
  const input = {
    ...project(3),
    initialState: {
      ...project(3).initialState,
      sourceText,
      implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion'],
    },
  }
  const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  expect(loaded.value.project.initialState).toEqual(input.initialState)
  const saved = serializeTargetCraftProject(loaded.value.project, catalog)
  if (!saved.ok) throw Error(saved.error)
  expect(JSON.parse(saved.value)).toEqual(input)
  for (const patch of [
    { itemLevel: 85 },
    { implicitLines: ['Grants Skill: Level 13 Skeletal Warrior Minion'] },
  ])
    expect(
      loadTargetWorkbenchProject(
        JSON.stringify({ ...input, initialState: { ...input.initialState, ...patch } }),
        catalog,
      ).ok,
    ).toBe(false)
})

it('v100 继承符文与缩放来源门禁，缺失指纹不能因新版本获准', () => {
  const input = {
    ...project(),
    initialState: { ...state, baseId: 'Crude Bow', sockets: [null] },
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    scalabilitySourceHash: statScalabilitySourceHash(catalog),
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId: `pob2:augment:["Thrud's Might","weapon"]` },
      {
        currency: 'transmutation',
        modIds: ['DestructionInfluenceSpeedModifierEffect'],
        rolls: [{ modId: 'DestructionInfluenceSpeedModifierEffect', affixId: 'a1', values: [30] }],
      },
    ],
  }
  const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  const saved = serializeTargetCraftProject(loaded.value.project, catalog)
  if (!saved.ok) throw Error(saved.error)
  expect(JSON.parse(saved.value)).toEqual(input)
  for (const key of ['augmentSourceHash', 'scalabilitySourceHash'])
    expect(
      loadTargetWorkbenchProject(JSON.stringify({ ...input, [key]: undefined }), catalog).ok,
    ).toBe(false)
})
it('v100 同行技能等级与辅助孔目标完整往返，沿用目标升级但不带声明', () => {
  const targetImplicitValues = [
    { kind: 'granted-skill', lineIndex: 0, bounds: [{ index: 0, min: 20 }] },
    { kind: 'granted-skill-sockets', lineIndex: 0, bounds: [{ index: 0, min: 4, max: 5 }] },
  ]
  const input = { ...project(3), targetImplicitValues }
  const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  const saved = serializeTargetCraftProject(loaded.value.project, catalog)
  if (!saved.ok) throw Error(saved.error)
  expect(JSON.parse(saved.value)).toEqual(input)
  const reused = reuseTargetCraftPlan(
    JSON.stringify({ ...project(), rulesVersion: 'basic-2026-09-17-v99' }),
    JSON.stringify(input),
    catalog,
  )
  if (!reused.ok) throw Error(reused.error)
  expect(reused.value.project.rulesVersion).toBe('basic-2026-09-17-v100')
  expect(reused.value.project.initialState.declaredSkillSockets).toBeUndefined()
  expect(reused.value.project.targetImplicitValues).toEqual(targetImplicitValues)
})
