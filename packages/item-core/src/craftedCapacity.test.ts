import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { prepareAlloyCraft } from './alloyCraft'
import { isAlloyMappedMod } from './alloys'
import { alloyTestFixture } from './alloyTestFixture'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { craftedModifierCapacity } from './craftedCapacity'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { prepareEssenceCraft } from './essenceCraft'
import { isEssenceMappedMod } from './essences'
import { inspectItem } from './export'
import { prepareExtractionCraft } from './extraction'
import { parseItem } from './parse'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { runeSocketContributionError } from './runeImport'
import { socketCandidates, socketEffects } from './sockets'

const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog = { ...primary, alloys: alloyTestFixture() }
const id = (category: string) => `pob2:augment:${JSON.stringify(["Astrid's Creativity", category])}`
const initial: CraftState = {
  baseId: 'Volatile Wand',
  itemLevel: 86,
  rarity: 'magic',
  sourceText: null,
  sockets: [null, null],
  affixes: [{ modId: 'SpellDamageOnWeapon1', lines: ['30% increased Spell Damage'] }],
}
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function twoCrafts() {
  const socketed = must(
    applyCraftStep(
      catalog,
      { ...initial, implicitLines: ['Grants Skill: Level 12 Volatile Dead'] },
      { kind: 'socket', socketIndex: 0, augmentId: id('caster') },
    ),
  )
  const first = must(
    applyCraftStep(catalog, socketed, {
      kind: 'essence',
      essenceId: 'Metadata/Items/Currency/CurrencyGreaterEssenceCritical',
      values: [50],
    }),
  )
  return must(
    applyCraftStep(catalog, first, {
      kind: 'alloy',
      alloyId: 'Metadata/Items/Currency/CurrencyVerisiumAlloy9',
      removeModId: 'SpellDamageOnWeapon1',
      values: [25],
    }),
  )
}
it.each([
  ['Volatile Wand', 'caster'],
  ['Ashen Staff', 'caster'],
  ['Bandit Mace', 'weapon'],
  ['Adherent Cuffs', 'armour'],
  ['Twig Focus', 'armour'],
])('%s 精确类别单枚可提供双工艺容量', (baseId, category) => {
  const state: CraftState = { ...initial, baseId, rarity: 'normal', affixes: [], sockets: [null] }
  expect(craftedModifierCapacity(catalog, state)).toEqual({ ok: true, value: 1 })
  expect(
    socketCandidates(catalog, state)
      .filter((a) => a.name === "Astrid's Creativity")
      .map((a) => a.id),
  ).toEqual([id(category)])
  const applied = must(
    applyCraftStep(catalog, state, { kind: 'socket', socketIndex: 0, augmentId: id(category) }),
  )
  expect(craftedModifierCapacity(catalog, applied)).toEqual({ ok: true, value: 2 })
  expect(createCraftState(catalog, applied).ok).toBe(true)
})
it('第二组工艺沿真实移除池加入，君王身份与逐孔增效保留', () => {
  const state = twoCrafts()
  expect(state.affixes.filter((a) => a.crafted)).toHaveLength(2)
  expect(socketEffects(catalog, state)[0]?.augment.lines).toEqual([
    'Can have 1 additional Crafted Modifier',
  ])
  expect(
    prepareEssenceCraft(catalog, state, 'Metadata/Items/Currency/CurrencyPerfectEssenceCaster').ok,
  ).toBe(false)
  expect(
    prepareAlloyCraft(catalog, state, 'Metadata/Items/Currency/CurrencyVerisiumAlloy11').ok,
  ).toBe(false)
  const wrong = { ...state, sockets: [null, null] }
  expect(createCraftState(catalog, wrong).ok).toBe(false)
  expect(
    runeSocketContributionError(catalog, {
      ...state,
      runeSourceLines: ['Can have 1 additional Crafted Modifier'],
    }),
  ).toBeNull()
  expect(runeSocketContributionError(catalog, { ...state, runeSourceLines: [] })).not.toBeNull()
})
it('已用双工艺覆盖容量来源明确未核实，不丢词缀；萃取按摧毁语义返还', () => {
  const state = twoCrafts()
  expect(
    applyCraftStep(catalog, state, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: 'pob2:augment:["Iron Rune","wand"]',
    }),
  ).toMatchObject({ ok: false, error: expect.stringContaining('尚未核实') })
  expect(state.affixes).toHaveLength(2)
  expect(prepareExtractionCraft(catalog, state)).toMatchObject({
    ok: true,
    value: { returns: [{ name: "Astrid's Creativity", count: 1 }] },
  })
  const reduced = must(
    applyCraftStep(catalog, state, {
      currency: 'annulment',
      modIds: [],
      removeModId: 'AlloyEffectOfSocketedAugments1',
    }),
  )
  expect(
    applyCraftStep(catalog, reduced, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: 'pob2:augment:["Iron Rune","wand"]',
    }).ok,
  ).toBe(true)
})
it('拒绝腐化新镶入、重复新增、错误类别与未经支持的首饰孔', () => {
  const state = { ...initial, rarity: 'normal' as const, affixes: [] }
  expect(
    applyCraftStep(
      catalog,
      { ...state, corrupted: true },
      { kind: 'socket', socketIndex: 0, augmentId: id('caster') },
    ).ok,
  ).toBe(false)
  const first = must(
    applyCraftStep(catalog, state, { kind: 'socket', socketIndex: 0, augmentId: id('caster') }),
  )
  expect(
    applyCraftStep(catalog, first, { kind: 'socket', socketIndex: 1, augmentId: id('caster') }).ok,
  ).toBe(false)
  expect(createCraftState(catalog, { ...first, sockets: [id('weapon')] }).ok).toBe(false)
  expect(createCraftState(catalog, { ...first, baseId: 'Gold Ring' }).ok).toBe(false)
  expect(createCraftState(catalog, { ...first, corrupted: true }).ok).toBe(true)
})
it('目录身份、效果及来源篡改均不能授权双工艺', () => {
  for (const change of ['line', 'source', 'bound'] as const) {
    const bad = structuredClone(catalog)
    const a = bad.augments?.find((a) => a.id === id('caster'))
    if (!a) throw Error('缺少符文')
    if (change === 'line') a.lines = ['Can have 2 additional Crafted Modifiers']
    if (change === 'bound') a.isSocketBound = true
    if (change === 'source')
      bad._meta.sources = bad._meta.sources.filter((s) => s.path !== 'src/Data/ModRunes.lua')
    expect(craftedModifierCapacity(bad, { ...initial, sockets: [id('caster')] }).ok).toBe(false)
  }
})

it('恐惧与生命双工艺按部位授权，60% 增效不把额外一组向上取整', () => {
  const life = catalog.modifiers.find((m) => m.id === 'IncreasedLife7')
  if (!life) throw Error('缺少生命工艺')
  const state: CraftState = {
    ...initial,
    baseId: 'Adherent Cuffs',
    rarity: 'rare',
    sockets: [id('armour')],
    affixes: [
      { modId: life.id, lines: life.lines, crafted: true },
      {
        modId: 'EssenceLocalRuneAndSoulCoreEffect1',
        lines: ['60% increased effect of Socketed Augment Items'],
        crafted: true,
      },
    ],
  }
  expect(createCraftState(catalog, state).ok).toBe(true)
  expect(socketEffects(catalog, state)[0]?.augment.lines).toEqual([
    'Can have 1 additional Crafted Modifier',
  ])
  expect(craftedModifierCapacity(catalog, state)).toEqual({ ok: true, value: 2 })
  expect(
    createCraftState(catalog, { ...state, baseId: 'Volatile Wand', sockets: [id('caster')] }).ok,
  ).toBe(false)
  const bad = structuredClone(catalog)
  if (!bad.scalability) throw Error('缺少缩放元数据')
  bad.scalability['Can have 1 additional Crafted Modifier'] = [{ scalable: false, formats: [] }]
  expect(createCraftState(bad, state).ok).toBe(false)
})

it('双工艺不能把任意普通词缀标成工艺来伪造来源', () => {
  const state = twoCrafts()
  const base = catalog.bases.find((b) => b.id === state.baseId)
  const mod = catalog.modifiers.find((m) => m.id === 'SpellDamageOnWeapon1')
  if (!base || !mod) throw Error('缺少基底或属性')
  expect(isEssenceMappedMod(catalog, base, mod.id) || isAlloyMappedMod(catalog, base, mod.id)).toBe(
    false,
  )
  const first = state.affixes[0]
  if (!first) throw Error('缺少第一组工艺')
  expect(
    createCraftState(catalog, {
      ...state,
      affixes: [first, { modId: mod.id, lines: mod.lines, crafted: true }],
    }).ok,
  ).toBe(false)
})

it('第二工艺仍拒绝冲突、低物等、缺失关系与满容量，不抹除破裂', () => {
  const state = twoCrafts()
  const one = {
    ...state,
    affixes: state.affixes.filter((a) => a.modId !== 'AlloyEffectOfSocketedAugments1'),
  }
  expect(
    prepareEssenceCraft(catalog, one, 'Metadata/Items/Currency/CurrencyPerfectEssenceCritical').ok,
  ).toBe(false)
  expect(prepareAlloyCraft(primary, one, 'Metadata/Items/Currency/CurrencyVerisiumAlloy9').ok).toBe(
    false,
  )
  expect(
    prepareAlloyCraft(
      catalog,
      { ...one, itemLevel: 1 },
      'Metadata/Items/Currency/CurrencyVerisiumAlloy9',
    ).ok,
  ).toBe(false)
  const fracture = { ...one, affixes: one.affixes.map((a) => ({ ...a, fractured: true as const })) }
  expect(
    prepareAlloyCraft(catalog, fracture, 'Metadata/Items/Currency/CurrencyVerisiumAlloy9').ok,
  ).toBe(false)
  expect(
    createCraftState(catalog, {
      ...state,
      affixes: [
        ...state.affixes,
        {
          modId: 'AlloyCastSpeedDamageAsExtraColdHybridOneHand1',
          crafted: true,
          lines: ['30% increased Cast Speed', 'Gain 10% of Elemental Damage as Extra Cold Damage'],
        },
      ],
    }).ok,
  ).toBe(false)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s双工艺完整导入，缺少声明或错误容量行不通过',
  (locale) => {
    const state = twoCrafts()
    const dictionary = createCraftItemDictionary(
      catalog,
      locale === 'en'
        ? {}
        : {
            items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
            stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
          },
    )
    const text = must(exportCraftItemText(catalog, state, { locale, dictionary })).text
    const parsed = parseItem(text)
    if (!parsed.ok) throw Error(parsed.error)
    const inspection = inspectItem(parsed.item, dictionary)
    const read = (sockets?: (string | null)[]) =>
      importIdentifiedCraftState(
        catalog,
        state.baseId,
        parsed.item,
        inspection,
        sockets,
        undefined,
        dictionary.stats?.entries,
      )
    const imported = must(read(state.sockets))
    expect(imported.affixes.filter((a) => a.crafted)).toHaveLength(2)
    expect(imported.sourceText).toBe(text)
    expect(imported.sockets).toEqual(state.sockets)
    expect(read().ok).toBe(false)
    expect(read([null, null]).ok).toBe(false)
    expect(read([id('weapon'), null]).ok).toBe(false)
  },
)
