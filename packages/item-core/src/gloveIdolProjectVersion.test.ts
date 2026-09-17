import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { type CraftProject, parseCraftProject, serializeCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import { statScalabilitySourceHash } from './statScalability'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const version = 'basic-2026-09-17-v110'
const id = (name: string, category = 'gloves') => `pob2:augment:${JSON.stringify([name, category])}`
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
it('空v110保持原版本并继承v109权杖瓦尔未来能力', () => {
  const blank = project()
  const loaded = loadTargetWorkbenchProject(JSON.stringify(blank), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  expect(loaded.value.project).toEqual(blank)
  const input = {
    ...blank,
    ...hashes,
    initialState: { ...blank.initialState, baseId: 'Rattling Sceptre', sockets: [] },
    operations: [{ kind: 'vaal', outcome: 'socket' }],
  }
  const restored = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  if (!restored.ok) throw Error(restored.error)
  expect(restored.value.project).toEqual(input)
  expect(restored.value.states.map((s) => s.sockets)).toEqual([[], [null]])
})
it('v2至v109拒绝全部九手套雕像声明和嵌套未来；纯报价继续兼容', () => {
  const full = { ...catalog, fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) }
  const idols = (catalog.augments ?? []).filter((a) => a.category === 'gloves' && a.type === 'Idol')
  expect(idols).toHaveLength(9)
  for (let n = 2; n <= 109; n++) {
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
    for (const augment of idols) {
      if (n >= 34)
        expect(
          read(
            JSON.stringify({
              ...input,
              pricing: { unit: 'divine', prices: { [`augment:${augment.name}`]: 1 } },
            }),
            full,
          ).ok,
          `v${n}报价`,
        ).toBe(true)
      for (const extra of [
        { importedSockets: [augment.id] },
        { initialState: { ...input.initialState, sockets: [augment.id] } },
        { operations: [{ kind: 'socket', socketIndex: 0, augmentId: augment.id }] },
        {
          strategy: {
            nested: { action: { kind: 'socket', socketIndex: 0, augmentId: augment.id } },
          },
        },
      ])
        expect(
          read(JSON.stringify({ ...input, ...extra }), full),
          `v${n}/${augment.name}`,
        ).toMatchObject({ ok: false, error: expect.stringContaining('v110') })
    }
  }
})
it('无增效手套雕像完整未来及未执行指引必须绑定双来源', () => {
  for (const extra of [
    {
      initialState: { ...project().initialState, sockets: [null] },
      operations: [
        { kind: 'socket', socketIndex: 0, augmentId: id('Snake Idol') },
        { kind: 'socket', socketIndex: 0, augmentId: id('Cat Idol') },
      ],
    },
    {
      strategy: {
        maxSteps: 1,
        rules: [
          {
            conditions: [{ kind: 'always' }],
            action: { kind: 'socket', socketIndex: 0, augmentId: id('Snake Idol') },
          },
        ],
      },
    },
  ])
    for (const cursor of 'operations' in extra ? [0, 1, 2] : [0]) {
      const input = { ...project(), ...hashes, ...extra, cursor }
      const restored = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
      if (!restored.ok) throw Error(restored.error)
      expect(restored.value.project).toEqual(input)
      const serialized = serializeTargetCraftProject(restored.value.project, catalog)
      if (!serialized.ok) throw Error(serialized.error)
      expect(JSON.parse(serialized.value)).toEqual(input)
      for (const field of Object.keys(hashes))
        for (const hash of [undefined, '0'.repeat(64)])
          expect(
            parseTargetCraftProject(JSON.stringify({ ...input, [field]: hash }), catalog).ok,
          ).toBe(false)
      const source = {
        ...project(),
        rulesVersion: 'basic-2026-09-17-v109',
        strategy: {
          maxSteps: 1,
          rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
        },
      }
      const reused = reuseTargetCraftPlan(JSON.stringify(input), JSON.stringify(source), catalog)
      if (!reused.ok) throw Error(reused.error)
      expect(reused.value.project).toEqual({ ...input, strategy: source.strategy })
      expect(reused.value.states).toEqual(restored.value.states)
    }
})
it('沿用新雕像指引升级且保留当前装备历史及报价', () => {
  const current = {
    ...project(),
    rulesVersion: 'basic-2026-09-17-v109',
    pricing: { unit: 'divine', prices: { 'augment:Snake Idol': 2 } },
  }
  const source = {
    ...project(),
    ...hashes,
    strategy: {
      maxSteps: 1,
      rules: [
        {
          conditions: [{ kind: 'always' }],
          action: { kind: 'socket', socketIndex: 0, augmentId: id('Snake Idol') },
        },
      ],
    },
  }
  const reused = reuseTargetCraftPlan(JSON.stringify(current), JSON.stringify(source), catalog)
  if (!reused.ok) throw Error(reused.error)
  expect(reused.value.project).toEqual({
    ...current,
    rulesVersion: version,
    ...hashes,
    strategy: source.strategy,
  })
})
it('旧无目录serializer拒绝雕像，sceptre同名仍只要求v109', () => {
  expect(() =>
    serializeCraftProject({
      ...project(),
      importedSockets: [id('Snake Idol')],
    } as unknown as CraftProject),
  ).toThrow(/v110/)
  const input = {
    ...project(),
    ...hashes,
    rulesVersion: 'basic-2026-09-17-v109',
    initialState: {
      ...project().initialState,
      baseId: 'Rattling Sceptre',
      sockets: [null],
    },
  }
  const result = parseTargetCraftProject(
    JSON.stringify({
      ...input,
      operations: [{ kind: 'socket', socketIndex: 0, augmentId: id('Snake Idol', 'sceptre') }],
    }),
    catalog,
  )
  expect(result).toMatchObject({ ok: true })
})

import { requiresGloveIdolProjectVersion } from './gloveIdolProjectVersion'

it('能力扫描不解析观察文本、不调用getter，循环对象安全且权杖同名不误判', () => {
  const requires = requiresGloveIdolProjectVersion
  expect(requires({ importedSockets: [id('Snake Idol', 'sceptre')] })).toBe(false)
  expect(
    requires({
      sourceText: JSON.stringify({ sockets: [id('Snake Idol')] }),
      name: id('Snake Idol'),
      pricing: { prices: { 'augment:Snake Idol': 1 } },
    }),
  ).toBe(false)
  const accessor = Object.defineProperty({}, 'initialState', {
    get() {
      throw Error('不可访问')
    },
  })
  expect(requires(accessor)).toBe(false)
  const sockets = Object.defineProperty([], '0', {
    get() {
      throw Error('不可访问')
    },
  })
  expect(requires({ sockets })).toBe(false)
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  expect(requires(cyclic)).toBe(false)
  cyclic.future = { nested: { action: { kind: 'socket', augmentId: id('Snake Idol') } } }
  expect(requires(cyclic)).toBe(true)
})
