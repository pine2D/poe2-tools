import { expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { socketLimitWarnings } from './conditionalArmourRunes'
import { applyCraftStep } from './craftSteps'
import { type CraftState, createCraftState } from './rehearsal'
import { runeSocketContributionError } from './runeImport'
import { socketCandidates, socketEffects } from './sockets'

const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'gloves'])}`
const base = catalog.bases.find(
  (b) => b.type === 'Gloves' && !b.hidden && !b.runeforged && !b.variantList,
) as CatalogBase
const state = (): CraftState => ({
  baseId: base.id,
  rarity: 'rare',
  itemLevel: 86,
  sourceText: null,
  quality: 0,
  sockets: [null, null],
  affixes: [],
})
it('九种固定手套雕像进入普通孔，共享组限量可替换修复', () => {
  expect(
    socketCandidates(catalog, state()).filter((a) => a.category === 'gloves' && a.type === 'Idol'),
  ).toHaveLength(9)
  const old = { ...state(), sockets: [id('Carved Majesty'), id('Carved Mischief')] }
  expect(createCraftState(catalog, old).ok).toBe(true)
  expect(socketLimitWarnings(catalog, old)).toContainEqual({
    name: 'AncientAugment',
    count: 2,
    limit: 1,
    exceeded: true,
  })
  expect(
    applyCraftStep(catalog, old, {
      kind: 'socket',
      socketIndex: 1,
      augmentId: id('Carved Tenacity'),
    }).ok,
  ).toBe(false)
  expect(
    applyCraftStep(catalog, old, { kind: 'socket', socketIndex: 1, augmentId: id('Snake Idol') })
      .ok,
  ).toBe(true)
})
it('普通护甲符文和雕像同时核对，条件不能遗漏', () => {
  const rune = socketCandidates(catalog, state()).find(
    (a) => a.type === 'Rune' && a.lines.includes('20% increased Armour, Evasion and Energy Shield'),
  )
  if (!rune) throw Error('Iron Rune missing')
  const s = {
    ...state(),
    sockets: [id('Boar Idol'), rune.id],
    runeSourceLines: ['Gain 1 Rage on Melee Hit', ...rune.lines],
  }
  expect(runeSocketContributionError(catalog, s)).toBe(null)
  expect(runeSocketContributionError(catalog, { ...s, runeSourceLines: [...rune.lines] })).not.toBe(
    null,
  )
  expect(
    runeSocketContributionError(catalog, {
      ...s,
      runeSourceLines: ['Gain 1 Rage on Hit', ...rune.lines],
    }),
  ).not.toBe(null)
  expect(socketEffects(catalog, s)).toHaveLength(2)
})

import { readFileSync } from 'node:fs'
import type { CatalogBase, CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { inspectItem } from './export'
import { isGloveIdol, scaleGloveIdol } from './gloveIdols'
import { parseItem } from './parse'
import { importCraftState } from './rehearsalImport'

const idols = (catalog.augments ?? []).filter((a) => a.category === 'gloves' && a.type === 'Idol')
const horror = (s: CraftState) => {
  const result = applyCraftStep(
    catalog,
    {
      ...s,
      baseId: 'Adherent Cuffs',
      affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }],
    },
    {
      kind: 'essence',
      essenceId: 'Metadata/Items/Currency/CurrencyCorruptedEssenceHorror',
      removeModId: 'IncreasedLife1',
      values: [],
    },
  )
  if (!result.ok) throw Error(result.error)
  return result.value
}
it('真实恐惧精华逐项增效；Majesty固定4000毫秒变6.4秒，Tenacity时长不变', () => {
  const expected = [
    '12% increased Attack Speed',
    '12% increased Curse Magnitudes',
    '40% increased Accuracy Rating',
    '24% increased Magnitude of Bleeding you inflict',
    'Gain 1 Rage on Melee Hit',
    '24% chance when you gain a Frenzy Charge to gain an additional Frenzy Charge',
    'Companions gain Onslaught for 6.4 seconds on Hitting your Marked targets',
    "+8% to maximum Block chance if you've Blocked with a raised Shield Recently",
    'Enemies you Critically Hit get 160% reduced Life Regeneration Rate for 4 seconds',
  ]
  for (const [i, a] of idols.entries()) {
    const s = horror({ ...state(), sockets: [a.id] })
    expect(socketEffects(catalog, s).flatMap((e) => e.augment.lines)).toEqual([expected[i]])
    expect(
      runeSocketContributionError(catalog, { ...s, runeSourceLines: [expected[i] as string] }),
    ).toBe(null)
    expect(
      runeSocketContributionError(catalog, {
        ...s,
        runeSourceLines: [expected[i] as string, expected[i] as string],
      }),
    ).not.toBe(null)
    const removed = applyCraftStep(catalog, s, {
      currency: 'annulment',
      modIds: [],
      removeModId: 'EssenceLocalRuneAndSoulCoreEffect1',
    })
    if (!removed.ok) throw Error(removed.error)
    expect(socketEffects(catalog, removed.value)[0]?.augment.lines).toEqual(a.lines)
  }
})
it('固定完整metadata和双来源hash缺一不可，未增效同样校验', () => {
  for (const a of idols) {
    expect(isGloveIdol(a)).toBe(true)
    for (const patch of [
      { type: 'Rune' },
      { limit: 2 },
      { limitId: 'wrong' },
      { localMod: true },
      { bonded: undefined },
      { canSocketInUniqueItems: false },
      { isSocketBound: true },
      { lines: [...a.lines, 'Damage is Lucky'] },
      { tradeHashes: {} },
      { statOrder: [1] },
    ]) {
      expect(isGloveIdol({ ...a, ...patch } as typeof a)).toBe(false)
    }
    for (const path of ['src/Data/ModRunes.lua', 'src/Data/ModScalability.lua']) {
      const forged: CraftCatalog = {
        ...catalog,
        _meta: {
          ...catalog._meta,
          sources: catalog._meta.sources.map((s) =>
            s.path === path ? { ...s, sha256: '0'.repeat(64) } : s,
          ),
        },
      }
      expect(scaleGloveIdol(forged, a, 0)).toBe(null)
    }
    expect(
      scaleGloveIdol(
        {
          ...catalog,
          scalability: {
            ...catalog.scalability,
            [a.lines[0] as string]: [{ scalable: false, formats: [] }],
          },
        },
        a,
        0,
      ),
    ).toBe(null)
    expect(
      createCraftState({ ...catalog, augments: [a, a] }, { ...state(), sockets: [a.id] }).ok,
    ).toBe(false)
  }
  for (const type of ['Helmet', 'Body Armour', 'Boots', 'Sceptre', 'Ring']) {
    const b = catalog.bases.find(
      (b) => b.type === type && !b.hidden && !b.runeforged && !b.variantList,
    )
    if (!b) throw Error(type)
    expect(
      createCraftState(catalog, { ...state(), baseId: b.id, sockets: [id('Snake Idol')] }).ok,
    ).toBe(false)
  }
  for (const patch of [
    { hidden: true },
    { runeforged: true },
    { variantList: ['x'] },
    { implicit: 'Has 2 Sockets' },
  ]) {
    expect(
      socketCandidates(
        {
          ...catalog,
          bases: catalog.bases.map((b) => (b.id === base.id ? { ...b, ...patch } : b)),
        },
        state(),
      ),
    ).toEqual([])
  }
})
it('四个无限量允许准确同模板总和，不能混淆对象条件、时长或符号', () => {
  for (const a of idols.filter((a) => a.limit === undefined)) {
    const s = {
      ...state(),
      sockets: [a.id, a.id],
      runeSourceLines: a.lines.map((l) => l.replace(/\d+/g, (n) => String(Number(n) * 2))),
    }
    expect(runeSocketContributionError(catalog, s)).toBe(null)
    expect(runeSocketContributionError(catalog, { ...s, runeSourceLines: a.lines })).not.toBe(null)
  }
  for (const [name, line] of [
    ['Carved Majesty', 'Minions gain Onslaught for 4 seconds on Hitting your Marked targets'],
    ['Carved Majesty', 'Companions gain Onslaught for 4 seconds on Hitting targets'],
    [
      'Carved Tenacity',
      'Enemies you Critically Hit get 160% reduced Life Regeneration Rate for 6.4 seconds',
    ],
    [
      'Carved Tenacity',
      'Enemies you Critically Hit get -160% reduced Life Regeneration Rate for 4 seconds',
    ],
    ['Carved Mischief', '+5% to maximum Block chance'],
  ])
    expect(
      runeSocketContributionError(catalog, {
        ...state(),
        sockets: [id(name as string)],
        runeSourceLines: [line as string],
      }),
    ).not.toBe(null)
})
it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s 真词典九雕像/普通符文混合恐惧增效回读', (locale) => {
  const dictionary = createCraftItemDictionary(
    catalog,
    Object.fromEntries(
      ['items', 'stats'].map((kind) => [
        kind,
        JSON.parse(
          readFileSync(
            new URL(
              `../../../data/dict/${locale === 'en' ? 'zh-CN' : locale}/${kind}.json`,
              import.meta.url,
            ),
            'utf8',
          ),
        ),
      ]),
    ),
  )
  for (const a of idols)
    for (const amplified of [false, true]) {
      const s = {
        ...state(),
        baseId: 'Adherent Cuffs',
        sockets: [a.id, 'pob2:augment:["Iron Rune","armour"]'],
      }
      const input = amplified ? horror(s) : s
      const exported = exportCraftItemText(catalog, input, { locale, dictionary })
      if (!exported.ok) throw Error(exported.error)
      if (locale !== 'en' && ['Carved Majesty', 'Carved Tenacity'].includes(a.name)) {
        expect(exported.value.text).not.toContain(
          a.name === 'Carved Majesty' ? 'Companions gain Onslaught' : 'Life Regeneration Rate',
        )
        expect(
          exported.value.warnings.filter((w) =>
            /Companions gain Onslaught|Life Regeneration Rate/.test(w),
          ),
        ).toEqual([])
      }
      const parsed = parseItem(exported.value.text)
      if (!parsed.ok) throw Error(parsed.error)
      const result = importCraftState(
        catalog,
        input.baseId,
        parsed.item,
        inspectItem(parsed.item, dictionary),
        input.sockets,
      )
      if (!result.ok) throw Error(`${locale} ${a.name} ${amplified}: ${result.error}`)
      expect(result.value.runeSourceLines).toEqual(
        socketEffects(catalog, input).flatMap((e) => e.augment.lines),
      )
      expect(result.value.sourceText).toBe(exported.value.text)
    }
})

it('已核对锻造手套沿用普通孔资格，圣化仍拒绝', () => {
  const b = catalog.bases.find(
    (b) =>
      b.type === 'Gloves' &&
      b.runeforged &&
      !b.hidden &&
      !b.variantList &&
      b.tags.includes('armour') &&
      b.tags.includes('runeforged'),
  )
  if (!b) throw Error('runeforged gloves missing')
  expect(
    createCraftState(catalog, { ...state(), baseId: b.id, sockets: [id('Snake Idol')] }).ok,
  ).toBe(true)
  expect(
    socketCandidates(catalog, { ...state(), sourceText: 'Sanctified' }).filter(
      (a) => a.type === 'Idol',
    ),
  ).toEqual([])
})
it('两独立限量和Ancient共享组替换排除当前孔，支持条件符文混合', () => {
  for (const name of ['Idol of Sirrius', 'Idol of Kraityn']) {
    const s = { ...state(), sockets: [id(name), null] }
    expect(
      applyCraftStep(catalog, s, { kind: 'socket', socketIndex: 1, augmentId: id(name) }).ok,
    ).toBe(false)
    expect(
      applyCraftStep(catalog, s, { kind: 'socket', socketIndex: 0, augmentId: id(name) }).ok,
    ).toBe(true)
  }
  expect(
    applyCraftStep(
      catalog,
      { ...state(), sockets: [id('Carved Majesty'), null] },
      { kind: 'socket', socketIndex: 0, augmentId: id('Carved Tenacity') },
    ).ok,
  ).toBe(true)
  expect(
    createCraftState(catalog, {
      ...state(),
      sockets: [id('Idol of Sirrius'), id('Idol of Kraityn')],
    }).ok,
  ).toBe(true)
  const conditional = catalog.augments?.find(
    (a) => a.name === 'Warding Rune of Protection' && a.category === 'armour',
  )
  if (!conditional) throw Error('conditional rune missing')
  const s = {
    ...state(),
    sockets: [id('Carved Majesty'), conditional.id],
    runeSourceLines: [
      ...(idols.find((a) => a.name === 'Carved Majesty')?.lines ?? []),
      ...conditional.lines,
    ],
  }
  expect(runeSocketContributionError(catalog, s)).toBe(null)
  expect(
    runeSocketContributionError(catalog, { ...s, runeSourceLines: s.runeSourceLines.slice(0, 1) }),
  ).not.toBe(null)
})
