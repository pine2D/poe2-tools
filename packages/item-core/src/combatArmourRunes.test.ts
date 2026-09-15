import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
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
  ['Lesser Tempered Rune', '6 to 9 Physical Thorns damage'],
  ['Tempered Rune', '14 to 21 Physical Thorns damage'],
  ['Greater Tempered Rune', '31 to 52 Physical Thorns damage'],
  ['Greater Rune of Tithing', '1 to 100 Lightning Thorns damage'],
  ['Greater Rune of Leadership', 'Minions take 10% of Physical Damage as Lightning Damage'],
  ['Greater Rune of Alacrity', 'Debuffs on you expire 8% faster'],
  ['Greater Rune of Nobility', '10% reduced effect of Shock on you'],
] as const
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
const initial: CraftState = {
  baseId: 'Rusted Greathelm',
  itemLevel: 1,
  rarity: 'normal',
  affixes: [],
  sockets: [null, null],
  quality: 0,
  sourceText: null,
}

it.each(examples)('%s 可镶入、重复及覆盖，效果不混入防御面板', (name, line) => {
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

it('荆棘两端、元素、召唤生物承伤和减益效果分别求和', () => {
  const totals = parseRuneEffectTotals(examples.map(([, line]) => line))
  expect(totals).toMatchObject({
    PhysicalThornsMin: 51,
    PhysicalThornsMax: 82,
    LightningThornsMin: 1,
    LightningThornsMax: 100,
    MinionPhysicalAsLightning: 10,
    DebuffExpiry: 8,
    ShockReduction: 10,
    Defences: 0,
  })
  const error = runeSocketContributionError(catalog, {
    ...initial,
    sockets: [id('Tempered Rune')],
    runeSourceLines: ['14 to 22 Physical Thorns damage'],
  })
  expect(error).toContain('不一致')
  expect(error).toContain('22')
  expect(error).not.toContain('22%')
})

it('不接受反向伤害两端、错类型、错名字、未知附加行或限制', () => {
  for (const line of [
    '9 to 6 Physical Thorns damage',
    '1 to 0 Lightning Thorns damage',
    '1.5 to 9 Physical Thorns damage',
    '9007199254740992 to 9007199254740992 Physical Thorns damage',
    'Minions take 10% of Physical Damage as Fire Damage',
  ])
    expect(parseRuneEffectTotals([line])).toBeNull()
  const augment = catalog.augments?.find((a) => a.id === id('Greater Rune of Leadership'))
  if (!augment) throw Error('缺少来源')
  for (const patch of [
    { category: 'weapon' },
    { localMod: true },
    { limit: 1 },
    { limitId: 'shared' },
    { isSocketBound: true },
    { name: 'Greater Rune of Nobility' },
    { lines: [...augment.lines, ...(augment.bonded?.lines ?? [])] },
  ])
    expect(isSupportedArmourRune({ ...augment, ...patch })).toBe(false)
})

it('恐惧逐枚逐值取整，绑定能力不生效，移除工艺恢复普通效果', () => {
  const expected = [
    '9 to 14 Physical Thorns damage',
    '22 to 33 Physical Thorns damage',
    '49 to 83 Physical Thorns damage',
    '1 to 160 Lightning Thorns damage',
    'Minions take 16% of Physical Damage as Lightning Damage',
    'Debuffs on you expire 12% faster',
    '16% reduced effect of Shock on you',
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
  '%s独立词典导出回读七种普通和增效符文，不丢伤害两端及主体',
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
