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
import { isSupportedArmourRune, parseRuneEffectTotals } from './runeEffects'
import { runeSocketContributionError } from './runeImport'
import { socketCandidates, socketEffects } from './sockets'

const examples = [
  ['Lesser Ward Rune', '+15 to maximum Runic Ward'],
  ['Ward Rune', '+20 to maximum Runic Ward'],
  ['Greater Ward Rune', '+25 to maximum Runic Ward'],
  ['Perfect Ward Rune', '+30 to maximum Runic Ward'],
  ['Lesser Charging Rune', '8% increased Runic Ward Regeneration Rate'],
  ['Charging Rune', '12% increased Runic Ward Regeneration Rate'],
  ['Greater Charging Rune', '16% increased Runic Ward Regeneration Rate'],
  ['Perfect Charging Rune', '20% increased Runic Ward Regeneration Rate'],
] as const
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
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
  if (name.includes('Charging'))
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

it('最大结界与再生分别求和，单位分开且拒绝不完整语义', () => {
  expect(parseRuneEffectTotals(examples.map(([, line]) => line))).toMatchObject({
    Ward: 90,
    WardRegeneration: 56,
    Defences: 0,
  })
  const error = runeSocketContributionError(catalog, {
    ...initial,
    sockets: [id('Ward Rune')],
    runeSourceLines: ['+21 to maximum Runic Ward'],
  })
  expect(error).toContain('21')
  expect(error).not.toContain('21%')
  for (const line of [
    '+0 to maximum Runic Ward',
    '+1.5 to maximum Runic Ward',
    '+9007199254740992 to maximum Runic Ward',
    '8% increased Runic Ward',
    'Regenerate 10 Runic Ward per second',
  ])
    expect(parseRuneEffectTotals([line])).toBeNull()
  for (const [name] of examples) {
    const augment = catalog.augments?.find((a) => a.id === id(name))
    if (!augment) throw Error('缺少符文')
    for (const patch of [
      { category: 'weapon' },
      { type: 'SoulCore' as const },
      { localMod: !augment.localMod },
      { limit: 1 },
      { limitId: 'shared' },
      { isSocketBound: true },
      { name: 'Unknown Ward Rune' },
      { lines: [...augment.lines, ...(augment.bonded?.lines ?? [])] },
      {
        lines: [
          name.includes('Charging')
            ? '+20 to maximum Runic Ward'
            : '12% increased Runic Ward Regeneration Rate',
        ],
      },
    ])
      expect(isSupportedArmourRune({ ...augment, ...patch })).toBe(false)
  }
})

it('恐惧逐枚逐值取整，绑定能力不生效，移除工艺恢复普通效果', () => {
  const expected = [
    '+24 to maximum Runic Ward',
    '+32 to maximum Runic Ward',
    '+40 to maximum Runic Ward',
    '+48 to maximum Runic Ward',
    '12% increased Runic Ward Regeneration Rate',
    '19% increased Runic Ward Regeneration Rate',
    '25% increased Runic Ward Regeneration Rate',
    '32% increased Runic Ward Regeneration Rate',
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
    if (name === 'Lesser Charging Rune')
      expect(
        parseRuneEffectTotals(socketEffects(catalog, result.value).flatMap((s) => s.augment.lines)),
      ).toMatchObject({ Ward: 0, WardRegeneration: 24 })
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
  '%s独立词典导出回读八种普通和增效符文，保留来源合计',
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
        expect(imported.value.sockets).toEqual(state.sockets)
        expect(socketEffects(catalog, imported.value)).toEqual(socketEffects(catalog, state))
      }
  },
)

it('普通底子从符文获得结界，最后一枚覆盖后消失；品质与本地提高独立乘算', () => {
  const ward = (state: CraftState, source = catalog) => {
    const result = estimateDefences(source, state)
    if (!result.ok) throw Error(result.error)
    return result.value.find((entry) => entry.stat === 'Ward')
  }
  const state = {
    ...initial,
    quality: 20,
    sockets: [id('Perfect Ward Rune'), id('Perfect Iron Rune')],
  }
  expect(ward(state)).toMatchObject({
    base: 0,
    flat: 30,
    increased: 0,
    runeIncreased: 0,
    value: 36,
  })
  const removed = applyCraftStep(catalog, state, {
    kind: 'socket',
    socketIndex: 0,
    augmentId: id('Perfect Charging Rune'),
  })
  if (!removed.ok) throw Error(removed.error)
  expect(ward(removed.value)).toBeUndefined()
  const forged = { ...catalog, alloys: JSON.parse(readFileSync('data/craft/alloys.json', 'utf8')) }
  const local: CraftState = {
    ...state,
    baseId: 'Runeforged Adherent Cuffs',
    itemLevel: 86,
    rarity: 'rare',
    affixes: [
      {
        modId: 'AlloyLocalWardIncreasePercent1',
        crafted: true,
        lines: ['30(24-30)% increased Runic Ward'],
      },
    ],
  }
  expect(ward(local, forged)).toMatchObject({ base: 134, flat: 30, increased: 30, value: 256 })
  expect(
    ward(
      {
        ...local,
        affixes: [
          {
            modId: 'EssenceLocalRuneAndSoulCoreEffect1',
            crafted: true,
            lines: ['60% increased effect of Socketed Augment Items'],
          },
        ],
      },
      forged,
    ),
  ).toMatchObject({ flat: 48, increased: 0, value: 218 })
  // 真实目录两项均为工艺，不能并存；用同语义普通本地词缀独立核对乘算公式。
  expect(
    ward(
      {
        ...local,
        affixes: [
          ...local.affixes.map(({ crafted: _, ...affix }) => affix),
          {
            modId: 'EssenceLocalRuneAndSoulCoreEffect1',
            crafted: true,
            lines: ['60% increased effect of Socketed Augment Items'],
          },
        ],
      },
      {
        ...forged,
        modifiers: forged.modifiers.map((mod) =>
          mod.id === 'AlloyLocalWardIncreasePercent1'
            ? { ...mod, eligibility: [{ tag: 'default', value: 1 }] }
            : mod,
        ),
      },
    ),
  ).toMatchObject({ flat: 48, value: 284 })
  expect(
    ward({
      ...state,
      baseId: 'Runeforged Champion Cuirass',
      implicitLines: ['+800(750-1000) to maximum Runic Ward'],
    }),
  ).toMatchObject({ flat: 830, value: 996 })
  const { quality: _, ...unknownQuality } = state
  expect(estimateDefences(catalog, unknownQuality).ok).toBe(false)
  const { sockets: __, ...unknownSockets } = state
  expect(estimateDefences(catalog, { ...unknownSockets, sourceText: '来源' }).ok).toBe(false)
})
