import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { type CraftProject, parseCraftProject, serializeCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import { requiresSkillLevelDeclarationProjectVersion } from './skillLevelDeclarationProjectVersion'
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
const project = (declaredSkillLevel?: number) => ({
  schemaVersion: 1,
  sourceCommit: catalog._meta.sourceCommit,
  rulesVersion: 'basic-2026-09-17-v101',
  initialState: {
    ...state,
    ...(declaredSkillLevel === undefined ? {} : { declaredSkillLevel }),
  },
  operations: [],
  cursor: 0,
  targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
  orphanedTargets: [],
})

it('旧序列化入口拒绝声明，不输出无法重新读取的旧项目', () => {
  const { nextAffixId: _, ...legacyState } = state
  const legacy: CraftProject = {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-12-v72',
    initialState: legacyState,
    operations: [],
    cursor: 0,
  }
  expect(parseCraftProject(serializeCraftProject(legacy), catalog).ok).toBe(true)
  for (const declared of [
    { ...legacy, initialState: { ...legacyState, declaredSkillLevel: 13 } },
    { ...legacy, unused: { declaredSkillLevel: 13 } },
  ])
    expect(() => serializeCraftProject(declared)).toThrow('v101')
})

it('v101 同时恢复等级和辅助孔声明及完整未来，不预装结果', () => {
  const input = {
    ...project(13),
    initialState: { ...project(13).initialState, declaredSkillSockets: 3 },
    operations: [
      { kind: 'perfect-flux', previousMaxLevel: 13 },
      { kind: 'skill-sockets', tier: 'perfect', previousSockets: 3 },
    ],
  }
  for (const cursor of [0, 2]) {
    const loaded = loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog)
    if (!loaded.ok) throw Error(loaded.error)
    expect(
      loaded.value.states.map((s) => [
        s.declaredSkillLevel,
        s.grantedSkillLevel,
        s.declaredSkillSockets,
        s.grantedSkillSockets,
      ]),
    ).toEqual([
      [13, undefined, 3, undefined],
      [13, 20, 3, undefined],
      [13, 20, 3, 5],
    ])
    const saved = serializeTargetCraftProject(loaded.value.project, catalog)
    if (!saved.ok) throw Error(saved.error)
    expect(JSON.parse(saved.value)).toEqual({ ...input, cursor })
  }
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({
        ...project(13),
        initialState: { ...project(13).initialState, grantedSkillLevel: 20 },
      }),
      catalog,
    ).ok,
  ).toBe(false)
})
it('v2–100 拒绝新声明，包括完整未来和未执行结构', () => {
  for (let n = 2; n <= 100; n++) {
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
      { initialState: { ...input.initialState, declaredSkillLevel: 13 } },
      { operations: [{ declaredSkillLevel: 13 }] },
      { strategy: { nested: { declaredSkillLevel: 13 } } },
    ])
      expect(parse(JSON.stringify({ ...input, ...patch }), catalog), `v${n}`).toMatchObject({
        ok: false,
        error: expect.stringContaining('v101'),
      })
  }
})
it('空 v101 保持版本，复用模板不复制声明，保留当前声明', () => {
  const source = {
    ...project(20),
    strategy: {
      maxSteps: 1,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  for (const level of [undefined, 13]) {
    const loaded = loadTargetWorkbenchProject(JSON.stringify(project(level)), catalog)
    if (!loaded.ok) throw Error(loaded.error)
    expect(loaded.value.project.rulesVersion).toBe('basic-2026-09-17-v101')
    const reused = reuseTargetCraftPlan(
      JSON.stringify(project(level)),
      JSON.stringify(source),
      catalog,
    )
    if (!reused.ok) throw Error(reused.error)
    expect(reused.value.project.rulesVersion).toBe('basic-2026-09-17-v101')
    expect(reused.value.project.initialState.declaredSkillLevel).toBe(level)
  }
})
it('源装备完整核对后恢复双声明，篡改原文等级与固有行仍拒绝', () => {
  const sourceText =
    'Item Class: Sceptres\nRarity: Normal\nRattling Sceptre\n--------\nItem Level: 86\n--------\nGrants Skill: Level 12 Skeletal Warrior Minion'
  const input = {
    ...project(13),
    initialState: {
      ...project(13).initialState,
      sourceText,
      declaredSkillSockets: 3,
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
    { declaredSkillLevel: 11 },
  ])
    expect(
      loadTargetWorkbenchProject(
        JSON.stringify({ ...input, initialState: { ...input.initialState, ...patch } }),
        catalog,
      ).ok,
    ).toBe(false)
})

it('v101 继承符文与缩放来源门禁，缺失指纹不能因新版本获准', () => {
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

it('能力扫描不执行访问器，已知原文最高等级不能被声明覆盖', () => {
  let reads = 0
  const input = {
    nested: Object.defineProperty({}, 'declaredSkillLevel', {
      get() {
        reads++
        return 13
      },
    }),
  }
  expect(requiresSkillLevelDeclarationProjectVersion(input)).toBe(true)
  expect(reads).toBe(0)
  const sourceText =
    'Item Class: Sceptres\nRarity: Normal\nRattling Sceptre\n--------\nItem Level: 86\n--------\nGrants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)'
  for (const level of [13, 14]) {
    const imported = {
      ...project(level),
      initialState: {
        ...project(level).initialState,
        sourceText,
        implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)'],
      },
    }
    expect(loadTargetWorkbenchProject(JSON.stringify(imported), catalog).ok).toBe(level === 13)
  }
})
