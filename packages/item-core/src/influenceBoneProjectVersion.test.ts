import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { desecrationCandidates } from './boneCraft'
import type { CraftCatalog } from './catalog'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { fluxCatalogSignature } from './fluxes'
import {
  influenceBoneProjectCapabilityError,
  requiresInfluenceBoneProjectVersion,
} from './influenceBoneProjectVersion'
import { inspectNumericLines } from './numeric'
import {
  type CraftResult,
  type CraftState,
  craftCandidates,
  prepareCraftOperation,
} from './rehearsal'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const rune = `pob2:augment:["Uhtred's Sidereus","boots"]`
const bone = { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'prefix' }
const socket = { kind: 'socket', socketIndex: 0, augmentId: rune }
const version = 'basic-2026-09-17-v95'
function project() {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: version,
    initialState: {
      baseId: 'Rawhide Boots',
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
it('版本扫描按历史来源顺序，不将先揭示后镶嵌的旧能力升级', () => {
  expect(requiresInfluenceBoneProjectVersion({ operations: [socket, bone], cursor: 0 })).toBe(true)
  expect(
    requiresInfluenceBoneProjectVersion({
      operations: [bone, { kind: 'desecration-reveal', modId: 'MovementVelocity1' }, socket],
    }),
  ).toBe(false)
  expect(
    requiresInfluenceBoneProjectVersion({
      initialState: { sockets: [rune], pendingDesecration: {} },
    }),
  ).toBe(true)
  expect(
    requiresInfluenceBoneProjectVersion({
      initialState: { affixes: [{ modId: 'TimeInfluenceCooldownRecovery', desecrated: true }] },
    }),
  ).toBe(true)
  expect(
    requiresInfluenceBoneProjectVersion({
      initialState: { sockets: [rune] },
      strategy: { rules: [{ action: bone }] },
    }),
  ).toBe(true)
})
it('v95 空项目保留版本；旧方案复用不降级', () => {
  const input = project()
  const restored = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  if (!restored.ok) throw Error(restored.error)
  const saved = serializeTargetCraftProject(restored.value.project, catalog)
  if (!saved.ok) throw Error(saved.error)
  expect(JSON.parse(saved.value)).toEqual(input)
  const old = {
    ...input,
    rulesVersion: 'basic-2026-09-17-v94',
    strategy: {
      maxSteps: 1,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  const reused = reuseTargetCraftPlan(JSON.stringify(input), JSON.stringify(old), catalog)
  if (!reused.ok) throw Error(reused.error)
  expect(reused.value.project.rulesVersion).toBe(version)
})
it('v2–v94 在回放之前拒绝未来符文骨骼能力', () => {
  const real = { ...catalog, fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) }
  for (let n = 2; n <= 94; n++) {
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
    expect(read(JSON.stringify({ ...input, operations: [socket, bone] }), real)).toMatchObject({
      ok: false,
      error: expect.stringContaining('v95'),
    })
  }
})
it('符文骨骼声明需要两份精确来源，且不读取访问器', () => {
  const input = {
    ...project(),
    operations: [socket, bone],
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    desecrationSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModVeiled.lua')
      ?.sha256,
  }
  expect(influenceBoneProjectCapabilityError(input, catalog)).toBeNull()
  expect(
    influenceBoneProjectCapabilityError({ ...input, desecrationSourceHash: undefined }, catalog),
  ).not.toBeNull()
  expect(
    influenceBoneProjectCapabilityError({ ...input, augmentSourceHash: undefined }, catalog),
  ).not.toBeNull()
  expect(
    requiresInfluenceBoneProjectVersion({
      get initialState() {
        throw Error('不能执行访问器')
      },
    }),
  ).toBe(false)
})

function sourceHashes() {
  return {
    augmentSourceHash: catalog._meta.sources.find(
      (source) => source.path === 'src/Data/ModRunes.lua',
    )?.sha256,
    desecrationSourceHash: catalog._meta.sources.find(
      (source) => source.path === 'src/Data/ModVeiled.lua',
    )?.sha256,
  }
}
function ordinaryHistory() {
  const initial: CraftState = { ...project().initialState, rarity: 'normal', sockets: [null] }
  let state = initial
  const operations: CraftStep[] = []
  const states = [initial]
  const run = (step: CraftStep) => {
    state = must(applyCraftStep(catalog, state, step))
    operations.push(step)
    states.push(state)
  }
  for (const currency of ['transmutation', 'regal'] as const) {
    const prepared = must(prepareCraftOperation(catalog, state, currency))
    const mod = craftCandidates(catalog, prepared.state, currency).find(
      (entry) => !entry.id.includes('Influence'),
    )
    if (!mod) throw Error('缺少普通候选')
    run({
      currency,
      modIds: [mod.id],
      rolls: [
        {
          modId: mod.id,
          affixId: `a${state.nextAffixId}`,
          values: must(inspectNumericLines(mod.lines)).map((slot) => slot.min),
        },
      ],
    })
  }
  return { initial, operations, states, run, current: () => state }
}

it.each(['basic-2026-09-17-v93', 'basic-2026-09-17-v94'])(
  '%s 的骨骼揭示后镶嵌历史在所有游标保持旧版语义',
  (rulesVersion) => {
    const history = ordinaryHistory()
    history.run({ kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'prefix' })
    const pool = desecrationCandidates(catalog, history.current())
    const selected = pool[0]
    if (!selected || pool.length < 3) throw Error('缺少普通揭示候选')
    history.run({ kind: 'desecration-offer', modIds: pool.slice(0, 3).map((mod) => mod.id) })
    history.run({
      kind: 'desecration-reveal',
      modId: selected.id,
      values: must(inspectNumericLines(selected.lines)).map((slot) => slot.min),
    })
    history.run({ kind: 'socket', socketIndex: 0, augmentId: rune })
    const input = {
      ...project(),
      rulesVersion,
      initialState: history.initial,
      operations: history.operations,
      ...sourceHashes(),
    }
    expect(requiresInfluenceBoneProjectVersion(input)).toBe(false)
    for (let cursor = 0; cursor <= history.operations.length; cursor++) {
      const restored = must(
        loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog),
      )
      expect(restored.project.rulesVersion).toBe(rulesVersion)
      expect(restored.project.cursor).toBe(cursor)
      expect(restored.states).toEqual(history.states)
      const roundTrip = must(
        loadTargetWorkbenchProject(
          must(serializeTargetCraftProject(restored.project, catalog)),
          catalog,
        ),
      )
      expect(roundTrip).toEqual(restored)
    }
  },
)

it('v94 符文项目复用旧版骨骼指引升级至 v95 并保留两份来源指纹', () => {
  const history = ordinaryHistory()
  const template = {
    ...project(),
    rulesVersion: 'basic-2026-09-17-v94',
    initialState: history.initial,
    operations: [...history.operations],
    cursor: history.operations.length,
    ...sourceHashes(),
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
  history.run({ kind: 'socket', socketIndex: 0, augmentId: rune })
  const current = {
    ...project(),
    rulesVersion: 'basic-2026-09-17-v94',
    initialState: history.initial,
    operations: history.operations,
    cursor: history.operations.length,
    augmentSourceHash: sourceHashes().augmentSourceHash,
  }
  expect(requiresInfluenceBoneProjectVersion(template)).toBe(false)
  expect(requiresInfluenceBoneProjectVersion(current)).toBe(false)
  const reused = must(
    reuseTargetCraftPlan(JSON.stringify(current), JSON.stringify(template), catalog),
  )
  expect(reused.project.rulesVersion).toBe(version)
  expect(reused.project).toMatchObject(sourceHashes())
  expect(reused.project.strategy).toEqual(template.strategy)
  expect(reused.states).toEqual(history.states)
  const restored = must(
    loadTargetWorkbenchProject(must(serializeTargetCraftProject(reused.project, catalog)), catalog),
  )
  expect(restored.project).toEqual(reused.project)
  expect(restored.states).toEqual(history.states)
})
