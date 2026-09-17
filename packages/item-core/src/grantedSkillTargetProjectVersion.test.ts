import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { type CraftProject, parseCraftProject, serializeCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { serializeIdentityCraftProject } from './craftProjectIdentitySerializer'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import { requiresGrantedSkillTargetProjectVersion } from './grantedSkillTargetProjectVersion'
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
    rulesVersion: 'basic-2026-09-17-v97',
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
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
}
it('仅深层显式技能目标升级 v97，扫描不执行访问器', () => {
  expect(
    requiresGrantedSkillTargetProjectVersion({ future: [{ nested: { kind: 'granted-skill' } }] }),
  ).toBe(true)
  expect(
    requiresGrantedSkillTargetProjectVersion({
      kind: 'perfect-flux',
      previousMaxLevel: 13,
      grantedSkillLevel: 20,
    }),
  ).toBe(false)
  expect(requiresGrantedSkillTargetProjectVersion({ kind: 'granted-skill-level' })).toBe(false)
  expect(
    requiresGrantedSkillTargetProjectVersion({
      get kind() {
        throw Error('访问器')
      },
      get nested() {
        throw Error('访问器')
      },
    }),
  ).toBe(false)
})
it('空 v97 往返及复用旧方案不降级', () => {
  const input = project()
  const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  const saved = serializeTargetCraftProject(loaded.value.project, catalog)
  if (!saved.ok) throw Error(saved.error)
  expect(JSON.parse(saved.value)).toEqual(input)
  const reused = reuseTargetCraftPlan(
    saved.value,
    JSON.stringify({
      ...input,
      rulesVersion: 'basic-2026-09-12-v74',
      strategy: {
        maxSteps: 1,
        rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
      },
    }),
    catalog,
  )
  if (!reused.ok) throw Error(reused.error)
  expect(reused.value.project.rulesVersion).toBe(input.rulesVersion)
})
it('v2–v96 拒绝起点、目标、完整未来及嵌套未执行指引中的技能目标', () => {
  for (let n = 2; n <= 96; n++) {
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
    expect(parse(JSON.stringify(input), catalog).ok, `v${n} 基线`).toBe(true)
    const target = { kind: 'granted-skill', lineIndex: 0, bounds: [{ index: 0, min: 20 }] }
    for (const patch of [
      { initialState: { ...input.initialState, nested: target } },
      { targetImplicitValues: [target] },
      { operations: [{ nested: target }] },
      { strategy: { rules: [{ action: { nested: target } }] } },
    ])
      expect(parse(JSON.stringify({ ...input, ...patch }), catalog)).toMatchObject({
        ok: false,
        error: expect.stringContaining('v97'),
      })
  }
})

it('真实技能13→20完整未来在所有游标往返，复用只迁移目标并升级版本', () => {
  const input = {
    ...project(),
    initialState: {
      ...project().initialState,
      baseId: 'Rattling Sceptre',
      itemLevel: 53,
      implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)'],
    },
    targetImplicitValues: [
      { kind: 'granted-skill', lineIndex: 0, bounds: [{ index: 0, min: 20 }] },
    ],
    operations: [{ kind: 'perfect-flux', previousMaxLevel: 13 }],
    pricing: { unit: 'divine', prices: { 'currency:perfect-flux': 3 } },
    strategy: {
      maxSteps: 2,
      rules: [
        { conditions: [{ kind: 'granted-skill-level', min: 20 }], action: { kind: 'stop' } },
        {
          conditions: [{ kind: 'always' }],
          action: { kind: 'perfect-flux', previousMaxLevel: 13 },
        },
      ],
    },
  }
  for (const cursor of [0, 1]) {
    const loaded = loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog)
    if (!loaded.ok) throw Error(loaded.error)
    expect(loaded.value.states).toHaveLength(2)
    expect(loaded.value.states[0]?.implicitLines).toEqual(input.initialState.implicitLines)
    expect(loaded.value.states[1]?.grantedSkillLevel).toBe(20)
    const saved = serializeTargetCraftProject(loaded.value.project, catalog)
    if (!saved.ok) throw Error(saved.error)
    expect(JSON.parse(saved.value)).toEqual({ ...input, cursor })
    expect(loadTargetWorkbenchProject(saved.value, catalog)).toEqual(loaded)
  }
  const { targetImplicitValues: _, strategy: _strategy, ...ordinary } = input
  const old = { ...ordinary, rulesVersion: 'basic-2026-09-16-v76' }
  const history = loadTargetWorkbenchProject(JSON.stringify(old), catalog)
  if (!history.ok) throw Error(history.error)
  expect(history.value.project.rulesVersion).toBe(old.rulesVersion)
  const current = { ...ordinary, operations: [], rulesVersion: 'basic-2026-09-16-v76' }
  const reused = reuseTargetCraftPlan(JSON.stringify(current), JSON.stringify(input), catalog)
  if (!reused.ok) throw Error(reused.error)
  expect(reused.value.project).toMatchObject({
    rulesVersion: input.rulesVersion,
    targetImplicitValues: input.targetImplicitValues,
    operations: [],
    cursor: 0,
    strategy: input.strategy,
  })
  expect(reused.value.states).toHaveLength(1)
  expect(reused.value.states[0]).not.toHaveProperty('grantedSkillLevel')
})

it('v97 继承 v96 符文骨骼及旧缩放来源门禁，不因版本升级丢弃指纹', () => {
  const input = {
    ...project(),
    initialState: { ...project().initialState, baseId: 'Crude Bow', sockets: [null] },
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
      parseTargetCraftProject(JSON.stringify({ ...input, [key]: undefined }), catalog).ok,
    ).toBe(false)
  const bone = {
    ...project(),
    initialState: { ...project().initialState, baseId: 'Armoured Cap', sockets: [null] },
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

it('所有旧版保存入口拒绝技能目标，不能输出自身无法读取的项目', () => {
  const input = {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-12-v72',
    initialState: {
      baseId: 'Rattling Sceptre',
      itemLevel: 53,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
    },
    operations: [],
    cursor: 0,
    targetImplicitValues: [
      { kind: 'granted-skill', lineIndex: 0, bounds: [{ index: 0, min: 20 }] },
    ],
  } satisfies CraftProject
  expect(() => serializeCraftProject(input)).toThrow('v97')
  expect(
    serializeIdentityCraftProject(
      {
        ...input,
        rulesVersion: 'basic-2026-09-12-v73',
        initialState: { ...input.initialState, nextAffixId: 1 },
      },
      catalog,
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('v97') })
  const candidate = {
    ...input,
    initialState: { ...input.initialState, nextAffixId: 1 },
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
  for (let n = 74; n <= 96; n++) {
    const rulesVersion =
      `basic-2026-09-${n >= 92 ? '17' : n >= 76 ? '16' : '12'}-v${n}` as import('./craftProjectTargets').TargetCraftProject['rulesVersion']
    expect(serializeTargetCraftProject({ ...candidate, rulesVersion }, catalog)).toMatchObject({
      ok: false,
      error: expect.stringContaining('v97'),
    })
  }
  expect(
    serializeTargetCraftProject({ ...candidate, rulesVersion: 'basic-2026-09-17-v97' }, catalog).ok,
  ).toBe(true)
})
