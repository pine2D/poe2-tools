import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { catalog as primary } from './catalystTestFixture'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { estimateDefences } from './defences'
import { inspectItem } from './export'
import { readCraftProperty } from './itemProperties'
import { parseItem } from './parse'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'

const catalog = {
  ...primary,
  alloys: JSON.parse(readFileSync('data/craft/alloys.json', 'utf8')),
}
const initial: CraftState = {
  baseId: 'Runeforged Adherent Cuffs',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  quality: 0,
  sockets: [],
  sourceText: null,
}
function must<T>(r: CraftResult<T>): T {
  if (!r.ok) throw Error(r.error)
  return r.value
}
const values = (state: CraftState) => must(estimateDefences(catalog, state)).map((v) => v.value)

it('已有锻造手套可制作，基底不除来源品质，结界单独受本地与品质增幅', () => {
  expect(createCraftState(catalog, initial).ok).toBe(true)
  expect(values(initial)).toEqual([39, 11, 134])
  const quality = { ...initial, quality: 20 }
  expect(values(quality)).toEqual([47, 13, 161])
  const alloy: CraftState = {
    ...quality,
    rarity: 'rare',
    affixes: [
      {
        modId: 'AlloyLocalWardIncreasePercent1',
        crafted: true,
        lines: ['30(24-30)% increased Runic Ward'],
      },
    ],
  }
  expect(values(alloy)).toEqual([47, 13, 209])
  const drilled = must(applyCraftStep(catalog, alloy, { kind: 'artificer' }))
  const socketed = must(
    applyCraftStep(catalog, drilled, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: 'pob2:augment:["Perfect Iron Rune","armour"]',
    }),
  )
  expect(values(socketed)).toEqual([56, 16, 209])
  expect(readCraftProperty(catalog, socketed, 'Ward')).toEqual({ ok: true, value: 209 })
  expect(initial.sockets).toEqual([])
})

it('固有结界读取当前值，未知固有与未知品质/孔位不代零', () => {
  const base = { ...initial, baseId: 'Runeforged Champion Cuirass', quality: 20 }
  expect(estimateDefences(catalog, base).ok).toBe(false)
  expect(values({ ...base, implicitLines: ['+800(750-1000) to maximum Runic Ward'] })).toEqual([
    960,
  ])
  const { quality: _, ...unknownQuality } = initial
  expect(estimateDefences(catalog, unknownQuality).ok).toBe(false)
  const { sockets: __, ...unknownSockets } = initial
  expect(estimateDefences(catalog, { ...unknownSockets, sourceText: '来源观察' }).ok).toBe(false)
})

it('没有结界属性不臆造；再生固有不增加最大结界', () => {
  const missing = { ...initial, baseId: 'Runeforged Conqueror Plate' }
  expect(values(missing)).toEqual([595])
  expect(readCraftProperty(catalog, missing, 'Ward').ok).toBe(false)
  const regen = { ...initial, baseId: 'Runeforged Flowing Raiment' }
  expect(values(regen)).toEqual([91, 236])
})

it('所有478普通锻造防具使用本身身份，特殊跨词缀池和隐藏武器仍拒绝', () => {
  const bases = catalog.bases.filter(
    (b) =>
      b.runeforged &&
      !b.hidden &&
      ['Helmet', 'Body Armour', 'Gloves', 'Boots', 'Shield', 'Focus', 'Buckler'].includes(b.type) &&
      !/Can roll .+ Modifiers|Catalysts can be applied/.test(b.implicit ?? ''),
  )
  expect(bases).toHaveLength(478)
  for (const base of bases) {
    const result = createCraftState(catalog, { ...initial, baseId: base.id })
    expect(result.ok, base.id).toBe(true)
  }
  expect(createCraftState(catalog, { ...initial, baseId: "Runefather's Grasping Mail" }).ok).toBe(
    false,
  )
  for (const base of catalog.bases.filter((b) => b.runeforged && (b.hidden || b.type === 'Wand'))) {
    expect(createCraftState(catalog, { ...initial, baseId: base.id }).ok, base.id).toBe(false)
  }
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 普通通货后导出和回读保留锻造身份、品质与孔位',
  (locale) => {
    const dictionary = createCraftItemDictionary(
      catalog,
      locale === 'en'
        ? {}
        : {
            items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
            stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
          },
    )
    const crafted = must(
      applyCraftStep(catalog, initial, {
        currency: 'transmutation',
        modIds: ['IncreasedLife1'],
        rolls: [{ modId: 'IncreasedLife1', values: [15] }],
      }),
    )
    const output = must(exportCraftItemText(catalog, crafted, { locale, dictionary })).text
    const wardLabel = { en: 'Runic Ward', 'zh-CN': '符文结界', 'zh-TW': '符文結界' }[locale]
    // 面板是独立观察值，故意与估算不同，不能反推或覆盖基底和品质。
    const observed = `${wardLabel}: 999 (augmented)`
    const text = output.replace('--------', `--------\n${observed}\n--------`)
    const parsed = parseItem(text)
    if (!parsed.ok) throw Error(parsed.error)
    expect(
      parsed.item.blocks.some(
        (block) => block.kind === 'properties' && block.lines.some((line) => line.raw === observed),
      ),
    ).toBe(true)
    const restored = must(
      importCraftState(
        catalog,
        crafted.baseId,
        parsed.item,
        inspectItem(parsed.item, dictionary),
        [],
        undefined,
        dictionary.stats?.entries,
      ),
    )
    expect(restored.baseId).toBe(initial.baseId)
    expect(restored.quality).toBe(0)
    expect(restored.affixes).toEqual(crafted.affixes)
    expect(values(restored)).toEqual([39, 11, 134])
  },
)

it('条件攻速与格挡回复不增加最大结界，陌生结界模型保持未知', () => {
  const conditional: CraftState = {
    ...initial,
    rarity: 'rare',
    affixes: [
      {
        modId: 'AlloyAttackSpeedIfMissingWardRecently1',
        crafted: true,
        lines: ['12(10-15)% increased Attack Speed while missing Runic Ward'],
      },
    ],
  }
  expect(values(conditional)).toEqual([39, 11, 134])
  const shield = catalog.bases.find(
    (base) =>
      base.type === 'Shield' &&
      base.runeforged &&
      !base.hidden &&
      base.properties.Ward !== undefined,
  )
  if (!shield) throw Error('缺少锻造盾牌')
  const plain = { ...initial, baseId: shield.id }
  const recover: CraftState = {
    ...plain,
    rarity: 'rare',
    affixes: [
      {
        modId: 'AlloyRunicWardOnBlock1',
        crafted: true,
        lines: ['Recover 12(10-15) Runic Ward when you Block'],
      },
    ],
  }
  expect(values(recover)).toEqual(values(plain))
  const changed = {
    ...catalog,
    modifiers: catalog.modifiers.map((mod) =>
      mod.id === 'AlloyAttackSpeedIfMissingWardRecently1'
        ? { ...mod, group: 'UnknownWardRule' }
        : mod,
    ),
  }
  expect(estimateDefences(changed, conditional).ok).toBe(false)
})

it('伪造runeforged标记而缺类别或来源标签不能解锁普通制作', () => {
  const base = catalog.bases.find((b) => b.id === initial.baseId)
  if (!base) throw Error('缺少基底')
  for (const removed of ['armour', 'gloves', 'runeforged']) {
    const changed = {
      ...catalog,
      bases: [{ ...base, tags: base.tags.filter((tag) => tag !== removed) }],
    }
    expect(createCraftState(changed, initial).ok).toBe(false)
  }
})
