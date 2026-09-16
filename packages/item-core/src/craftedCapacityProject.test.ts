import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import type { CraftResult } from './rehearsal'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const astridId = 'pob2:augment:["Astrid\'s Creativity","armour"]'
const version = 'basic-2026-09-16-v87'
const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
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
it('v87 空白项目可无可选目录恢复', () => {
  const restored = must(loadTargetWorkbenchProject(JSON.stringify(project()), catalog))
  expect(restored.project).toEqual(project())
  expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(
    project(),
  )
})
it('v2–v86 均拒绝未来工艺容量符文、未执行嵌套指引和仅报价', () => {
  const real = { ...catalog, fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) }
  for (let n = 2; n <= 86; n++) {
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
      { operations: [{ kind: 'socket', socketIndex: 0, augmentId: astridId }] },
      { importedSockets: [astridId] },
      { initialState: { ...input.initialState, sockets: [astridId] } },
      {
        strategy: {
          flow: { stages: [{ action: { kind: 'socket', socketIndex: 0, augmentId: astridId } }] },
        },
      },
      { pricing: { unit: 'divine', prices: { "augment:Astrid's Creativity": 1 } } },
    ])
      expect(read(JSON.stringify({ ...input, ...extra }), real), `v${n}`).toMatchObject({
        ok: false,
        error: expect.stringContaining('v87'),
      })
  }
})

import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { importIdentifiedCraftState } from './rehearsalImport'
import { runeforgingCatalogSignature } from './runeforgingCatalog'

const ironId = 'pob2:augment:["Lesser Iron Rune","armour"]'
const augmentSourceHash = catalog._meta.sources.find(
  (s) => s.path === 'src/Data/ModRunes.lua',
)?.sha256
function socketProject() {
  return {
    ...project(),
    augmentSourceHash,
    initialState: { ...project().initialState, sockets: [null], quality: 20 },
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId: astridId },
      { kind: 'socket', socketIndex: 0, augmentId: ironId },
    ],
    pricing: { unit: 'divine', prices: { "augment:Astrid's Creativity": 2 } },
  }
}
it('v87保留全未来覆盖历史、每个游标及报价', () => {
  for (const cursor of [0, 1, 2]) {
    const input = { ...socketProject(), cursor }
    const restored = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
    expect(restored.project).toEqual(input)
    expect(restored.states.map((s) => s.sockets)).toEqual([[null], [astridId], [ironId]])
    expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(input)
  }
})
it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s合成原文起点及声明恢复后保留未来和原文', (locale) => {
  const dictionary = createCraftItemDictionary(
    catalog,
    locale === 'en'
      ? {}
      : {
          items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
          stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
        },
  )
  const restored = must(loadTargetWorkbenchProject(JSON.stringify(socketProject()), catalog))
  const state = restored.states[1]
  if (!state) throw Error('缺少镶嵌状态')
  const text = must(exportCraftItemText(catalog, state, { locale, dictionary })).text
  const parsed = parseItem(text)
  if (!parsed.ok) throw Error(parsed.error)
  const initialState = must(
    importIdentifiedCraftState(
      catalog,
      state.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      state.sockets,
      undefined,
      dictionary.stats?.entries,
    ),
  )
  const input = { ...socketProject(), initialState, importedSockets: state.sockets }
  const read = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog, dictionary))
  expect(read.project).toEqual(input)
  expect(read.states.every((s) => s.sourceText === text)).toBe(true)
})
it('沿用新指引升至v87；沿用旧指引不降级、不截断未来、不覆盖报价', () => {
  const strategy = {
    maxSteps: 4,
    rules: [
      {
        conditions: [{ kind: 'always' }],
        action: { kind: 'socket', socketIndex: 'first-empty', augmentId: astridId },
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
it('v87锻造共存继续要求完整签名，目录变化拒绝', () => {
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

it('v87接收v85锻造指引保留v87并补齐完整签名', () => {
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
  expect(next.states).toHaveLength(3)
})

import { requiresCraftedCapacityProjectVersion } from './craftedCapacityProjectVersion'

it('多工艺不依赖孔位声明；各类 Astrid、仅报价及未执行指引均触发新版', () => {
  for (const kind of ['weapon', 'armour', 'caster']) {
    const augmentId = `pob2:augment:["Astrid's Creativity","${kind}"]`
    for (const input of [
      { initialState: { sockets: [augmentId] } },
      { importedSockets: [augmentId] },
      { operations: [{ kind: 'socket', socketIndex: 0, augmentId }] },
      { strategy: { flow: { stages: [{ action: { kind: 'socket', augmentId } }] } } },
    ])
      expect(requiresCraftedCapacityProjectVersion(input, catalog)).toBe(true)
  }
  expect(
    requiresCraftedCapacityProjectVersion(
      {
        initialState: { affixes: [{ crafted: true }, { crafted: true }] },
      },
      catalog,
    ),
  ).toBe(true)
  expect(
    requiresCraftedCapacityProjectVersion(
      {
        pricing: { prices: { "augment:Astrid's Creativity": 1 } },
      },
      catalog,
    ),
  ).toBe(true)
  expect(
    requiresCraftedCapacityProjectVersion(
      {
        sourceText: JSON.stringify(socketProject()),
        initialState: { affixes: [{ crafted: true }, { crafted: false }] },
      },
      catalog,
    ),
  ).toBe(false)
})

it('v86不能通过删掉Astrid声明夹带多工艺起点', () => {
  const input = {
    ...project(),
    rulesVersion: 'basic-2026-09-16-v86',
    initialState: { ...project().initialState, affixes: [{ crafted: true }, { crafted: true }] },
  }
  expect(parseTargetCraftProject(JSON.stringify(input), catalog)).toMatchObject({
    ok: false,
    error: expect.stringContaining('v87'),
  })
})

it('v87未来镶嵌仍核对来源指纹，不能删除或篡改', () => {
  const { augmentSourceHash: _, ...unsigned } = socketProject()
  for (const input of [unsigned, { ...unsigned, augmentSourceHash: 'tampered' }])
    expect(loadTargetWorkbenchProject(JSON.stringify(input), catalog)).toMatchObject({
      ok: false,
      error: expect.stringContaining('来源指纹'),
    })
})

it('v87仅报价恢复价格并保留来源，无操作也不能降版本', () => {
  const { operations: _, ...source } = socketProject()
  const input = { ...source, operations: [] }
  const restored = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
  expect(restored.project.pricing).toEqual(input.pricing)
  expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(input)
})

it('能力扫描不执行访问器且支持循环结构', () => {
  const input: Record<string, unknown> = {}
  Object.defineProperty(input, 'sockets', {
    get() {
      throw Error('不能执行访问器')
    },
  })
  input.self = input
  expect(requiresCraftedCapacityProjectVersion(input, catalog)).toBe(false)
})
