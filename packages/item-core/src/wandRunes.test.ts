import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { type CraftState, createCraftState } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { runeSocketContributionError } from './runeImport'
import { socketCandidates, socketEffects } from './sockets'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const names: string[] = [
  "Hedgewitch Assandra's Rune of Wisdom",
  "Saqawal's Rune of the Sky",
  "Fenumus' Rune of Agony",
  "Thane Girt's Rune of Wildness",
  'Warding Rune of Desperation',
  'Warding Rune of Obsession',
  'Ancient Rune of Decay',
  'Rune of Reach',
  'Legacy of Lifesprig',
  "Legacy of Adonia's Ego",
  'Legacy of Cursecarver',
]
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'wand'])}`
const state = (): CraftState => ({
  baseId: 'Volatile Wand',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  affixes: [],
  sockets: [null, null],
  implicitLines: ['Grants Skill: Level 12 Volatile Dead'],
})
it.each(names)('法杖专属 %s 可镶入、显示、核对完整来源与替换', (name) => {
  const initial = state()
  expect(socketCandidates(catalog, initial).some((a) => a.id === id(name))).toBe(true)
  const result = applyCraftStep(catalog, initial, {
    kind: 'socket',
    socketIndex: 0,
    augmentId: id(name),
  })
  if (!result.ok) throw Error(result.error)
  const effects = socketEffects(catalog, result.value).flatMap((e) => e.augment.lines)
  expect(effects.length).toBeGreaterThan(0)
  expect(
    runeSocketContributionError(catalog, { ...result.value, runeSourceLines: effects }),
  ).toBeNull()
  expect(
    runeSocketContributionError(catalog, { ...result.value, runeSourceLines: [] }),
  ).not.toBeNull()
  expect(
    createCraftState(catalog, { ...result.value, baseId: 'Twig Focus', implicitLines: [] }).ok,
  ).toBe(false)
  expect(
    applyCraftStep(catalog, result.value, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: 'pob2:augment:["Lesser Desert Rune","wand"]',
    }).ok,
  ).toBe(true)
})

it('同名限量与三种遗产共享组严格限制，允许同孔互换和既有超限修复', () => {
  const first = applyCraftStep(catalog, state(), {
    kind: 'socket',
    socketIndex: 0,
    augmentId: id('Legacy of Lifesprig'),
  })
  if (!first.ok) throw Error(first.error)
  expect(
    applyCraftStep(catalog, first.value, {
      kind: 'socket',
      socketIndex: 1,
      augmentId: id("Legacy of Adonia's Ego"),
    }),
  ).toMatchObject({ ok: false, error: expect.stringContaining('限量') })
  expect(
    applyCraftStep(catalog, first.value, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: id("Legacy of Adonia's Ego"),
    }).ok,
  ).toBe(true)
  const duplicated = {
    ...first.value,
    sockets: [id('Legacy of Lifesprig'), id("Legacy of Adonia's Ego")],
  }
  expect(createCraftState(catalog, duplicated).ok).toBe(true)
  expect(
    applyCraftStep(catalog, duplicated, {
      kind: 'socket',
      socketIndex: 1,
      augmentId: id('Rune of Reach'),
    }).ok,
  ).toBe(true)
  const unlimited = { ...state(), sockets: [id('Warding Rune of Desperation'), null] }
  expect(
    applyCraftStep(catalog, unlimited, {
      kind: 'socket',
      socketIndex: 1,
      augmentId: id('Warding Rune of Desperation'),
    }).ok,
  ).toBe(true)
})
it('君王增效缩放概率与负作用，固定两枚投射物和无数值效果不变', () => {
  const real: CraftCatalog = {
    ...catalog,
    alloys: JSON.parse(readFileSync('data/craft/alloys.json', 'utf8')),
  }
  const initial = {
    ...state(),
    affixes: [
      {
        modId: 'AlloyEffectOfSocketedAugments1',
        crafted: true as const,
        lines: ['30(20-30)% increased effect of Socketed Augment Items'],
      },
    ],
  }
  for (const [name, expected] of [
    [
      "Thane Girt's Rune of Wildness",
      ['32% chance for Spell Skills to fire 2 additional Projectiles'],
    ],
    [
      'Rune of Reach',
      [
        'Remnants you create have 32% reduced effect',
        'Remnants can be collected from 65% further away',
      ],
    ],
    [
      'Warding Rune of Obsession',
      ['All damage taken bypasses Runic Ward', 'Runic Ward Regeneration Rate is doubled'],
    ],
  ] as const) {
    const result = applyCraftStep(real, initial, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: id(name),
    })
    if (!result.ok) throw Error(result.error)
    expect(socketEffects(real, result.value)[0]?.augment.lines).toEqual(expected)
    expect(
      runeSocketContributionError(real, { ...result.value, runeSourceLines: [...expected] }),
    ).toBeNull()
  }
})
it('完整目录身份与缩放元数据变化必须拒绝，递归增效来源继续待核实', () => {
  for (const field of ['limit', 'bonded', 'statOrder', 'tradeHashes']) {
    const bad = structuredClone(catalog)
    const rune = bad.augments?.find((a) => a.id === id('Rune of Reach'))
    if (!rune) throw Error('目录缺项')
    delete (rune as unknown as Record<string, unknown>)[field]
    expect(socketCandidates(bad, state()).some((a) => a.id === rune.id)).toBe(false)
  }
  const bad = structuredClone(catalog)
  if (!bad.scalability) throw Error('缺少缩放数据')
  bad.scalability['25% chance for Spell Skills to fire 2 additional Projectiles'] = [
    { scalable: true, formats: [] },
    { scalable: true, formats: [] },
  ]
  expect(
    socketCandidates(bad, state()).some((a) => a.id === id("Thane Girt's Rune of Wildness")),
  ).toBe(false)
  expect(
    socketCandidates(catalog, state()).some((a) => a.name === "Legacy of Runeseeker's Call"),
  ).toBe(false)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s 全部专属符文三语回读保留效果与声明', (locale) => {
  const dictionary = createCraftItemDictionary(
    catalog,
    locale === 'en'
      ? {}
      : {
          items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
          stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
        },
  )
  for (const name of names) {
    const initial = {
      ...state(),
      sockets: [id(name), 'pob2:augment:["Lesser Desert Rune","wand"]'],
    }
    const text = exportCraftItemText(catalog, initial, { locale, dictionary })
    if (!text.ok) throw Error(text.error)
    const parsed = parseItem(text.value.text)
    if (!parsed.ok) throw Error(parsed.error)
    const restored = importIdentifiedCraftState(
      catalog,
      initial.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      initial.sockets,
      undefined,
      dictionary.stats?.entries,
    )
    if (!restored.ok) throw Error(`${name}: ${restored.error}`)
    expect(restored.value.sockets).toEqual(initial.sockets)
    expect(socketEffects(catalog, restored.value).flatMap((e) => e.augment.lines)).toEqual(
      socketEffects(catalog, initial).flatMap((e) => e.augment.lines),
    )
  }
})

it('同属性专属效果可核对合并显示，仍拒绝漏算与多算', () => {
  const spells = {
    ...state(),
    sockets: [id("Hedgewitch Assandra's Rune of Wisdom"), id('Legacy of Lifesprig')],
  }
  expect(
    runeSocketContributionError(catalog, {
      ...spells,
      runeSourceLines: ['+3 to Level of all Spell Skills'],
    }),
  ).toBeNull()
  expect(
    runeSocketContributionError(catalog, {
      ...spells,
      runeSourceLines: ['+2 to Level of all Spell Skills'],
    }),
  ).not.toBeNull()
  const penetration = {
    ...state(),
    sockets: [id('Warding Rune of Desperation'), id('Warding Rune of Desperation')],
  }
  expect(
    runeSocketContributionError(catalog, {
      ...penetration,
      runeSourceLines: [
        'Spell damage Penetrates 50% of enemy Elemental Resistances while on Low Runic Ward',
      ],
    }),
  ).toBeNull()
  expect(
    runeSocketContributionError(catalog, {
      ...penetration,
      runeSourceLines: [
        'Spell damage Penetrates 75% of enemy Elemental Resistances while on Low Runic Ward',
      ],
    }),
  ).not.toBeNull()
})

it.each([
  '+0 to Level of all Spell Skills',
  '+00 to Level of all Spell Skills',
  'Spell damage Penetrates 0% of enemy Elemental Resistances while on Low Runic Ward',
])('空孔不能吞掉无效零值来源：%s', (line) => {
  expect(
    runeSocketContributionError(catalog, { ...state(), runeSourceLines: [line] }),
  ).not.toBeNull()
})

it('未核实的圣化起点不能借法杖部位身份新增专属符文', () => {
  const sanctified = { ...state(), sourceText: 'Sanctified' }
  expect(socketCandidates(catalog, sanctified).some((a) => names.includes(a.name))).toBe(false)
})
