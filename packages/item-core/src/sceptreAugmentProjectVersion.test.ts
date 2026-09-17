import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import { statScalabilitySourceHash } from './statScalability'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const version = 'basic-2026-09-17-v109'
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'sceptre'])}`
const hashes = {
  augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')?.sha256,
  scalabilitySourceHash: statScalabilitySourceHash(catalog),
}
function project() {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: version,
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
it('空 v109 保留版本，普通无孔权杖旧版本继续兼容', () => {
  const input = project()
  const read = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  expect(read.ok).toBe(true)
  if (!read.ok) throw Error(read.error)
  expect(read.value.project).toEqual(input)
})
it('v2–v108 拒绝权杖孔位、专属声明、打孔未来、未执行指引，保留无孔基线', () => {
  const full = { ...catalog, fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) }
  for (let n = 2; n <= 108; n++) {
    const { targetDefinitions, orphanedTargets, ...blank } = project()
    const { nextAffixId: _, ...legacy } = blank.initialState
    const input = {
      ...blank,
      rulesVersion: `basic-2026-09-${n >= 92 ? '17' : n >= 76 ? '16' : '12'}-v${n}`,
      initialState: n >= 73 ? blank.initialState : legacy,
      ...(n >= 74 ? { targetDefinitions, orphanedTargets } : {}),
      ...(n === 75 ? { fluxCatalogSignature: fluxCatalogSignature(full) } : {}),
    }
    const read =
      n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
    expect(read(JSON.stringify(input), full).ok, `v${n}基线`).toBe(true)
    for (const extra of [
      { initialState: { ...input.initialState, sockets: [null] } },
      { importedSockets: [null] },
      { importedSockets: [id('Snake Idol')] },
      { operations: [{ kind: 'artificer' }] },
      { operations: [{ kind: 'socket', socketIndex: 0, augmentId: id('Snake Idol') }] },
      { strategy: { nested: { action: { kind: 'artificer' } } } },
    ])
      expect(read(JSON.stringify({ ...input, ...extra }), full), `v${n}`).toMatchObject({
        ok: false,
        error: expect.stringContaining('v109'),
      })
  }
})
it('v109 完整未来覆盖及双指纹保留，未执行打孔也绑定来源', () => {
  for (const extra of [
    {
      initialState: { ...project().initialState, sockets: [null] },
      operations: [
        { kind: 'socket', socketIndex: 0, augmentId: id('Snake Idol') },
        { kind: 'socket', socketIndex: 0, augmentId: id('Rabbit Idol') },
      ],
    },
    {
      strategy: {
        maxSteps: 1,
        rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'artificer' } }],
      },
    },
  ]) {
    const input = { ...project(), ...hashes, ...extra }
    const read = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
    expect(read.ok).toBe(true)
    if (!read.ok) throw Error(read.error)
    expect(read.value.project).toEqual(input)
    const serialized = serializeTargetCraftProject(read.value.project, catalog)
    if (!serialized.ok) throw Error(serialized.error)
    expect(JSON.parse(serialized.value)).toEqual(input)
    for (const field of Object.keys(hashes))
      for (const hash of [undefined, '0'.repeat(64)])
        expect(
          parseTargetCraftProject(JSON.stringify({ ...input, [field]: hash }), catalog).ok,
        ).toBe(false)
  }
})
it('旧同名材料报价合法；沿用权杖打孔指引升级并携带双来源', () => {
  const current = {
    ...project(),
    rulesVersion: 'basic-2026-09-17-v108',
    pricing: { unit: 'divine', prices: { 'augment:Rune of the Hunt': 2 } },
  }
  expect(parseTargetCraftProject(JSON.stringify(current), catalog).ok).toBe(true)
  const source = {
    ...project(),
    ...hashes,
    strategy: {
      maxSteps: 1,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'artificer' } }],
    },
  }
  const reused = reuseTargetCraftPlan(JSON.stringify(current), JSON.stringify(source), catalog)
  expect(reused.ok).toBe(true)
  if (!reused.ok) throw Error(reused.error)
  expect(reused.value.project).toMatchObject({
    rulesVersion: version,
    ...hashes,
    pricing: current.pricing,
  })
})

it('全部36权杖ID均拒绝旧声明，同名非权杖报价保持旧兼容', () => {
  for (const augment of catalog.augments?.filter((a) => a.category === 'sceptre') ?? []) {
    const input = { ...project(), rulesVersion: 'basic-2026-09-17-v108' }
    expect(
      parseTargetCraftProject(JSON.stringify({ ...input, importedSockets: [augment.id] }), catalog),
    ).toMatchObject({ ok: false, error: expect.stringContaining('v109') })
    expect(
      parseTargetCraftProject(
        JSON.stringify({
          ...input,
          pricing: { unit: 'divine', prices: { [`augment:${augment.name}`]: 1 } },
        }),
        catalog,
      ).ok,
      augment.name,
    ).toBe(true)
  }
})

it('沿用旧部位打孔指引到无孔权杖时补齐新能力双来源', () => {
  const current = { ...project(), rulesVersion: 'basic-2026-09-17-v108' }
  const source = {
    ...current,
    augmentSourceHash: hashes.augmentSourceHash,
    initialState: { ...current.initialState, baseId: 'Adherent Cuffs' },
    strategy: {
      maxSteps: 1,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'artificer' } }],
    },
  }
  const reused = reuseTargetCraftPlan(JSON.stringify(current), JSON.stringify(source), catalog)
  if (!reused.ok) throw Error(reused.error)
  expect(reused.value.project).toMatchObject({ rulesVersion: version, ...hashes })
})

import { type CraftProject, serializeCraftProject } from './craftProject'
import { requiresSceptreAugmentProjectVersion } from './sceptreAugmentProjectVersion'

it('能力扫描继承基底上下文，空数组、观察文本、getter和非权杖打孔不误触发', () => {
  const requires = requiresSceptreAugmentProjectVersion
  expect(
    requires({
      ...project(),
      importedSockets: [],
      initialState: { ...project().initialState, sockets: [] },
    }),
  ).toBe(false)
  expect(
    requires({ baseId: 'Adherent Cuffs', sockets: [null], operations: [{ kind: 'artificer' }] }),
  ).toBe(false)
  expect(
    requires({
      ...project(),
      sourceText: JSON.stringify({ sockets: [id('Snake Idol')] }),
      name: id('Snake Idol'),
    }),
  ).toBe(false)
  const accessor = Object.defineProperty({}, 'initialState', {
    get() {
      throw Error('不可访问')
    },
  })
  expect(requires(accessor)).toBe(false)
  const slots = Object.defineProperty([], '0', {
    get() {
      throw Error('不可访问')
    },
  })
  expect(requires({ sockets: slots })).toBe(false)
  const shared = { action: { kind: 'artificer' } }
  expect(
    requires({
      one: { baseId: 'Adherent Cuffs', shared },
      two: { baseId: 'Rattling Sceptre', shared },
    }),
  ).toBe(true)
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  expect(requires(cyclic)).toBe(false)
})
it('无目录旧serializer拦新增孔位、未来打孔及专属声明', () => {
  for (const extra of [
    { initialState: { ...project().initialState, sockets: [null] } },
    { operations: [{ kind: 'artificer' }] },
    { importedSockets: [id('Boar Idol')] },
  ])
    expect(() =>
      serializeCraftProject({ ...project(), ...extra } as unknown as CraftProject),
    ).toThrow(/v109/)
})
it('所有撤销位置保留完整覆盖未来、源状态、报价和v109版本', () => {
  const initialState = { ...project().initialState, sockets: [null] }
  const operations = [
    { kind: 'socket', socketIndex: 0, augmentId: id('Snake Idol') },
    { kind: 'socket', socketIndex: 0, augmentId: id('Rabbit Idol') },
  ]
  for (const cursor of [0, 1, 2]) {
    const input = {
      ...project(),
      ...hashes,
      initialState,
      operations,
      cursor,
      pricing: { unit: 'divine', prices: { 'augment:Snake Idol': 2, 'augment:Rabbit Idol': 3 } },
    }
    const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
    if (!loaded.ok) throw Error(loaded.error)
    expect(loaded.value.project).toEqual(input)
    expect(loaded.value.states.map((s) => s.sockets)).toEqual([
      [null],
      [id('Snake Idol')],
      [id('Rabbit Idol')],
    ])
    const source = {
      ...project(),
      rulesVersion: 'basic-2026-09-17-v108',
      strategy: {
        maxSteps: 1,
        rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
      },
    }
    const reused = reuseTargetCraftPlan(JSON.stringify(input), JSON.stringify(source), catalog)
    if (!reused.ok) throw Error(reused.error)
    expect(reused.value.project).toEqual({ ...input, strategy: source.strategy })
    expect(reused.value.states).toEqual(loaded.value.states)
  }
})

it('零孔权杖瓦尔加孔完整未来与未执行瓦尔指引要求v109及双来源', () => {
  const blank = { ...project(), initialState: { ...project().initialState, sockets: [] } }
  for (const extra of [
    { operations: [{ kind: 'vaal', outcome: 'socket' }] },
    {
      strategy: {
        maxSteps: 1,
        rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'vaal' } }],
      },
    },
  ]) {
    const input = { ...blank, ...hashes, ...extra }
    expect(requiresSceptreAugmentProjectVersion(input)).toBe(true)
    expect(
      parseTargetCraftProject(
        JSON.stringify({ ...input, rulesVersion: 'basic-2026-09-17-v108' }),
        catalog,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('v109') })
    const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
    if (!loaded.ok) throw Error(loaded.error)
    expect(loaded.value.project).toEqual(input)
    if ('operations' in extra)
      expect(loaded.value.states.map((s) => s.sockets)).toEqual([[], [null]])
    for (const field of Object.keys(hashes))
      for (const hash of [undefined, '0'.repeat(64)])
        expect(
          parseTargetCraftProject(JSON.stringify({ ...input, [field]: hash }), catalog).ok,
        ).toBe(false)
  }
  const unchanged = {
    ...blank,
    rulesVersion: 'basic-2026-09-17-v108',
    augmentSourceHash: hashes.augmentSourceHash,
    operations: [{ kind: 'vaal', outcome: 'unchanged' }],
  }
  expect(requiresSceptreAugmentProjectVersion(unchanged)).toBe(false)
  expect(parseTargetCraftProject(JSON.stringify(unchanged), catalog).ok).toBe(true)
})
it('旧其他部位瓦尔指引沿用到零孔权杖时升级版本并补双来源', () => {
  const current = {
    ...project(),
    rulesVersion: 'basic-2026-09-17-v108',
    augmentSourceHash: hashes.augmentSourceHash,
    initialState: { ...project().initialState, sockets: [] },
  }
  const source = {
    ...current,
    initialState: { ...current.initialState, baseId: 'Adherent Cuffs' },
    strategy: {
      maxSteps: 1,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'vaal' } }],
    },
  }
  const reused = reuseTargetCraftPlan(JSON.stringify(current), JSON.stringify(source), catalog)
  if (!reused.ok) throw Error(reused.error)
  expect(reused.value.project).toMatchObject({
    rulesVersion: version,
    ...hashes,
    initialState: current.initialState,
    strategy: source.strategy,
  })
})
