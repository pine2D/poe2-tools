import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { type CraftProject, parseCraftProject, serializeCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { inspectItem } from './export'
import { fluxCatalogSignature } from './fluxes'
import { requiresOffhandIdolProjectVersion } from './offhandIdolProjectVersion'
import { parseItem } from './parse'
import { importIdentifiedCraftState } from './rehearsalImport'
import { statScalabilitySourceHash } from './statScalability'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const version = 'basic-2026-09-18-v113'
const id = (name: string, category = 'shield') => `pob2:augment:${JSON.stringify([name, category])}`
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
      baseId: 'Splintered Tower Shield',
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
it('空v113保持原版本并继承v109权杖瓦尔未来能力', () => {
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
const full = { ...catalog, fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) }
it.each(Array.from({ length: 111 }, (_, index) => index + 2))(
  'v%s拒绝全部六个副手雕像声明和嵌套未来；纯报价继续兼容',
  (n) => {
    const idols = (catalog.augments ?? []).filter(
      (a) =>
        ['focus', 'shield', 'buckler'].includes(a.category) &&
        a.type === 'Idol' &&
        a.lines.length > 0,
    )
    expect(idols).toHaveLength(6)
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
        { currentState: { sockets: [augment.id] } },
        { future: { nested: { sockets: [augment.id] } } },
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
        ).toMatchObject({ ok: false, error: expect.stringContaining('v113') })
    }
  },
)
it.each([
  ['Splintered Tower Shield', 'shield', 'Ox Idol', 'Idol of Silk'],
  ['Splintered Tower Shield', 'shield', 'Idol of Greust', 'Ox Idol'],
  ['Leather Buckler', 'buckler', 'Idol of Greust', 'Ox Idol'],
  ['Twig Focus', 'focus', 'Owl Idol', 'Owl Idol'],
])('无增效 %s 雕像完整未来及未执行指引必须绑定双来源', (baseId, category, first, second) => {
  for (const extra of [
    {
      initialState: { ...project().initialState, baseId, sockets: [null] },
      operations: [
        { kind: 'socket', socketIndex: 0, augmentId: id(first, category) },
        { kind: 'socket', socketIndex: 0, augmentId: id(second, category) },
      ],
    },
    {
      strategy: {
        maxSteps: 1,
        rules: [
          {
            conditions: [{ kind: 'always' }],
            action: { kind: 'socket', socketIndex: 0, augmentId: id(first, category) },
          },
        ],
      },
    },
  ])
    for (const cursor of 'operations' in extra ? [0, 1, 2] : [0]) {
      const input = {
        ...project(),
        initialState: { ...project().initialState, baseId },
        ...hashes,
        ...extra,
        cursor,
      }
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
        initialState: { ...project().initialState, baseId },
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
    pricing: { unit: 'divine', prices: { 'augment:Ox Idol': 2 } },
  }
  const source = {
    ...project(),
    ...hashes,
    strategy: {
      maxSteps: 1,
      rules: [
        {
          conditions: [{ kind: 'always' }],
          action: { kind: 'socket', socketIndex: 0, augmentId: id('Ox Idol') },
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
      importedSockets: [id('Ox Idol')],
    } as unknown as CraftProject),
  ).toThrow(/v113/)
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

it('能力扫描不解析观察文本、不调用getter，循环对象安全且权杖同名不误判', () => {
  const requires = requiresOffhandIdolProjectVersion
  expect(requires({ importedSockets: [id('Snake Idol', 'sceptre')] })).toBe(false)
  expect(
    requires({
      sourceText: JSON.stringify({ sockets: [id('Ox Idol')] }),
      name: id('Ox Idol'),
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
  cyclic.future = { nested: { action: { kind: 'socket', augmentId: id('Ox Idol') } } }
  expect(requires(cyclic)).toBe(true)
})

it('新六个精确身份独立于手套和权杖同名分支，均支持起点与导入声明恢复', () => {
  const dictionary = createCraftItemDictionary(catalog, {})
  const idols = (catalog.augments ?? []).filter(
    (a) =>
      ['focus', 'shield', 'buckler'].includes(a.category) &&
      a.type === 'Idol' &&
      a.lines.length > 0,
  )
  expect(idols).toHaveLength(6)
  for (const augment of idols) {
    const baseId =
      augment.category === 'focus'
        ? 'Twig Focus'
        : augment.category === 'buckler'
          ? 'Leather Buckler'
          : 'Splintered Tower Shield'
    const exported = exportCraftItemText(catalog, {
      ...project().initialState,
      rarity: 'normal',
      baseId,
      sockets: [augment.id],
    })
    if (!exported.ok) throw Error(exported.error)
    const parsed = parseItem(exported.value.text)
    if (!parsed.ok) throw Error(parsed.error)
    const imported = importIdentifiedCraftState(
      catalog,
      baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      [augment.id],
    )
    if (!imported.ok) throw Error(imported.error)
    expect(imported.value.sourceText).toBe(exported.value.text)
    const input = {
      ...project(),
      ...hashes,
      initialState: { ...imported.value, nextAffixId: 1 },
      importedSockets: [augment.id],
      ...(augment.category === 'shield'
        ? {
            targetDefinitions: {
              nextTargetId: 2,
              targets: [{ targetId: 't1', modId: 'LocalBlockChance3' }],
              alternatives: [],
              values: [],
            },
          }
        : {}),
      pricing: { unit: 'divine', prices: { [`augment:${augment.name}`]: 2 } },
    }
    const result = loadTargetWorkbenchProject(JSON.stringify(input), catalog, dictionary)
    if (!result.ok) throw Error(`${augment.id}: ${result.error}`)
    expect(result.value.project).toEqual(input)
    const serialized = serializeTargetCraftProject(result.value.project, catalog, dictionary)
    if (!serialized.ok) throw Error(serialized.error)
    expect(JSON.parse(serialized.value)).toEqual(input)
    for (const field of Object.keys(hashes))
      for (const hash of [undefined, '0'.repeat(64)])
        expect(
          parseTargetCraftProject(JSON.stringify({ ...input, [field]: hash }), catalog, dictionary)
            .ok,
          `${augment.id}/${field}`,
        ).toBe(false)
    expect(requiresOffhandIdolProjectVersion({ sockets: [augment.id] })).toBe(true)
    for (const category of ['body armour', 'gloves', 'helmet', 'boots', 'sceptre', 'weapon'])
      expect(requiresOffhandIdolProjectVersion({ sockets: [id(augment.name, category)] })).toBe(
        false,
      )
  }
  expect(requiresOffhandIdolProjectVersion({ sockets: [id('Unknown Idol')] })).toBe(false)
  expect(requiresOffhandIdolProjectVersion({ sockets: [id('Idol of Silk', 'buckler')] })).toBe(
    false,
  )
})

it('完整历史已替换副手雕像仍保留v113与双来源，沿用停止指引不降级', () => {
  const rune = catalog.augments?.find((a) => a.category === 'armour' && a.name === 'Desert Rune')
  if (!rune) throw Error('缺少副手符文')
  const input = {
    ...project(),
    ...hashes,
    initialState: { ...project().initialState, sockets: [null] },
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId: id('Ox Idol') },
      { kind: 'socket', socketIndex: 0, augmentId: rune.id },
    ],
    cursor: 2,
  }
  const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  expect(loaded.value.states.at(-1)?.sockets).toEqual([rune.id])
  expect(loaded.value.project).toEqual(input)
  const strategy = {
    maxSteps: 1,
    rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
  }
  const reused = reuseTargetCraftPlan(
    JSON.stringify(input),
    JSON.stringify({
      ...project(),
      strategy,
      rulesVersion: 'basic-2026-09-17-v111',
    }),
    catalog,
  )
  if (!reused.ok) throw Error(reused.error)
  expect(reused.value.project).toEqual({ ...input, strategy })
  expect(reused.value.states).toEqual(loaded.value.states)
})
