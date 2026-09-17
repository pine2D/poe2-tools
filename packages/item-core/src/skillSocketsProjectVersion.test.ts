import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { type CraftProject, parseCraftProject, serializeCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { serializeIdentityCraftProject } from './craftProjectIdentitySerializer'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import { requiresSkillSocketsProjectVersion } from './skillSocketsProjectVersion'
import { statScalabilitySourceHash } from './statScalability'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
function project() {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-17-v99',
    initialState: {
      baseId: 'Rattling Sceptre',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
    },
    operations: [],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
}
const action = { kind: 'skill-sockets', tier: 'perfect', previousSockets: 2 }
const strategy = {
  maxSteps: 2,
  rules: [
    { conditions: [{ kind: 'not', condition: { kind: 'granted-skill-sockets', min: 5 } }], action },
  ],
}
it('辅助孔能力扫描覆盖结果、操作、条件和三种报价，不执行访问器或陷入循环', () => {
  for (const value of [
    { grantedSkillSockets: 3 },
    action,
    strategy,
    ...['lesser', 'greater', 'perfect'].map((tier) => ({
      pricing: { prices: { [`currency:${tier}-jewellers`]: 1 } },
    })),
  ])
    expect(requiresSkillSocketsProjectVersion({ nested: [value] })).toBe(true)
  const cycle: Record<string, unknown> = {
    get kind() {
      throw Error('访问器')
    },
  }
  cycle.self = cycle
  expect(requiresSkillSocketsProjectVersion(cycle)).toBe(false)
  expect(requiresSkillSocketsProjectVersion({ grantedSkillLevel: 20, sockets: [null] })).toBe(false)
})
it('v2–v98 拒绝完整未来、起点、深层未执行指引与仅报价的新能力', () => {
  for (let n = 2; n <= 98; n++) {
    const { targetDefinitions, orphanedTargets, ...base } = project()
    const { nextAffixId: _, ...legacy } = base.initialState
    const input = {
      ...base,
      rulesVersion: `basic-2026-09-${n >= 92 ? '17' : n >= 76 ? '16' : '12'}-v${n}`,
      initialState: n >= 73 ? base.initialState : legacy,
      ...(n >= 74 ? { targetDefinitions, orphanedTargets } : {}),
      ...(n === 75 ? { fluxCatalogSignature: fluxCatalogSignature(catalog) } : {}),
    }
    const parse =
      n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
    expect(parse(JSON.stringify(input), catalog).ok, `v${n}基线`).toBe(true)
    for (const patch of [
      { initialState: { ...input.initialState, grantedSkillSockets: 3 } },
      { operations: [action] },
      { strategy },
      ...['lesser', 'greater', 'perfect'].map((tier) => ({
        pricing: { unit: 'divine', prices: { [`currency:${tier}-jewellers`]: 1 } },
      })),
    ])
      expect(parse(JSON.stringify({ ...input, ...patch }), catalog), `v${n}`).toMatchObject({
        ok: false,
        error: expect.stringContaining('v99'),
      })
  }
})
it('v99 完整未来每个游标往返；未知起点与结果区分，禁止预装或伪造未来', () => {
  const input = {
    ...project(),
    operations: [action, { kind: 'perfect-flux', previousMaxLevel: 13 }],
    strategy,
    pricing: { unit: 'divine', prices: { 'currency:perfect-jewellers': 2 } },
  }
  for (const cursor of [0, 1, 2]) {
    const loaded = loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog)
    if (!loaded.ok) throw Error(loaded.error)
    expect(loaded.value.states.map((state) => state.grantedSkillSockets)).toEqual([undefined, 5, 5])
    expect(loaded.value.states[2]?.grantedSkillLevel).toBe(20)
    const saved = serializeTargetCraftProject(loaded.value.project, catalog)
    if (!saved.ok) throw Error(saved.error)
    expect(JSON.parse(saved.value)).toEqual({ ...input, cursor })
  }
  for (const invalid of [
    { ...project(), initialState: { ...project().initialState, grantedSkillSockets: 5 } },
    { ...input, operations: [action, action] },
    { ...input, operations: [{ ...action, previousSockets: 5 }] },
  ])
    expect(loadTargetWorkbenchProject(JSON.stringify(invalid), catalog).ok).toBe(false)
})
it('空v99保持版本，复用未执行指引升级且继承v98加权条件', () => {
  const blank = loadTargetWorkbenchProject(JSON.stringify(project()), catalog)
  if (!blank.ok) throw Error(blank.error)
  const saved = serializeTargetCraftProject(blank.value.project, catalog)
  if (!saved.ok) throw Error(saved.error)
  expect(JSON.parse(saved.value)).toEqual(project())
  const old = {
    ...project(),
    rulesVersion: 'basic-2026-09-17-v98',
    strategy: {
      maxSteps: 1,
      rules: [
        {
          conditions: [
            { kind: 'weighted-properties', terms: [{ property: 'Armour', weight: 1 }], min: 0 },
          ],
          action: { kind: 'stop' },
        },
      ],
    },
  }
  for (const [current, template] of [
    [project(), old],
    [old, { ...project(), strategy }],
  ] as const) {
    const reused = reuseTargetCraftPlan(JSON.stringify(current), JSON.stringify(template), catalog)
    if (!reused.ok) throw Error(reused.error)
    expect(reused.value.project.rulesVersion).toBe(project().rulesVersion)
    expect(reused.value.project.strategy).toEqual(template?.strategy)
  }
})
it('旧保存入口拒绝辅助孔报价，不能静默输出不可读取的项目', () => {
  const { targetDefinitions, orphanedTargets, ...base } = project()
  const { nextAffixId: _, ...legacy } = base.initialState
  const pricing = { unit: 'divine' as const, prices: { 'currency:lesser-jewellers': 1 } }
  expect(() =>
    serializeCraftProject({
      ...base,
      initialState: legacy,
      pricing,
      rulesVersion: 'basic-2026-09-12-v72',
    } as CraftProject),
  ).toThrow('v99')
  expect(
    serializeIdentityCraftProject(
      { ...base, pricing, rulesVersion: 'basic-2026-09-12-v73' } as Parameters<
        typeof serializeIdentityCraftProject
      >[0],
      catalog,
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('v99') })
  for (let n = 74; n <= 98; n++)
    expect(
      serializeTargetCraftProject(
        {
          ...project(),
          pricing,
          rulesVersion: `basic-2026-09-${n >= 92 ? '17' : n >= 76 ? '16' : '12'}-v${n}`,
        } as unknown as Parameters<typeof serializeTargetCraftProject>[0],
        catalog,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('v99') })
})

it('v99 继承 v96 符文骨骼及旧缩放来源门禁，不因版本升级丢弃指纹', () => {
  const input = {
    ...project(),
    initialState: {
      ...project().initialState,
      baseId: 'Crude Bow',
      implicitLines: undefined,
      sockets: [null],
    },
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
  expect(JSON.parse(saved.value)).toEqual(JSON.parse(JSON.stringify(input)))
  for (const key of ['augmentSourceHash', 'scalabilitySourceHash'])
    expect(
      parseTargetCraftProject(JSON.stringify({ ...input, [key]: undefined }), catalog).ok,
    ).toBe(false)
  const bone = {
    ...project(),
    initialState: {
      ...project().initialState,
      baseId: 'Armoured Cap',
      implicitLines: undefined,
      sockets: [null],
    },
    augmentSourceHash: input.augmentSourceHash,
    desecrationSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModVeiled.lua')
      ?.sha256,
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId: `pob2:augment:["Vorana's Carnage","helmet"]` },
    ],
    strategy: {
      maxSteps: 1,
      rules: [
        {
          conditions: [{ kind: 'always' }],
          action: { kind: 'desecrate', boneId: 'preserved_rib' },
        },
      ],
    },
  }
  const restored = loadTargetWorkbenchProject(JSON.stringify(bone), catalog)
  if (!restored.ok) throw Error(restored.error)
  for (const key of ['augmentSourceHash', 'desecrationSourceHash'])
    expect(parseTargetCraftProject(JSON.stringify({ ...bone, [key]: undefined }), catalog).ok).toBe(
      false,
    )
})
