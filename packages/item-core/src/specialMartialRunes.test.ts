import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { catalog as primary } from './catalystTestFixture'
import { socketLimitWarnings } from './conditionalArmourRunes'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { runeSocketContributionError } from './runeImport'
import { effectiveSocketAugment } from './socketAmplification'
import { socketCandidates } from './sockets'
import { estimateWeaponStats } from './weaponStats'

const catalog = {
  ...primary,
  alloys: JSON.parse(
    readFileSync(new URL('../../../data/craft/alloys.json', import.meta.url), 'utf8'),
  ),
}
const names = [
  'Ancient Rune of Animosity',
  'Rune of Vital Flame',
  'Legacy of Amor Mandragora',
  'Legacy of Spiteful Floret',
]
const id = (name: string, category = 'talisman') =>
  `pob2:augment:${JSON.stringify([name, category])}`
const runes = required(catalog.augments).filter((a) => names.includes(a.name))
const dictionaries = Object.fromEntries(
  ['zh-CN', 'zh-TW'].map((locale) => [
    locale,
    createCraftItemDictionary(catalog, {
      items: JSON.parse(
        readFileSync(new URL(`../../../data/dict/${locale}/items.json`, import.meta.url), 'utf8'),
      ),
      stats: JSON.parse(
        readFileSync(new URL(`../../../data/dict/${locale}/stats.json`, import.meta.url), 'utf8'),
      ),
    }),
  ]),
)
function state(baseId = 'Changeling Talisman'): CraftState {
  return {
    baseId,
    rarity: 'rare',
    itemLevel: 86,
    sourceText: null,
    quality: 0,
    sockets: [null, null],
    affixes: [],
  }
}
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function socket(s: CraftState, name: string, index = 0) {
  return applyCraftStep(catalog, s, { kind: 'socket', socketIndex: index, augmentId: id(name) })
}

it('六声明仅在对应普通魔符或单/双手锤开放，不借宽泛flags开放其他部位', () => {
  expect(runes).toHaveLength(6)
  for (const rune of runes) {
    const base = required(
      catalog.bases.find(
        (b) => !b.hidden && !b.runeforged && b.type.toLowerCase() === rune.category,
      ),
    )
    const s = state(base.id)
    expect(socketCandidates(catalog, s).some((a) => a.id === rune.id)).toBe(true)
    expect(createCraftState(catalog, { ...s, sockets: [rune.id] }).ok).toBe(true)
    const sword = required(
      catalog.bases.find((b) => !b.hidden && !b.runeforged && b.type === 'Two Hand Sword'),
    )
    expect(createCraftState(catalog, { ...state(sword.id), sockets: [rune.id] }).ok).toBe(false)
    for (const patch of [
      { localMod: true },
      { limit: 2 },
      { lines: ['Adds 99 to 99 Fire Damage'] },
    ])
      expect(
        createCraftState(
          { ...catalog, augments: [{ ...rune, ...patch }] },
          { ...s, sockets: [rune.id] },
        ).ok,
      ).toBe(false)
  }
})

it('Vital Flame本地火伤只计一次，费用/怒火/触发效果不改变武器伤害', () => {
  const plain = must(estimateWeaponStats(catalog, state()))
  const vital = must(socket(state(), names[1] as string))
  const panel = must(estimateWeaponStats(catalog, vital))
  expect(panel.damage.Fire.min).toBe(13)
  expect(panel.damage.Fire.max).toBe(16)
  expect(panel.physicalDps).toBe(plain.physicalDps)
  for (const name of [names[0], names[2], names[3]]) {
    const changed = must(socket(state(), name as string))
    expect(must(estimateWeaponStats(catalog, changed))).toEqual(plain)
  }
})

it('新增单枚限量与Legacy共享限量排除被替换孔，已有重复保留观察并可修复', () => {
  const amor = names[2] as string,
    spite = names[3] as string
  const first = must(socket(state(), amor))
  expect(socket(first, spite, 1).ok).toBe(false)
  expect(socket(first, amor, 1).ok).toBe(false)
  expect(socket(first, spite, 0).ok).toBe(true)
  const duplicate = { ...state(), sockets: [id(amor), id(spite)] }
  expect(createCraftState(catalog, duplicate).ok).toBe(true)
  expect(socketLimitWarnings(catalog, duplicate)).toEqual([
    expect.objectContaining({ count: 2, limit: 1, exceeded: true }),
  ])
  expect(socket(duplicate, names[0] as string, 1).ok).toBe(true)
  const vital = must(socket(state(), names[1] as string))
  expect(socket(vital, names[1] as string, 1).ok).toBe(false)
})

it('Sovereign逐占位增效，不改变怒火阈值；错误scalability拒绝', () => {
  const s = {
    ...state(),
    affixes: [
      {
        modId: 'AlloyEffectOfSocketedAugments1',
        crafted: true as const,
        lines: ['30% increased effect of Socketed Augment Items'],
      },
    ],
  }
  const expected = [
    ['Gain 2 Druidic Prowess when you Heavy Stun a Rare or Unique Enemy'],
    ['Adds 16 to 20 Fire Damage', '19% of Skill Mana Costs Converted to Life Costs'],
    ['Gain 1 Druidic Prowess for every 20 total Rage spent'],
    ['Every 5 Rage also grants 6% of Damage taken Recouped as Life'],
  ]
  for (const [i, name] of names.entries()) {
    const result = must(socket(s, name))
    const rune = required(runes.find((a) => a.id === id(name)))
    expect(effectiveSocketAugment(catalog, result, rune)?.lines).toEqual(expected[i])
    expect(estimateWeaponStats(catalog, result).ok).toBe(true)
    expect(createCraftState({ ...catalog, scalability: {} }, result).ok).toBe(false)
  }
})

it('条件导入按完整多重集合核对，Vital火点伤与普通火符文仍可合计', () => {
  const s = must(socket(state(), names[1] as string))
  const desert = required(
    catalog.augments?.find((a) => a.name === 'Desert Rune' && a.category === 'weapon'),
  )
  const withDesert = must(
    createCraftState(catalog, { ...s, sockets: [id(names[1] as string), desert.id] }),
  )
  const panel = must(estimateWeaponStats(catalog, withDesert))
  const source = [
    `Adds ${panel.damage.Fire.runeMin} to ${panel.damage.Fire.runeMax} Fire Damage`,
    '15% of Skill Mana Costs Converted to Life Costs',
  ]
  expect(
    runeSocketContributionError(catalog, { ...withDesert, runeSourceLines: source }),
  ).toBeNull()
  for (const lines of [
    source.slice(0, 1),
    [...source, source[1] as string],
    [source[0] as string, '16% of Skill Mana Costs Converted to Life Costs'],
  ])
    expect(
      runeSocketContributionError(catalog, { ...withDesert, runeSourceLines: lines }),
    ).not.toBeNull()
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s 当前有效符文完整文本回读并保留来源', (locale) => {
  const dictionary = required(dictionaries[locale === 'en' ? 'zh-CN' : locale])
  for (const name of [names[1], names[2], names[3]]) {
    const s = must(
      socket(
        {
          ...state(),
          affixes: [
            {
              modId: 'AlloyEffectOfSocketedAugments1',
              crafted: true,
              lines: ['30% increased effect of Socketed Augment Items'],
            },
          ],
        },
        name as string,
      ),
    )
    const text = must(exportCraftItemText(catalog, s, { locale, dictionary })).text
    const parsed = parseItem(text)
    if (!parsed.ok) throw Error(parsed.error)
    const imported = must(
      importCraftState(
        catalog,
        s.baseId,
        parsed.item,
        inspectItem(parsed.item, dictionary),
        s.sockets,
      ),
    )
    expect(imported.sourceText).toBe(text)
    expect(imported.sockets).toEqual(s.sockets)
    expect(imported.runeSourceLines).toEqual(
      required(
        effectiveSocketAugment(
          catalog,
          s,
          required(runes.find((a) => a.id === id(name as string))),
        ),
      ).lines,
    )
  }
})
