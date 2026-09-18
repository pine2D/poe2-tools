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
const names = [
  "Hedgewitch Assandra's Rune of Wisdom",
  "Saqawal's Rune of the Sky",
  "Fenumus' Rune of Agony",
  "Thane Girt's Rune of Wildness",
  'Warding Rune of Desperation',
  'Ancient Rune of Discovery',
  'Rune of Reach',
  'Legacy of Dusk Vigil',
]
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'staff'])}`
const state = (): CraftState => ({
  baseId: 'Ashen Staff',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  affixes: [],
  sockets: [null, null],
  implicitLines: ['Grants Skill: Level 12 Firebolt'],
})
it.each(names)('长杖专属 %s 可镶入、显示、核对完整来源与替换', (name) => {
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
      augmentId: 'pob2:augment:["Lesser Desert Rune","staff"]',
    }).ok,
  ).toBe(true)
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
      sockets: [id(name), 'pob2:augment:["Lesser Desert Rune","staff"]'],
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

it.each([
  '+0 to Level of all Spell Skills',
  '+00 to Level of all Spell Skills',
  'Spell damage Penetrates 0% of enemy Elemental Resistances while on Low Runic Ward',
])('空孔不能吞掉无效零值来源：%s', (line) => {
  expect(
    runeSocketContributionError(catalog, { ...state(), runeSourceLines: [line] }),
  ).not.toBeNull()
})

it('未核实的圣化起点不能借长杖部位身份新增专属符文', () => {
  const sanctified = { ...state(), sourceText: 'Sanctified' }
  expect(socketCandidates(catalog, sanctified).some((a) => names.includes(a.name))).toBe(false)
})

it('长杖增效遵守逐值元数据，限量与非长杖身份独立校验', () => {
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
  for (const [name, lines] of [
    [
      "Thane Girt's Rune of Wildness",
      ['32% chance for Spell Skills to fire 2 additional Projectiles'],
    ],
    ['Ancient Rune of Discovery', ['39% chance to create an additional Remnant']],
    ['Legacy of Dusk Vigil', ['Gain 39% of Physical Damage as Extra Fire Damage']],
    [
      'Rune of Reach',
      [
        'Remnants you create have 32% reduced effect',
        'Remnants can be collected from 65% further away',
      ],
    ],
  ] as const) {
    const result = applyCraftStep(real, initial, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: id(name),
    })
    if (!result.ok) throw Error(result.error)
    expect(socketEffects(real, result.value)[0]?.augment.lines).toEqual(lines)
    expect(
      runeSocketContributionError(real, { ...result.value, runeSourceLines: [...lines] }),
    ).toBeNull()
    expect(
      applyCraftStep(real, result.value, { kind: 'socket', socketIndex: 1, augmentId: id(name) })
        .ok,
    ).toBe(false)
    expect(
      applyCraftStep(real, result.value, { kind: 'socket', socketIndex: 0, augmentId: id(name) })
        .ok,
    ).toBe(true)
  }
  for (const baseId of ['Volatile Wand', 'Aegis Quarterstaff']) {
    expect(
      socketCandidates(catalog, { ...state(), baseId, implicitLines: [] }).some(
        (a) => a.id === id('Ancient Rune of Discovery'),
      ),
    ).toBe(false)
  }
})
it('长杖拒绝伪造身份或缩放参数，重复可叠加穿透仍核对合计', () => {
  const name = "Thane Girt's Rune of Wildness"
  const fake = {
    ...catalog,
    augments: (catalog.augments ?? []).map((a) =>
      a.id === id(name)
        ? { ...a, lines: ['25% chance for Spell Skills to fire 3 additional Projectiles'] }
        : a,
    ),
  }
  expect(socketCandidates(fake, state()).some((a) => a.id === id(name))).toBe(false)
  const line = '25% chance for Spell Skills to fire 2 additional Projectiles'
  const metadata = {
    ...catalog,
    scalability: {
      ...catalog.scalability,
      [line]: [
        { scalable: true, formats: [] },
        { scalable: true, formats: [] },
      ],
    },
  }
  expect(createCraftState(metadata, { ...state(), sockets: [id(name), null] }).ok).toBe(false)
  const s = {
    ...state(),
    sockets: [id('Warding Rune of Desperation'), id('Warding Rune of Desperation')],
  }
  expect(
    runeSocketContributionError(catalog, {
      ...s,
      runeSourceLines: [
        'Spell damage Penetrates 50% of enemy Elemental Resistances while on Low Runic Ward',
      ],
    }),
  ).toBeNull()
  expect(
    runeSocketContributionError(catalog, {
      ...s,
      runeSourceLines: [
        'Spell damage Penetrates 25% of enemy Elemental Resistances while on Low Runic Ward',
      ],
    }),
  ).not.toBeNull()
})
