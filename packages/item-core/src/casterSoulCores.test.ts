import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
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
describe.each(['wand', 'staff'] as const)('%s 魂核', (category) => {
  const names = [
    "Opiloti's Soul Core of Assault",
    "Guatelitzi's Soul Core of Endurance",
    "Xopec's Soul Core of Power",
    "Xipocado's Soul Core of Dominion",
    'Soul Core of Vizoma',
  ]
  const id = (name: string) => `pob2:augment:${JSON.stringify([name, category])}`
  const state = (): CraftState => ({
    baseId: category === 'wand' ? 'Volatile Wand' : 'Ashen Staff',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    affixes: [],
    sockets: [null, null],
    implicitLines: [
      category === 'wand'
        ? 'Grants Skill: Level 12 Volatile Dead'
        : 'Grants Skill: Level 12 Firebolt',
    ],
  })
  it.each(names)('长杖魂核 %s 可镶入、显示、核对完整来源与替换', (name) => {
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
        augmentId: id('Lesser Desert Rune'),
      }).ok,
    ).toBe(true)
  })

  it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s 全部魂核三语回读保留效果与声明', (locale) => {
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
        sockets: [id(name), id('Lesser Desert Rune')],
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

  it('未核实的圣化起点不能借长杖部位身份新增魂核', () => {
    const sanctified = { ...state(), sourceText: 'Sanctified' }
    expect(socketCandidates(catalog, sanctified).some((a) => names.includes(a.name))).toBe(false)
  })
})

it.each(['wand', 'staff'] as const)('%s 魂核限量、通用增效与暴击合计', (category) => {
  const id = (name: string) => `pob2:augment:${JSON.stringify([name, category])}`
  const real: CraftCatalog = {
    ...catalog,
    alloys: JSON.parse(readFileSync('data/craft/alloys.json', 'utf8')),
  }
  const initial: CraftState = {
    baseId: category === 'wand' ? 'Volatile Wand' : 'Ashen Staff',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    sockets: [null, null],
    implicitLines: [
      category === 'wand'
        ? 'Grants Skill: Level 12 Volatile Dead'
        : 'Grants Skill: Level 12 Firebolt',
    ],
    affixes: [
      {
        modId: 'AlloyEffectOfSocketedAugments1',
        crafted: true,
        lines: ['30(20-30)% increased effect of Socketed Augment Items'],
      },
    ],
  }
  for (const [name, line] of [
    [
      "Opiloti's Soul Core of Assault",
      '65% chance when you gain a Frenzy Charge to gain an additional Frenzy Charge',
    ],
    ["Xipocado's Soul Core of Dominion", 'Minions deal 52% increased Damage with Command Skills'],
    ['Soul Core of Vizoma', '39% increased Critical Hit Chance for Spells'],
  ]) {
    const result = applyCraftStep(real, initial, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: id(name as string),
    })
    if (!result.ok) throw Error(result.error)
    expect(socketEffects(real, result.value)[0]?.augment.lines).toEqual([line])
    expect(
      applyCraftStep(real, result.value, {
        kind: 'socket',
        socketIndex: 1,
        augmentId: id(name as string),
      }).ok,
    ).toBe(false)
    expect(
      applyCraftStep(real, result.value, {
        kind: 'socket',
        socketIndex: 0,
        augmentId: id(name as string),
      }).ok,
    ).toBe(true)
  }
  const mixed = {
    ...initial,
    affixes: [],
    sockets: [id('Soul Core of Vizoma'), id('Lesser Vision Rune')],
  }
  expect(
    runeSocketContributionError(catalog, {
      ...mixed,
      runeSourceLines: ['46% increased Critical Hit Chance for Spells'],
    }),
  ).toBeNull()
  expect(
    runeSocketContributionError(catalog, {
      ...mixed,
      runeSourceLines: ['30% increased Critical Hit Chance for Spells'],
    }),
  ).not.toBeNull()
  if (category === 'wand') {
    const seeker = {
      ...initial,
      sockets: [id("Legacy of Runeseeker's Call"), id('Soul Core of Vizoma')],
    }
    expect(createCraftState(real, seeker).ok).toBe(true)
    expect(socketEffects(real, seeker)[1]?.augment.lines).toEqual([
      '39% increased Critical Hit Chance for Spells',
    ])
  }
  const forged: CraftCatalog = {
    ...real,
    augments: (real.augments ?? []).map((a) =>
      a.id === id('Soul Core of Vizoma') ? { ...a, type: 'Rune' } : a,
    ),
  }
  expect(socketCandidates(forged, initial).some((a) => a.id === id('Soul Core of Vizoma'))).toBe(
    false,
  )
})
