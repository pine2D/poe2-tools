import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { desecrationCandidates } from './boneCraft'
import type { CraftCatalog } from './catalog'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { applyCraftStep, type CraftStep } from './craftSteps'
import {
  extendedInfluenceBoneProjectCapabilityError,
  requiresExtendedInfluenceBoneProjectVersion,
} from './extendedInfluenceBoneProjectVersion'
import { fluxCatalogSignature } from './fluxes'
import { inspectNumericLines } from './numeric'
import {
  type CraftResult,
  type CraftState,
  craftCandidates,
  prepareCraftOperation,
} from './rehearsal'
import { statScalabilitySourceHash } from './statScalability'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const rune = `pob2:augment:["Vorana's Carnage","helmet"]`
const bone = { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'prefix' }
const socket = { kind: 'socket', socketIndex: 0, augmentId: rune }
const version = 'basic-2026-09-17-v96'
function project() {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: version,
    initialState: {
      baseId: 'Armoured Cap',
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
  expect(
    requiresExtendedInfluenceBoneProjectVersion({ operations: [socket, bone], cursor: 0 }),
  ).toBe(true)
  expect(
    requiresExtendedInfluenceBoneProjectVersion({
      operations: [bone, { kind: 'desecration-reveal', modId: 'MovementVelocity1' }, socket],
    }),
  ).toBe(false)
  expect(
    requiresExtendedInfluenceBoneProjectVersion({
      initialState: { sockets: [rune], pendingDesecration: {} },
    }),
  ).toBe(true)
  expect(
    requiresExtendedInfluenceBoneProjectVersion({
      initialState: { affixes: [{ modId: 'BerserkInfluenceRageOnHit', desecrated: true }] },
    }),
  ).toBe(true)
  expect(
    requiresExtendedInfluenceBoneProjectVersion({
      initialState: { sockets: [rune] },
      strategy: { rules: [{ action: bone }] },
    }),
  ).toBe(true)
})
it('v96 空项目保留版本；旧方案复用不降级', () => {
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
it('v2–v95 在回放之前拒绝未来符文骨骼能力', () => {
  const real = { ...catalog, fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) }
  for (let n = 2; n <= 95; n++) {
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
    for (const [name, category, prefix] of [
      ["Medved's Tending", 'body armour', 'Soul'],
      ["Katla's Gloom", 'gloves', 'Decay'],
      ["Vorana's Carnage", 'helmet', 'Berserk'],
    ]) {
      const id = `pob2:augment:${JSON.stringify([name, category])}`
      for (const patch of [
        { operations: [{ kind: 'socket', socketIndex: 0, augmentId: id }, bone] },
        {
          initialState: {
            ...input.initialState,
            sockets: [id],
            pendingDesecration: { putrefaction: { prefix: 3, suffix: 3 } },
          },
        },
        {
          initialState: {
            ...input.initialState,
            affixes: [{ modId: `${prefix}InfluenceExample`, desecrated: true }],
          },
        },
        {
          initialState: { ...input.initialState, sockets: [id] },
          strategy: { rules: [{ action: { nested: { kind: 'desecrate' } } }] },
        },
      ])
        expect(read(JSON.stringify({ ...input, ...patch }), real)).toMatchObject({
          ok: false,
          error: expect.stringContaining('v96'),
        })
    }
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
  expect(extendedInfluenceBoneProjectCapabilityError(input, catalog)).toBeNull()
  expect(
    extendedInfluenceBoneProjectCapabilityError(
      { ...input, desecrationSourceHash: undefined },
      catalog,
    ),
  ).not.toBeNull()
  expect(
    extendedInfluenceBoneProjectCapabilityError(
      { ...input, augmentSourceHash: undefined },
      catalog,
    ),
  ).not.toBeNull()
  expect(
    requiresExtendedInfluenceBoneProjectVersion({
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
function ordinaryHistory(baseId = 'Armoured Cap') {
  const initial: CraftState = {
    ...project().initialState,
    baseId,
    rarity: 'normal',
    sockets: [null],
  }
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
      (entry) =>
        !entry.id.includes('Influence') && must(inspectNumericLines(entry.lines)).length > 0,
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
    expect(requiresExtendedInfluenceBoneProjectVersion(input)).toBe(false)
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

it('v94 符文项目复用旧版骨骼指引升级至 v96 并保留两份来源指纹', () => {
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
  expect(requiresExtendedInfluenceBoneProjectVersion(template)).toBe(false)
  expect(requiresExtendedInfluenceBoneProjectVersion(current)).toBe(false)
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

it.each([
  ["Medved's Tending", 'body armour', 'Abyssal Cuirass', 'Soul'],
  ["Katla's Gloom", 'gloves', 'Adherent Cuffs', 'Decay'],
  ["Vorana's Carnage", 'helmet', 'Armoured Cap', 'Berserk'],
])('%s 的真实骨骼历史全部游标可恢复，旧版不能夹带起点或未来', (name, category, baseId, prefix) => {
  const history = ordinaryHistory(baseId)
  history.run({
    kind: 'socket',
    socketIndex: 0,
    augmentId: `pob2:augment:${JSON.stringify([name, category])}`,
  })
  history.run({ kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'prefix' })
  const pool = desecrationCandidates(catalog, history.current())
  const selected = pool.find((mod) => mod.id.startsWith(`${prefix}Influence`))
  if (!selected) throw Error('缺少新来源候选')
  history.run({
    kind: 'desecration-offer',
    modIds: [
      selected.id,
      ...pool
        .filter((mod) => mod.id !== selected.id)
        .slice(0, 2)
        .map((mod) => mod.id),
    ],
  })
  history.run({
    kind: 'desecration-reveal',
    modId: selected.id,
    values: must(inspectNumericLines(selected.lines)).map((slot) => slot.min),
  })
  const input = {
    ...project(),
    initialState: history.initial,
    operations: history.operations,
    ...sourceHashes(),
  }
  for (let cursor = 0; cursor <= history.operations.length; cursor++) {
    const restored = must(loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog))
    expect(restored.states).toEqual(history.states)
    expect(
      must(
        loadTargetWorkbenchProject(
          must(serializeTargetCraftProject(restored.project, catalog)),
          catalog,
        ),
      ),
    ).toEqual(restored)
  }
  for (const initialState of [history.states[history.states.length - 2], history.current()]) {
    expect(
      parseTargetCraftProject(
        JSON.stringify({
          ...project(),
          rulesVersion: 'basic-2026-09-17-v95',
          initialState,
          ...sourceHashes(),
        }),
        catalog,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('v96') })
  }
})

it.each(Array.from({ length: 17 }, (_, cursor) => cursor))(
  '真实 Vorana 腐烂六槽游标 %s 往返；最终普通腐化词缀不虚构腐烂历史',
  (cursor) => {
    const history = ordinaryHistory()
    history.run({ ...socket, kind: 'socket' })
    history.run({ kind: 'putrefy', boneId: 'preserved_rib' })
    expect(history.current().pendingDesecration?.putrefaction).toEqual({ prefix: 3, suffix: 3 })
    while (history.current().pendingDesecration) {
      const pool = desecrationCandidates(catalog, history.current())
      const selected = pool.find((mod) => mod.id.startsWith('BerserkInfluence')) ?? pool[0]
      if (!selected) throw Error('缺少腐烂候选')
      const options = [selected, ...pool.filter((mod) => mod.id !== selected.id).slice(0, 2)]
      history.run({ kind: 'desecration-offer', modIds: options.map((mod) => mod.id) })
      history.run({
        kind: 'desecration-reveal',
        modId: selected.id,
        values: must(inspectNumericLines(selected.lines)).map((slot) => slot.min),
      })
    }
    expect(
      history.current().affixes.some((affix) => affix.modId.startsWith('BerserkInfluence')),
    ).toBe(true)
    expect(history.current().affixes.every((affix) => !affix.desecrated)).toBe(true)
    const input = {
      ...project(),
      initialState: history.initial,
      operations: history.operations,
      ...sourceHashes(),
    }
    {
      const restored = must(
        loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog),
      )
      expect(restored.states).toEqual(history.states)
      expect(
        must(
          loadTargetWorkbenchProject(
            must(serializeTargetCraftProject(restored.project, catalog)),
            catalog,
          ),
        ),
      ).toEqual(restored)
    }
    expect(requiresExtendedInfluenceBoneProjectVersion({ initialState: history.current() })).toBe(
      false,
    )
    const legacy = {
      ...project(),
      rulesVersion: 'basic-2026-09-17-v95',
      initialState: {
        ...history.current(),
        affixes: history
          .current()
          .affixes.map((affix, index) => ({ ...affix, affixId: `a${index + 1}` })),
        nextAffixId: history.current().affixes.length + 1,
      },
      augmentSourceHash: sourceHashes().augmentSourceHash,
    }
    expect(parseTargetCraftProject(JSON.stringify(legacy), catalog)).toMatchObject({
      ok: false,
      error: expect.stringContaining('搜索起点不能预装腐化'),
    })
  },
)

it('三族来源、嵌套未执行指引与访问器边界', () => {
  for (const [name, category, label, prefix] of [
    ["Medved's Tending", 'body armour', 'Soul', 'Soul'],
    ["Katla's Gloom", 'gloves', 'Decay', 'Decay'],
    ["Vorana's Carnage", 'helmet', 'Berserking', 'Berserk'],
  ]) {
    const id = `pob2:augment:${JSON.stringify([name, category])}`
    for (const input of [
      {
        initialState: {
          sockets: [id],
          pendingDesecration: { putrefaction: { prefix: 3, suffix: 3 } },
        },
      },
      { initialState: { affixes: [{ modId: `${prefix}InfluenceExample`, desecrated: true }] } },
      {
        importedSockets: [{ lines: [`Can roll ${label} modifiers`] }],
        strategy: { rules: [{ action: { nested: { kind: 'putrefy' } } }] },
      },
      { operations: [{ kind: 'socket', augmentId: id }, bone], cursor: 0 },
    ])
      expect(requiresExtendedInfluenceBoneProjectVersion(input)).toBe(true)
  }
  expect(
    requiresExtendedInfluenceBoneProjectVersion({
      operations: [
        {
          kind: 'socket',
          get augmentId() {
            throw Error('不能读取访问器')
          },
        },
      ],
      strategy: {
        get action() {
          throw Error('不能读取访问器')
        },
      },
    }),
  ).toBe(false)
  expect(
    extendedInfluenceBoneProjectCapabilityError(
      {
        ...project(),
        operations: [socket, bone],
        ...sourceHashes(),
        desecrationSourceHash: 'changed',
      },
      catalog,
    ),
  ).not.toBeNull()
})

it('v96 继续继承 Thrud 骨骼与 v94 缩放来源要求', () => {
  const history = ordinaryHistory('Crude Bow')
  history.run({
    kind: 'socket',
    socketIndex: 0,
    augmentId: `pob2:augment:["Thrud's Might","weapon"]`,
  })
  history.run({ kind: 'desecrate', boneId: 'preserved_jawbone', affixKind: 'prefix' })
  const input = {
    ...project(),
    initialState: history.initial,
    operations: history.operations,
    cursor: history.operations.length,
    ...sourceHashes(),
  }
  expect(parseTargetCraftProject(JSON.stringify(input), catalog)).toMatchObject({
    ok: false,
    error: expect.stringContaining('缩放来源'),
  })
  const scalabilitySourceHash = statScalabilitySourceHash(catalog)
  const restored = must(
    loadTargetWorkbenchProject(JSON.stringify({ ...input, scalabilitySourceHash }), catalog),
  )
  expect(restored.states).toEqual(history.states)
  expect(restored.project.rulesVersion).toBe(version)
})
