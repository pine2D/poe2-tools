import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import {
  destructionRuneProjectCapabilityError,
  requiresDestructionRuneProjectVersion,
} from './destructionRuneProjectVersion'
import { fluxCatalogSignature } from './fluxes'
import { requiresInfluenceRuneProjectVersion } from './influenceRuneProjectVersion'
import type { CraftResult } from './rehearsal'
import { statScalabilitySourceHash } from './statScalability'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const augmentId = `pob2:augment:["Thrud's Might","weapon"]`
const modId = 'DestructionInfluenceSpeedModifierEffect'
const version = 'basic-2026-09-17-v94'
const augmentSourceHash = catalog._meta.sources.find(
  (s) => s.path === 'src/Data/ModRunes.lua',
)?.sha256
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function project() {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: version,
    initialState: {
      baseId: 'Crude Bow',
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
function future() {
  return {
    ...project(),
    augmentSourceHash,
    scalabilitySourceHash: statScalabilitySourceHash(catalog),
    initialState: { ...project().initialState, sockets: [null] },
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId },
      {
        currency: 'transmutation',
        modIds: [modId],
        rolls: [{ modId, affixId: 'a1', values: [30] }],
      },
    ],
    targetDefinitions: {
      nextTargetId: 2,
      targets: [{ targetId: 't1', modId }],
      alternatives: [],
      values: [],
    },
  }
}
it('v94 空白项目保留版本，完整未来来源与目标可在每个游标保存恢复', () => {
  const blank = must(loadTargetWorkbenchProject(JSON.stringify(project()), catalog))
  expect(JSON.parse(must(serializeTargetCraftProject(blank.project, catalog)))).toEqual(project())
  for (const cursor of [0, 1, 2]) {
    const input = { ...future(), cursor }
    const restored = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
    expect(restored.project).toEqual(input)
    expect(restored.states.map((s) => s.sockets)).toEqual([[null], [augmentId], [augmentId]])
    expect(restored.states[2]?.affixes[0]?.modId).toBe(modId)
    expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(input)
  }
})
it('旧项目拒绝起点、未执行镶嵌、目标、声明和仅报价的新能力', () => {
  const real = { ...catalog, fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) }
  for (let n = 2; n <= 93; n++) {
    const { targetDefinitions, orphanedTargets, ...base } = project()
    const { nextAffixId: _, ...legacy } = base.initialState
    const input = {
      ...base,
      rulesVersion: `basic-2026-09-${n >= 92 ? '17' : n >= 76 ? '16' : '12'}-v${n}`,
      initialState: n >= 73 ? base.initialState : legacy,
      ...(n >= 74 ? { targetDefinitions, orphanedTargets } : {}),
      ...(n === 75 ? { fluxCatalogSignature: fluxCatalogSignature(real) } : {}),
    }
    const read =
      n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
    expect(read(JSON.stringify(input), real).ok, `v${n}基线`).toBe(true)
    for (const extra of [
      { operations: [{ kind: 'socket', socketIndex: 0, augmentId }] },
      { importedSockets: [augmentId] },
      { initialState: { ...input.initialState, sockets: [augmentId] } },
      { targetModIds: [modId] },
      { targetDefinitions: { targets: [{ targetId: 't1', modId }] } },
      { targetDefinitions: { alternatives: [{ targetId: 't1', modIds: [modId] }] } },
      { orphanedTargets: [{ targetId: 't1', modId }] },
      {
        initialState: {
          ...input.initialState,
          runeSourceLines: ['Can roll Destruction modifiers'],
        },
      },
      { importedSockets: [`pob2:augment:["Thrud's Might","caster"]`] },
      { pricing: { unit: 'divine', prices: { "augment:Thrud's Might": 1 } } },
      {
        strategy: {
          rules: [{ action: { kind: 'socket', socketIndex: 'first-empty', augmentId } }],
        },
      },
    ])
      expect(read(JSON.stringify({ ...input, ...extra }), real), `v${n}`).toMatchObject({
        ok: false,
        error: expect.stringContaining('v94'),
      })
  }
})
it('新版仍拒绝无来源目标、丢失签名及不可执行未来镶嵌', () => {
  const p = future()
  for (const bad of [
    { ...p, augmentSourceHash: '0'.repeat(64) },
    { ...p, operations: [] },
    { ...p, operations: [{ kind: 'socket', socketIndex: 1, augmentId }] },
    { ...p, initialState: { ...p.initialState, baseId: 'Adherent Cuffs' } },
  ])
    expect(loadTargetWorkbenchProject(JSON.stringify(bad), catalog).ok).toBe(false)
})

it('能力声明检查不执行访问器，循环结构可终止；未执行指引也检查固定元数据', () => {
  const object: Record<string, unknown> = {}
  object.self = object
  Object.defineProperty(object, 'augmentId', {
    enumerable: true,
    get: () => {
      throw Error('不能调用访问器')
    },
  })
  expect(requiresDestructionRuneProjectVersion(object)).toBe(false)
  object.rules = [{ action: { kind: 'socket', augmentId } }]
  expect(requiresDestructionRuneProjectVersion(object)).toBe(true)
  const bad = structuredClone(catalog)
  bad.scalability = {
    ...bad.scalability,
    'Can roll Destruction modifiers': [{ scalable: true, formats: [] }],
  }
  const input = {
    ...project(),
    augmentSourceHash,
    scalabilitySourceHash: statScalabilitySourceHash(catalog),
    strategy: {
      maxSteps: 1,
      rules: [
        {
          conditions: [{ kind: 'always' }],
          action: { kind: 'socket', socketIndex: 'first-empty', augmentId },
        },
      ],
    },
  }
  expect(loadTargetWorkbenchProject(JSON.stringify(input), bad).ok).toBe(false)
})
it('沿用未执行符文指引升级到v94，旧指引不会降级新项目', () => {
  const template = {
    ...project(),
    augmentSourceHash,
    scalabilitySourceHash: statScalabilitySourceHash(catalog),
    strategy: {
      maxSteps: 4,
      rules: [
        {
          conditions: [{ kind: 'always' }],
          action: { kind: 'socket', socketIndex: 'first-empty', augmentId },
        },
      ],
    },
  }
  const old = { ...project(), rulesVersion: 'basic-2026-09-17-v92' }
  const reused = must(reuseTargetCraftPlan(JSON.stringify(old), JSON.stringify(template), catalog))
  expect(reused.project.rulesVersion).toBe(version)
  expect(reused.project.augmentSourceHash).toBe(augmentSourceHash)
  expect(
    must(
      reuseTargetCraftPlan(
        JSON.stringify(reused.project),
        JSON.stringify({
          ...old,
          strategy: {
            maxSteps: 1,
            rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
          },
        }),
        catalog,
      ),
    ).project.rulesVersion,
  ).toBe(version)
})

it('v93 判别保持旧五类语义，不将毁灭能力视作旧能力', () => {
  expect(requiresInfluenceRuneProjectVersion(future())).toBe(false)
  expect(
    requiresInfluenceRuneProjectVersion({ pricing: { prices: { "augment:Thrud's Might": 1 } } }),
  ).toBe(false)
})
it('v94 未执行声明同样固定核对全部九条毁灭身份与两类符文', () => {
  const input = {
    ...project(),
    augmentSourceHash,
    scalabilitySourceHash: statScalabilitySourceHash(catalog),
    pricing: { unit: 'divine', prices: { "augment:Thrud's Might": 1 } },
  }
  expect(destructionRuneProjectCapabilityError(input, catalog)).toBeNull()
  for (const mod of catalog.modifiers.filter((entry) =>
    entry.id.startsWith('DestructionInfluence'),
  )) {
    const bad = structuredClone(catalog)
    const changed = bad.modifiers.find((entry) => entry.id === mod.id)
    if (changed) changed.level++
    expect(destructionRuneProjectCapabilityError(input, bad), mod.id).not.toBeNull()
  }
  for (const category of ['weapon', 'caster']) {
    const bad = structuredClone(catalog)
    const augment = bad.augments?.find(
      (entry) => entry.id === `pob2:augment:${JSON.stringify(["Thrud's Might", category])}`,
    )
    if (!augment) throw Error('缺少毁灭符文')
    augment.limit = 2
    expect(destructionRuneProjectCapabilityError(input, bad)).not.toBeNull()
  }
  for (const key of ['augmentSourceHash', 'scalabilitySourceHash'] as const) {
    expect(
      destructionRuneProjectCapabilityError({ ...input, [key]: undefined }, catalog),
    ).not.toBeNull()
  }
})
it('空 v94 沿用旧方案仍保留规则版本', () => {
  const old = {
    ...project(),
    rulesVersion: 'basic-2026-09-17-v93',
    strategy: {
      maxSteps: 1,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  expect(
    must(reuseTargetCraftPlan(JSON.stringify(project()), JSON.stringify(old), catalog)).project
      .rulesVersion,
  ).toBe(version)
})

it('仅镶嵌 Thrud 尚无毁灭词缀时也持久化两种来源指纹', () => {
  const input = {
    ...future(),
    operations: [{ kind: 'socket', socketIndex: 0, augmentId }],
    cursor: 1,
    targetDefinitions: project().targetDefinitions,
  }
  const restored = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
  expect(restored.states.at(-1)?.affixes).toEqual([])
  expect(restored.project.scalabilitySourceHash).toBe(statScalabilitySourceHash(catalog))
  expect(restored.project.augmentSourceHash).toBe(augmentSourceHash)
  expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(input)
  const missing = { ...input, scalabilitySourceHash: undefined }
  expect(loadTargetWorkbenchProject(JSON.stringify(missing), catalog).ok).toBe(false)
})
