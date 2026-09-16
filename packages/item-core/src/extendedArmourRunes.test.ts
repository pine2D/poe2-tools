import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { collectCraftCosts } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { estimateDefences } from './defences'
import { inspectItem } from './export'
import { parseItem } from './parse'
import type { CraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { isSupportedArmourRune, parseRuneEffectTotals, sumRuneEffects } from './runeEffects'
import { runeSocketContributionError } from './runeImport'
import { effectiveSocketAugment } from './socketAmplification'
import { socketCandidates, socketEffects } from './sockets'

const examples = [
  ['Lesser Rebirth Rune', 'Regenerate 0.35% of maximum Life per second'],
  ['Rebirth Rune', 'Regenerate 0.4% of maximum Life per second'],
  ['Greater Rebirth Rune', 'Regenerate 0.45% of maximum Life per second'],
  ['Perfect Rebirth Rune', 'Regenerate 0.5% of maximum Life per second'],
  ['Warding Rune of Reinforcement', '20% increased Runic Ward'],
] as const
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
function rune(name: string) {
  const augment = catalog.augments?.find((a) => a.id === id(name))
  if (!augment) throw Error(`缺少真实符文 ${name}`)
  return augment
}
const initial: CraftState = {
  baseId: 'Adherent Cuffs',
  itemLevel: 1,
  rarity: 'normal',
  affixes: [],
  sockets: [null, null],
  quality: 0,
  sourceText: null,
}

it.each(examples)('%s 可镶入、重复及覆盖，独立计费和核对', (name, line) => {
  const augmentId = id(name)
  expect(socketCandidates(catalog, initial).find((a) => a.id === augmentId)?.lines).toEqual([line])
  const one = applyCraftStep(catalog, initial, { kind: 'socket', socketIndex: 0, augmentId })
  if (!one.ok) throw Error(one.error)
  const two = applyCraftStep(catalog, one.value, { kind: 'socket', socketIndex: 1, augmentId })
  if (!two.ok) throw Error(two.error)
  expect(socketEffects(catalog, two.value).map((s) => s.augment.lines)).toEqual([[line], [line]])
  expect(
    runeSocketContributionError(catalog, { ...two.value, runeSourceLines: [line, line] }),
  ).toBeNull()
  expect(
    collectCraftCosts(catalog, [
      { kind: 'socket', socketIndex: 0, augmentId },
      { kind: 'socket', socketIndex: 1, augmentId },
    ]),
  ).toEqual({ ok: true, value: [{ id: `augment:${name}`, name, count: 2 }] })
  if (name.includes('Rebirth'))
    expect(estimateDefences(catalog, two.value)).toEqual(estimateDefences(catalog, initial))
  const replaced = applyCraftStep(catalog, two.value, {
    kind: 'socket',
    socketIndex: 0,
    augmentId: id('Desert Rune'),
  })
  if (!replaced.ok) throw Error(replaced.error)
  expect(socketEffects(catalog, replaced.value)[0]?.augment.lines).toEqual([
    '+14% to Fire Resistance',
  ])
  expect(initial.sockets).toEqual([null, null])
})

it('恐惧逐枚逐值取整，绑定能力不生效，移除工艺恢复普通效果', () => {
  const expected = [
    'Regenerate 0.55% of maximum Life per second',
    'Regenerate 0.63% of maximum Life per second',
    'Regenerate 0.72% of maximum Life per second',
    'Regenerate 0.8% of maximum Life per second',
    '32% increased Runic Ward',
  ]
  for (const [index, [name]] of examples.entries()) {
    const state: CraftState = {
      ...initial,
      baseId: 'Adherent Cuffs',
      itemLevel: 86,
      rarity: 'rare',
      affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }],
      sockets: [id(name), id(name)],
    }
    const result = applyCraftStep(catalog, state, {
      kind: 'essence',
      essenceId: 'Metadata/Items/Currency/CurrencyCorruptedEssenceHorror',
      removeModId: 'IncreasedLife1',
      values: [],
    })
    if (!result.ok) throw Error(result.error)
    expect(socketEffects(catalog, result.value).map((s) => s.augment.lines)).toEqual([
      [expected[index]],
      [expected[index]],
    ])
    expect(
      runeSocketContributionError(catalog, {
        ...result.value,
        runeSourceLines: [expected[index] as string, expected[index] as string],
      }),
    ).toBeNull()
    const removed = applyCraftStep(catalog, result.value, {
      currency: 'annulment',
      modIds: [],
      removeModId: 'EssenceLocalRuneAndSoulCoreEffect1',
    })
    if (!removed.ok) throw Error(removed.error)
    expect(socketEffects(catalog, removed.value)).toEqual(socketEffects(catalog, state))
  }
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s独立词典导出回读五种普通和增效符文，保留来源合计',
  (locale) => {
    const dictionary = createCraftItemDictionary(
      catalog,
      locale === 'en'
        ? {}
        : {
            items: JSON.parse(
              readFileSync(
                new URL(`../../../data/dict/${locale}/items.json`, import.meta.url),
                'utf8',
              ),
            ),
            stats: JSON.parse(
              readFileSync(
                new URL(`../../../data/dict/${locale}/stats.json`, import.meta.url),
                'utf8',
              ),
            ),
          },
    )
    for (const [name] of examples)
      for (const horror of [false, true]) {
        const state: CraftState = {
          ...initial,
          baseId: 'Adherent Cuffs',
          itemLevel: 86,
          rarity: 'rare',
          sockets: [id(name), id(name)],
          affixes: horror
            ? [
                {
                  modId: 'EssenceLocalRuneAndSoulCoreEffect1',
                  crafted: true,
                  lines: ['60% increased effect of Socketed Augment Items'],
                },
              ]
            : [],
        }
        const output = exportCraftItemText(catalog, state, { locale, dictionary })
        if (!output.ok) throw Error(output.error)
        const parsed = parseItem(output.value.text)
        if (!parsed.ok) throw Error(parsed.error)
        const imported = importCraftState(
          catalog,
          state.baseId,
          parsed.item,
          inspectItem(parsed.item, dictionary),
          state.sockets,
          undefined,
          dictionary.stats?.entries,
        )
        if (!imported.ok) throw Error(`${locale} ${name} ${horror}: ${imported.error}`)
        expect(imported.value.sourceText).toBe(output.value.text)
        expect(imported.value.runeSourceLines).toEqual(
          socketEffects(catalog, state).flatMap((s) => s.augment.lines),
        )
        expect(imported.value.sockets).toEqual(state.sockets)
        expect(socketEffects(catalog, imported.value)).toEqual(socketEffects(catalog, state))
      }
  },
)

it('小数百分数以百分之一网格精确合计，不扩大其他整数效果', () => {
  expect(
    parseRuneEffectTotals([
      'Regenerate 0.55% of maximum Life per second',
      'Regenerate 0.63% of maximum Life per second',
    ]),
  ).toMatchObject({ LifeRegeneration: 1.18, WardIncreased: 0 })
  expect(parseRuneEffectTotals(['20% increased Runic Ward'])).toMatchObject({
    WardIncreased: 20,
    Defences: 0,
  })
  for (const line of [
    'Regenerate 0.001% of maximum Life per second',
    'Regenerate 0% of maximum Life per second',
    '8.5% increased Runic Ward',
    '+0.5 to maximum Life',
    'Regenerate 90071992547409.92% of maximum Life per second',
  ])
    expect(parseRuneEffectTotals([line])).toBeNull()
})

it('五种符文拒绝错误身份、额外行、绑定及限制', () => {
  for (const [name] of examples) {
    const augment = rune(name)
    for (const patch of [
      { category: 'weapon' },
      { type: 'SoulCore' as const },
      { localMod: !augment.localMod },
      { limit: 1 },
      { limitId: 'shared' },
      { isSocketBound: true },
      { name: 'Unknown Rune' },
      { lines: [...augment.lines, ...(augment.bonded?.lines ?? [])] },
    ])
      expect(isSupportedArmourRune({ ...augment, ...patch })).toBe(false)
  }
})

it('结界提高与真实本地提高相加、品质独立乘算，单独提高不生成结界', () => {
  const ward = (state: CraftState, source = catalog) => {
    const result = estimateDefences(source, state)
    if (!result.ok) throw Error(result.error)
    return result.value.find((entry) => entry.stat === 'Ward')
  }
  const forged = { ...catalog, alloys: JSON.parse(readFileSync('data/craft/alloys.json', 'utf8')) }
  const state: CraftState = {
    ...initial,
    baseId: 'Runeforged Adherent Cuffs',
    itemLevel: 86,
    rarity: 'rare',
    quality: 20,
    sockets: [id('Perfect Ward Rune'), id('Warding Rune of Reinforcement')],
  }
  expect(ward(state)).toMatchObject({
    base: 134,
    flat: 30,
    increased: 20,
    runeIncreased: 20,
    value: 236,
  })
  expect(
    ward({
      ...state,
      affixes: [
        {
          modId: 'EssenceLocalRuneAndSoulCoreEffect1',
          crafted: true,
          lines: ['60% increased effect of Socketed Augment Items'],
        },
      ],
    }),
  ).toMatchObject({ base: 134, flat: 48, increased: 32, runeIncreased: 32, value: 288 })
  expect(
    ward(
      {
        ...state,
        affixes: [
          {
            modId: 'AlloyLocalWardIncreasePercent1',
            crafted: true,
            lines: ['30(24-30)% increased Runic Ward'],
          },
        ],
      },
      forged,
    ),
  ).toMatchObject({ increased: 50, runeIncreased: 20, value: 295 })
  expect(ward({ ...initial, sockets: [id('Warding Rune of Reinforcement')] })).toBeUndefined()
  const { quality: _, ...unknownQuality } = state
  expect(estimateDefences(catalog, unknownQuality).ok).toBe(false)
  const { sockets: __, ...unknownSockets } = state
  expect(estimateDefences(catalog, { ...unknownSockets, sourceText: '来源' }).ok).toBe(false)
})

it('生命再生增效需要原始行的精确声明与固定来源，0增效保持原值', () => {
  const augment = rune('Rebirth Rune')
  const pattern = augment.lines[0] as string
  const state: CraftState = {
    ...initial,
    rarity: 'rare',
    itemLevel: 86,
    affixes: [
      {
        modId: 'EssenceLocalRuneAndSoulCoreEffect1',
        crafted: true,
        lines: ['60% increased effect of Socketed Augment Items'],
      },
    ],
  }
  const metadata = [{ scalable: true, formats: ['per_minute_to_per_second_2dp_if_required'] }]
  const valid = { ...catalog, scalability: { ...catalog.scalability, [pattern]: metadata } }
  expect(effectiveSocketAugment(valid, state, augment)?.lines).toEqual([
    'Regenerate 0.63% of maximum Life per second',
  ])
  for (const declaration of [
    undefined,
    [],
    [{ scalable: false, formats: metadata[0]?.formats ?? [] }],
    [{ scalable: true, formats: [] }],
    [{ scalable: true, formats: ['per_minute_to_per_second'] }],
    [{ scalable: true, formats: [...(metadata[0]?.formats ?? []), 'negate'] }],
  ]) {
    const broken = structuredClone(valid)
    if (declaration === undefined) delete broken.scalability[pattern]
    else broken.scalability[pattern] = declaration
    expect(effectiveSocketAugment(broken, state, augment)).toBeNull()
    expect(effectiveSocketAugment(broken, initial, augment)).toBe(augment)
  }
  const badHash = structuredClone(valid)
  const source = badHash._meta.sources.find(
    (source) => source.path === 'src/Data/ModScalability.lua',
  )
  if (!source) throw Error('缺少缩放来源')
  source.sha256 = 'wrong'
  expect(effectiveSocketAugment(badHash, state, augment)).toBeNull()
  const impossible = { ...augment, lines: ['Regenerate 0.41% of maximum Life per second'] }
  const impossibleCatalog = {
    ...valid,
    augments: (valid.augments ?? []).map((a) => (a.id === augment.id ? impossible : a)),
    scalability: { ...valid.scalability, [impossible.lines[0] as string]: metadata },
  }
  expect(effectiveSocketAugment(impossibleCatalog, state, impossible)).toBeNull()
})

it('增效后的显示值按枚精确求和并保持百分数单位', () => {
  const augments = ['Lesser Rebirth Rune', 'Rebirth Rune'].map((name) => ({
    ...rune(name),
    lines: [`Regenerate ${name.startsWith('Lesser') ? 0.55 : 0.63}% of maximum Life per second`],
  }))
  expect(sumRuneEffects(augments)?.LifeRegeneration).toBe(1.18)
  const state: CraftState = {
    ...initial,
    rarity: 'rare',
    itemLevel: 86,
    sockets: augments.map((a) => a.id),
    affixes: [
      {
        modId: 'EssenceLocalRuneAndSoulCoreEffect1',
        crafted: true,
        lines: ['60% increased effect of Socketed Augment Items'],
      },
    ],
  }
  expect(
    runeSocketContributionError(catalog, {
      ...state,
      runeSourceLines: ['Regenerate 1.18% of maximum Life per second'],
    }),
  ).toBeNull()
  expect(
    runeSocketContributionError(catalog, {
      ...state,
      runeSourceLines: ['Regenerate 1.2% of maximum Life per second'],
    }),
  ).toContain('1.18%')
})
