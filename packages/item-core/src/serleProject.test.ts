import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import type { CraftResult } from './rehearsal'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const serleId = 'pob2:augment:["Serle\'s Triumph","armour"]'
const version = 'basic-2026-09-16-v88'
const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function present<T>(value: T | undefined): T {
  if (value === undefined) throw Error('测试目录缺少预期条目')
  return value
}
function project() {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: version,
    initialState: {
      baseId: 'Adherent Cuffs',
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
it('v88 空白项目可无可选目录恢复', () => {
  const restored = must(loadTargetWorkbenchProject(JSON.stringify(project()), catalog))
  expect(restored.project).toEqual(project())
  expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(
    project(),
  )
})
it('v2–v87 均拒绝未来 Serle 容量符文、未执行嵌套指引和仅报价', () => {
  const real = { ...catalog, fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) }
  for (let n = 2; n <= 87; n++) {
    const { targetDefinitions, orphanedTargets, ...base } = project()
    const { nextAffixId: _, ...legacyState } = base.initialState
    const input = {
      ...base,
      rulesVersion: `basic-2026-09-${n >= 76 ? '16' : '12'}-v${n}`,
      initialState: n >= 73 ? base.initialState : legacyState,
      ...(n >= 74 ? { targetDefinitions, orphanedTargets } : {}),
      ...(n === 75 ? { fluxCatalogSignature: fluxCatalogSignature(real) } : {}),
    }
    const read =
      n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
    expect(read(JSON.stringify(input), real).ok, `v${n}基线`).toBe(true)
    for (const extra of [
      { operations: [{ kind: 'socket', socketIndex: 0, augmentId: serleId }] },
      { importedSockets: [serleId] },
      { initialState: { ...input.initialState, sockets: [serleId] } },
      {
        strategy: {
          flow: { stages: [{ action: { kind: 'socket', socketIndex: 0, augmentId: serleId } }] },
        },
      },
      { pricing: { unit: 'divine', prices: { "augment:Serle's Triumph": 1 } } },
      ...[
        { kind: 'affix-count', min: 7 },
        { kind: 'open-suffix', min: 4 },
      ].map((condition) => ({
        strategy: {
          maxSteps: 10,
          rules: [{ conditions: [{ kind: 'not', condition }], action: { kind: 'stop' } }],
        },
      })),
    ])
      expect(read(JSON.stringify({ ...input, ...extra }), real), `v${n}`).toMatchObject({
        ok: false,
        error: expect.stringContaining('v88'),
      })
  }
})

it('v87 不能通过删去 Serle 孔位夹带普通装备第四后缀或七组词缀', () => {
  const suffix = present(catalog.modifiers.find((m) => m.kind === 'suffix' && !m.jewelOnly))
  for (const affixes of [
    Array.from({ length: 4 }, () => ({ modId: suffix.id })),
    Array.from({ length: 7 }, () => ({ modId: 'unknown' })),
  ]) {
    expect(
      parseTargetCraftProject(
        JSON.stringify({
          ...project(),
          rulesVersion: 'basic-2026-09-16-v87',
          initialState: { ...project().initialState, affixes },
        }),
        catalog,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('v88') })
  }
})

const augmentSourceHash = catalog._meta.sources.find(
  (s) => s.path === 'src/Data/ModRunes.lua',
)?.sha256
function importedState(state: CraftState) {
  const dictionary = createCraftItemDictionary(catalog)
  const text = must(exportCraftItemText(catalog, state, { locale: 'en', dictionary })).text
  const parsed = parseItem(text)
  if (!parsed.ok) throw Error(parsed.error)
  return must(
    importIdentifiedCraftState(
      catalog,
      state.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      state.sockets,
    ),
  )
}
function socketProject() {
  return {
    ...project(),
    augmentSourceHash,
    initialState: importedState({
      ...project().initialState,
      rarity: 'rare',
      sockets: [null],
      quality: 20,
    }),
    importedSockets: [null],
    operations: [{ kind: 'socket', socketIndex: 0, augmentId: serleId }],
    pricing: { unit: 'divine', prices: { "augment:Serle's Triumph": 2 } },
  }
}
it('v88保留完整未来镶嵌历史、每个游标及报价', () => {
  for (const cursor of [0, 1]) {
    const input = { ...socketProject(), cursor }
    const restored = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
    expect(restored.project).toEqual(input)
    expect(restored.states.map((s) => s.sockets)).toEqual([[null], [serleId]])
    expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(input)
  }
})

it('沿用新指引升至v88；沿用旧指引不降级、不截断未来、不覆盖报价', () => {
  const strategy = {
    maxSteps: 4,
    rules: [
      {
        conditions: [{ kind: 'always' }],
        action: { kind: 'socket', socketIndex: 'first-empty', augmentId: serleId },
      },
    ],
  }
  const template = { ...socketProject(), operations: [], strategy }
  const old = {
    ...socketProject(),
    rulesVersion: 'basic-2026-09-16-v85',
    operations: [],
    pricing: undefined,
  }
  const next = must(reuseTargetCraftPlan(JSON.stringify(old), JSON.stringify(template), catalog))
  expect(next.project.rulesVersion).toBe(version)
  const oldTemplate = {
    ...old,
    strategy: {
      maxSteps: 4,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  for (const current of [socketProject(), { ...project(), rulesVersion: version }]) {
    const kept = must(
      reuseTargetCraftPlan(JSON.stringify(current), JSON.stringify(oldTemplate), catalog),
    )
    expect(kept.project.rulesVersion).toBe(version)
    expect(kept.project.operations).toEqual(current.operations)
    expect(kept.project.cursor).toBe(current.cursor)
    expect(kept.project.pricing).toEqual('pricing' in current ? current.pricing : undefined)
  }
})

import { enableCraftAffixIdentity } from './affixIdentity'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { inspectItem } from './export'
import { inspectNumericLines } from './numeric'
import { parseItem } from './parse'
import { addCraftAffix, type CraftState, craftCandidates } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { requiresSerleProjectVersion } from './serleProjectVersion'

it('七组已核对起点及神圣操作保留全部数值与实例，完整未来逐游标恢复', () => {
  let state: CraftState = {
    baseId: 'Twig Focus',
    itemLevel: 86,
    rarity: 'rare',
    affixes: [],
    sourceText: null,
    sockets: [serleId],
  }
  for (const kind of ['prefix', 'prefix', 'prefix', 'suffix', 'suffix', 'suffix', 'suffix']) {
    const mod = present(
      craftCandidates(catalog, state).find(
        (m) => m.kind === kind && inspectNumericLines(m.lines).ok,
      ),
    )
    state = must(addCraftAffix(catalog, state, mod.id))
  }
  const initialState = importedState(must(enableCraftAffixIdentity(catalog, state)))
  const rolls = initialState.affixes.map((a) => ({
    modId: a.modId,
    affixId: a.affixId,
    values: must(
      inspectNumericLines(present(catalog.modifiers.find((m) => m.id === a.modId)).lines),
    ).map((r) => r.min),
  }))
  expect(rolls).toHaveLength(7)
  for (const cursor of [0, 1]) {
    const input = {
      ...project(),
      augmentSourceHash,
      initialState,
      importedSockets: state.sockets,
      operations: [{ currency: 'divine', modIds: [], rolls }],
      cursor,
    }
    const result = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
    expect(result.states).toHaveLength(2)
    expect(result.states[1]?.affixes).toHaveLength(7)
    expect(JSON.parse(must(serializeTargetCraftProject(result.project, catalog)))).toEqual(input)
    expect(
      loadTargetWorkbenchProject(
        JSON.stringify({ ...input, initialState: { ...initialState, sockets: [null] } }),
        catalog,
      ).ok,
    ).toBe(false)
  }
})

it('珠宝已有容量不会误标为Serle，文本和访问器不作为能力声明', () => {
  const jewel = present(catalog.bases.find((base) => base.type === 'Jewel'))
  const suffix = present(catalog.modifiers.find((m) => m.kind === 'suffix'))
  const affixes = Array.from({ length: 5 }, () => ({ modId: suffix.id }))
  expect(
    requiresSerleProjectVersion({ initialState: { baseId: jewel.id, affixes } }, catalog),
  ).toBe(false)
  expect(
    requiresSerleProjectVersion({ sourceText: JSON.stringify(socketProject()) }, catalog),
  ).toBe(false)
  const input: Record<string, unknown> = {}
  Object.defineProperty(input, 'sockets', {
    get() {
      throw Error('访问器不可执行')
    },
  })
  input.self = input
  expect(requiresSerleProjectVersion(input, catalog)).toBe(false)
  for (const category of ['weapon', 'armour', 'caster'])
    for (const key of ['initialState', 'currentState', 'future'])
      expect(
        requiresSerleProjectVersion(
          { [key]: { sockets: [`pob2:augment:["Serle's Triumph","${category}"]`] } },
          catalog,
        ),
      ).toBe(true)
})

it('v88来源指纹与隐藏声明不能缺失或篡改', () => {
  const { augmentSourceHash: _, ...unsigned } = socketProject()
  for (const input of [unsigned, { ...unsigned, augmentSourceHash: 'tampered' }])
    expect(loadTargetWorkbenchProject(JSON.stringify(input), catalog)).toMatchObject({
      ok: false,
      error: expect.stringContaining('来源指纹'),
    })
  const changed = structuredClone(catalog)
  const augment = present(changed.augments?.find((a) => a.id === serleId))
  delete augment.tradeHashes['1950607759']
  expect(loadTargetWorkbenchProject(JSON.stringify(socketProject()), changed).ok).toBe(false)
})

import { runeforgingCatalogSignature } from './runeforgingCatalog'

it('v88锻造共存继续要求完整签名，目录变化拒绝', () => {
  const loaded = {
    ...catalog,
    runeforging: JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8')),
  }
  const input = {
    ...socketProject(),
    runeforgingCatalogSignature: runeforgingCatalogSignature(loaded),
    operations: [
      { kind: 'runeforge', fromBaseId: 'Adherent Cuffs', toBaseId: 'Runeforged Adherent Cuffs' },
      ...socketProject().operations,
    ],
  }
  must(loadTargetWorkbenchProject(JSON.stringify(input), loaded))
  for (const extra of [
    { operations: input.operations },
    { operations: [], pricing: { unit: 'divine', prices: { 'currency:verisium': 1 } } },
    {
      operations: [],
      strategy: {
        maxSteps: 4,
        rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'runeforge' } }],
      },
    },
  ]) {
    const signed = { ...input, ...extra }
    must(loadTargetWorkbenchProject(JSON.stringify(signed), loaded))
    const { runeforgingCatalogSignature: _, ...unsigned } = signed
    expect(loadTargetWorkbenchProject(JSON.stringify(unsigned), loaded)).toMatchObject({
      ok: false,
      error: expect.stringContaining('签名'),
    })
  }
  const changed = structuredClone(loaded)
  changed.runeforging._meta.reviewedAt = '2026-09-17'
  expect(loadTargetWorkbenchProject(JSON.stringify(input), changed).ok).toBe(false)
  expect(loadTargetWorkbenchProject(JSON.stringify(input), catalog).ok).toBe(false)
})

it('v88接收v85锻造指引保留v88并补齐完整签名', () => {
  const loaded = {
    ...catalog,
    runeforging: JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8')),
  }
  const source = {
    ...project(),
    rulesVersion: 'basic-2026-09-16-v85',
    runeforgingCatalogSignature: runeforgingCatalogSignature(loaded),
    strategy: {
      maxSteps: 4,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'runeforge' } }],
    },
  }
  const current = { ...socketProject(), cursor: 1 }
  const next = must(reuseTargetCraftPlan(JSON.stringify(current), JSON.stringify(source), loaded))
  expect(next.project.rulesVersion).toBe(version)
  expect(next.project.runeforgingCatalogSignature).toBe(source.runeforgingCatalogSignature)
  expect(next.project.operations).toEqual(current.operations)
  expect(next.project.cursor).toBe(1)
  expect(next.project.pricing).toEqual(current.pricing)
  expect(next.states).toHaveLength(2)
})

it('仅 Serle 报价及未执行嵌套指引保持 v88 和来源', () => {
  for (const extra of [
    { pricing: { unit: 'divine', prices: { "augment:Serle's Triumph": 3 } } },
    {
      strategy: {
        maxSteps: 4,
        rules: [
          {
            conditions: [{ kind: 'all', conditions: [{ kind: 'always' }] }],
            action: { kind: 'socket', socketIndex: 'first-empty', augmentId: serleId },
          },
        ],
      },
    },
  ]) {
    const input = { ...socketProject(), operations: [], ...extra }
    const restored = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
    expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(input)
  }
})

it('未来真实镶入 Serle 才能保留七组目标，撤销至起点仍可保存恢复', () => {
  let state: CraftState = {
    baseId: 'Twig Focus',
    itemLevel: 86,
    rarity: 'rare',
    affixes: [],
    sourceText: null,
    sockets: [serleId],
  }
  for (const kind of ['prefix', 'prefix', 'prefix', 'suffix', 'suffix', 'suffix', 'suffix']) {
    const mod = present(craftCandidates(catalog, state).find((m) => m.kind === kind))
    state = must(addCraftAffix(catalog, state, mod.id))
  }
  const targetDefinitions = {
    nextTargetId: 8,
    targets: state.affixes.map((a, i) => ({ modId: a.modId, targetId: `t${i + 1}` })),
    alternatives: [],
    values: [],
  }
  const initialState = importedState({ ...state, sockets: [null], affixes: [] })
  const input = { ...socketProject(), initialState, targetDefinitions, cursor: 0 }
  const restored = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
  expect(restored.states[1]?.sockets).toEqual([serleId])
  expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(input)
  expect(loadTargetWorkbenchProject(JSON.stringify({ ...input, operations: [] }), catalog).ok).toBe(
    false,
  )
})

it('锻造后的真实 Serle 基底授权七组目标，退回锻造前仍保留完整历史与签名', () => {
  const loaded = {
    ...catalog,
    runeforging: JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8')),
  }
  let state: CraftState = {
    baseId: 'Runeforged Adherent Cuffs',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    sockets: [serleId],
    affixes: [],
  }
  for (const kind of ['prefix', 'prefix', 'prefix', 'suffix', 'suffix', 'suffix', 'suffix']) {
    const mod = present(craftCandidates(loaded, state).find((m) => m.kind === kind))
    state = must(addCraftAffix(loaded, state, mod.id))
  }
  const input = {
    ...socketProject(),
    runeforgingCatalogSignature: runeforgingCatalogSignature(loaded),
    targetDefinitions: {
      nextTargetId: 8,
      targets: state.affixes.map((a, i) => ({ modId: a.modId, targetId: `t${i + 1}` })),
      alternatives: [],
      values: [],
    },
    operations: [
      { kind: 'runeforge', fromBaseId: 'Adherent Cuffs', toBaseId: state.baseId },
      ...socketProject().operations,
    ],
  }
  for (const cursor of [0, 1, 2]) {
    const original = { ...input, cursor }
    const restored = must(loadTargetWorkbenchProject(JSON.stringify(original), loaded))
    expect(restored.project.initialState.baseId).toBe('Adherent Cuffs')
    expect(restored.states[2]?.baseId).toBe('Runeforged Adherent Cuffs')
    expect(JSON.parse(must(serializeTargetCraftProject(restored.project, loaded)))).toEqual(
      original,
    )
  }
  const { runeforgingCatalogSignature: _, ...unsigned } = input
  expect(loadTargetWorkbenchProject(JSON.stringify(unsigned), loaded).ok).toBe(false)
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...input, operations: input.operations.slice(0, 1) }),
      loaded,
    ).ok,
  ).toBe(false)
})

it('七组主目标、备选或未执行引用需要v88，旧四后缀任选一不受影响', () => {
  const suffixes = catalog.modifiers.filter((m) => m.kind === 'suffix' && !m.jewelOnly).slice(0, 7)
  const targets = suffixes.map((m, i) => ({ targetId: `t${i + 1}`, modId: m.id }))
  for (const extra of [
    {
      targetDefinitions: {
        nextTargetId: 8,
        targets,
        alternatives: [],
        values: [],
        minimumTargetCount: 1,
      },
    },
    { targetModIds: suffixes.map((m) => m.id), minimumTargetCount: 1 },
    {
      targetDefinitions: {
        alternatives: targets.map((t) => ({ targetId: t.targetId, modIds: [t.modId] })),
      },
    },
    {
      strategy: {
        rules: [
          {
            conditions: [
              {
                kind: 'selected-targets',
                targetIds: targets.map((t) => t.targetId),
                min: 1,
                value: false,
              },
            ],
          },
        ],
      },
    },
    {
      strategy: {
        rules: [
          {
            conditions: [
              { kind: 'selected-targets', modIds: suffixes.map((m) => m.id), min: 1, value: false },
            ],
          },
        ],
      },
    },
  ]) {
    const input = { ...project(), ...extra, rulesVersion: 'basic-2026-09-16-v87' }
    expect(requiresSerleProjectVersion(input, catalog)).toBe(true)
    expect(loadTargetWorkbenchProject(JSON.stringify(input), catalog)).toMatchObject({
      ok: false,
      error: expect.stringContaining('v88'),
    })
  }
  expect(
    requiresSerleProjectVersion(
      { ...project(), targetDefinitions: { targets: targets.slice(0, 4), minimumTargetCount: 1 } },
      catalog,
    ),
  ).toBe(false)
})

it('真正仅报价与未执行指引也必须核对固定来源、项目指纹、隐藏声明和增效元数据', () => {
  for (const extra of [
    { pricing: { unit: 'divine', prices: { "augment:Serle's Triumph": 1 } } },
    {
      strategy: {
        maxSteps: 4,
        rules: [
          {
            conditions: [{ kind: 'always' }],
            action: { kind: 'socket', socketIndex: 'first-empty', augmentId: serleId },
          },
        ],
      },
    },
  ]) {
    const unsigned = { ...project(), ...extra }
    expect(loadTargetWorkbenchProject(JSON.stringify(unsigned), catalog).ok).toBe(false)
    const signed = { ...unsigned, augmentSourceHash }
    must(loadTargetWorkbenchProject(JSON.stringify(signed), catalog))
    const badHash = structuredClone(catalog)
    present(badHash._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')).sha256 =
      'a'.repeat(64)
    expect(
      loadTargetWorkbenchProject(
        JSON.stringify({ ...signed, augmentSourceHash: 'a'.repeat(64) }),
        badHash,
      ).ok,
    ).toBe(false)
    const badHidden = structuredClone(catalog)
    delete present(badHidden.augments?.find((a) => a.id === serleId)).tradeHashes['1950607759']
    expect(loadTargetWorkbenchProject(JSON.stringify(signed), badHidden).ok).toBe(false)
    expect(requiresSerleProjectVersion(signed, badHidden)).toBe(true)
    const badScale = structuredClone(catalog)
    present(badScale.scalability)['+1 Suffix Modifier allowed'] = [{ scalable: false, formats: [] }]
    expect(loadTargetWorkbenchProject(JSON.stringify(signed), badScale).ok).toBe(false)
  }
})

it('混合萃取保留实际摧毁终态，空目标与七组目标各游标均可恢复保存', () => {
  let state: CraftState = {
    baseId: 'Twig Focus',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    sockets: [serleId, 'pob2:augment:["Lesser Iron Rune","armour"]'],
    affixes: [],
  }
  for (const kind of ['prefix', 'prefix', 'prefix', 'suffix', 'suffix', 'suffix', 'suffix']) {
    const mod = present(craftCandidates(catalog, state).find((m) => m.kind === kind))
    state = must(addCraftAffix(catalog, state, mod.id))
  }
  const initialState = importedState(state)
  for (const targets of [
    [],
    state.affixes.map((a, i) => ({ modId: a.modId, targetId: `t${i + 1}` })),
  ]) {
    for (const cursor of [0, 1]) {
      const input = {
        ...project(),
        augmentSourceHash,
        initialState,
        importedSockets: state.sockets,
        targetDefinitions: { nextTargetId: 8, targets, alternatives: [], values: [] },
        operations: [{ kind: 'extraction' }],
        cursor,
      }
      const restored = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
      expect(restored.states[1]?.destroyed).toBe(true)
      expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(
        input,
      )
    }
  }
})
