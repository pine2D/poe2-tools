import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import { requiresInfluenceRuneProjectVersion } from './influenceRuneProjectVersion'
import type { CraftResult } from './rehearsal'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const augmentId = 'pob2:augment:["Medved\'s Tending","body armour"]'
const modId = 'SoulInfluenceIncreasedLifeAndMana'
const version = 'basic-2026-09-17-v93'
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
      baseId: "Adherent's Raiment",
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
    initialState: { ...project().initialState, sockets: [null] },
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId },
      {
        currency: 'transmutation',
        modIds: [modId],
        rolls: [{ modId, affixId: 'a1', values: [50, 60] }],
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
it('v93 空白项目保留版本，完整未来来源与目标可在每个游标保存恢复', () => {
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
  for (let n = 2; n <= 92; n++) {
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
      { pricing: { unit: 'divine', prices: { "augment:Medved's Tending": 1 } } },
      {
        strategy: {
          rules: [{ action: { kind: 'socket', socketIndex: 'first-empty', augmentId } }],
        },
      },
    ])
      expect(read(JSON.stringify({ ...input, ...extra }), real), `v${n}`).toMatchObject({
        ok: false,
        error: expect.stringContaining('v93'),
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
  expect(requiresInfluenceRuneProjectVersion(object)).toBe(false)
  object.rules = [{ action: { kind: 'socket', augmentId } }]
  expect(requiresInfluenceRuneProjectVersion(object)).toBe(true)
  const bad = structuredClone(catalog)
  bad.scalability = {
    ...bad.scalability,
    'Can roll Soul modifiers': [{ scalable: true, formats: [] }],
  }
  const input = {
    ...project(),
    augmentSourceHash,
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
it('沿用未执行符文指引升级到v93，旧指引不会降级新项目', () => {
  const template = {
    ...project(),
    augmentSourceHash,
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
