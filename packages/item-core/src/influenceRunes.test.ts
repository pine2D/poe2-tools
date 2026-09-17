import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { prepareDesecration } from './boneCraft'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { prepareExtractionCraft } from './extraction'
import { inspectNumericLines, renderNumericLines } from './numeric'
import { parseItem } from './parse'
import { preparePutrefaction } from './putrefaction'
import {
  addCraftAffix,
  type CraftResult,
  type CraftState,
  craftCandidates,
  createCraftState,
} from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { runeSocketContributionError } from './runeImport'
import { socketCandidates, socketEffects } from './sockets'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const cases = [
  ["Uhtred's Sidereus", 'boots', 'Adherent Leggings', 'chronomancy', 17],
  ["Kolr's Hunt", 'gloves', 'Adherent Cuffs', 'marksman', 28],
  ["Vorana's Carnage", 'helmet', 'Ancestral Tiara', 'berserking', 30],
  ["Medved's Tending", 'body armour', "Adherent's Raiment", 'soul', 11],
  ["Katla's Gloom", 'gloves', 'Adherent Cuffs', 'decay', 23],
] as const
function present<T>(value: T | null | undefined): T {
  if (value == null) throw Error('缺少测试数据')
  return value
}
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function initial(baseId = 'Adherent Cuffs'): CraftState {
  return {
    baseId,
    itemLevel: 86,
    rarity: 'normal',
    sourceText: null,
    affixes: [],
    sockets: [null, null],
    nextAffixId: 1,
  }
}
function id(name: string, category: string) {
  return `pob2:augment:${JSON.stringify([name, category])}`
}
function socket(name: string, category: string, baseId: string) {
  return must(
    applyCraftStep(catalog, initial(baseId), {
      kind: 'socket',
      socketIndex: 0,
      augmentId: id(name, category),
    }),
  )
}

it.each(cases)(
  '%s 只在真实孔位开放对应部位的完整合法词缀池',
  (name, category, baseId, tag, count) => {
    const source = initial(baseId)
    const special = (state: CraftState) =>
      craftCandidates(catalog, { ...state, rarity: 'rare' }).filter((m) =>
        m.eligibility.some((e) => e.tag === tag),
      )
    expect(special(source)).toHaveLength(0)
    expect(socketCandidates(catalog, source).some((a) => a.id === id(name, category))).toBe(true)
    const state = socket(name, category, baseId)
    expect(source.sockets).toEqual([null, null])
    expect(special(state)).toHaveLength(count)
    expect(special({ ...state, itemLevel: 44 })).toHaveLength(0)
    const mod = present(special(state).find((m) => m.kind === 'prefix'))
    const values = must(inspectNumericLines(mod.lines)).map((r) => r.min)
    const magic = must(
      applyCraftStep(catalog, state, {
        currency: 'transmutation',
        modIds: [mod.id],
        rolls: [{ modId: mod.id, values }],
      }),
    )
    expect(magic.affixes[0]?.modId).toBe(mod.id)
    expect(magic.affixes[0]?.crafted).toBeUndefined()
    expect(createCraftState(catalog, { ...magic, sockets: [null, null] }).ok).toBe(false)
    expect(createCraftState(catalog, { ...state, baseId: 'Gold Ring' }).ok).toBe(false)
    expect(socketEffects(catalog, magic)[0]?.augment.lines).toEqual(
      catalog.augments?.find((a) => a.id === id(name, category))?.lines,
    )
  },
)

it('Soul 首次匹配的防御拒绝规则和普通词缀组冲突保持有效', () => {
  for (const tag of ['str_armour', 'str_dex_armour', 'str_dex_int_armour']) {
    const base = present(
      catalog.bases.find(
        (b) =>
          b.type === 'Body Armour' &&
          b.tags.includes(tag) &&
          !b.hidden &&
          !b.runeforged &&
          !b.variantList &&
          !b.implicit,
      ),
    )
    const state = { ...socket("Medved's Tending", 'body armour', base.id), rarity: 'rare' as const }
    const pool = craftCandidates(catalog, state).filter((m) =>
      m.eligibility.some((e) => e.tag === 'soul'),
    )
    expect(pool).toHaveLength(tag === 'str_dex_int_armour' ? 21 : 11)
    const life = must(addCraftAffix(catalog, state, 'SoulInfluenceIncreasedLifePercent'))
    expect(
      craftCandidates(catalog, life).some((m) => m.group === 'MaximumLifeIncreasePercent'),
    ).toBe(false)
  }
})

it('来源篡改、重复、错误部位和占孔新镶均不能开启资格', () => {
  const augmentId = id("Kolr's Hunt", 'gloves')
  const state = socket("Kolr's Hunt", 'gloves', 'Adherent Cuffs')
  for (const field of ['source', 'bound', 'line', 'category', 'limit', 'duplicate'] as const) {
    const bad = structuredClone(catalog)
    const a = present(bad.augments?.find((a) => a.id === augmentId))
    if (field === 'source')
      bad._meta.sources = bad._meta.sources.filter((s) => s.path !== 'src/Data/ModRunes.lua')
    if (field === 'bound') a.isSocketBound = false
    if (field === 'line') a.lines = ['Can roll Soul modifiers']
    if (field === 'category') a.category = 'boots'
    if (field === 'limit') a.limit = 2
    if (field === 'duplicate') present(bad.augments).push(structuredClone(a))
    expect(createCraftState(bad, state).ok, field).toBe(false)
    expect(craftCandidates(bad, { ...state, rarity: 'rare' })).toEqual([])
  }
  expect(createCraftState(catalog, { ...state, sockets: [augmentId, augmentId] }).ok).toBe(false)
  expect(createCraftState(catalog, { ...state, baseId: 'Adherent Leggings' }).ok).toBe(false)
  for (const target of [state, { ...initial(), sockets: [id('Iron Rune', 'armour')] }])
    expect(applyCraftStep(catalog, target, { kind: 'socket', socketIndex: 0, augmentId }).ok).toBe(
      false,
    )
  expect(
    applyCraftStep(
      catalog,
      { ...initial(), corrupted: true },
      { kind: 'socket', socketIndex: 0, augmentId },
    ).ok,
  ).toBe(false)
  expect(createCraftState(catalog, { ...state, corrupted: true }).ok).toBe(true)
  expect(prepareExtractionCraft(catalog, state).ok).toBe(false)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 多行 Soul 词缀与符文声明可回读，不能用数值总和抵消来源缺失',
  (locale) => {
    const start = socket("Medved's Tending", 'body armour', "Adherent's Raiment")
    const mod = present(catalog.modifiers.find((m) => m.id === 'SoulInfluenceIncreasedLifeAndMana'))
    const state = must(
      createCraftState(catalog, {
        ...start,
        rarity: 'rare',
        affixes: [
          { modId: mod.id, affixId: 'a1', lines: must(renderNumericLines(mod.lines, [50, 60])) },
        ],
        nextAffixId: 2,
      }),
    )
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
    const read = (sockets: (string | null)[]) =>
      importIdentifiedCraftState(
        catalog,
        state.baseId,
        parsed.item,
        inspection,
        sockets,
        undefined,
        dictionary.stats?.entries,
      )
    const restored = must(read(present(state.sockets)))
    expect(restored.affixes.map((a) => a.modId)).toEqual([mod.id])
    expect(read([null, null]).ok).toBe(false)
    expect(runeSocketContributionError(catalog, { ...state, runeSourceLines: [] })).not.toBeNull()
    expect(
      runeSocketContributionError(catalog, {
        ...state,
        runeSourceLines: ['Can roll Soul modifiers', 'Can roll Soul modifiers'],
      }),
    ).not.toBeNull()
  },
)

it('破裂与亵渎保留影响来源，工艺不能取得同一资格', () => {
  const start = socket("Medved's Tending", 'body armour', "Adherent's Raiment")
  const affix = {
    modId: 'SoulInfluenceIncreasedLifeAndMana',
    affixId: 'a1',
    lines: ['+50 to maximum Life', '+60 to maximum Mana'],
  }
  const state = {
    ...start,
    rarity: 'rare' as const,
    affixes: [{ ...affix, fractured: true as const }],
    nextAffixId: 2,
  }
  expect(createCraftState(catalog, { ...state, affixes: [{ ...affix, crafted: true }] }).ok).toBe(
    false,
  )
  expect(
    createCraftState(catalog, { ...state, affixes: [{ ...affix, desecrated: true }] }).ok,
  ).toBe(true)
  const dictionary = createCraftItemDictionary(catalog)
  const text = must(exportCraftItemText(catalog, state, { locale: 'en', dictionary })).text
  const parsed = parseItem(text)
  if (!parsed.ok) throw Error(parsed.error)
  const read = must(
    importIdentifiedCraftState(
      catalog,
      state.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      state.sockets,
    ),
  )
  expect(read.affixes[0]?.fractured).toBe(true)
})

it('特殊容量共存与 Soul 腐烂仍拒绝，普通骨骼准备和状态允许', () => {
  const state = {
    ...socket("Medved's Tending", 'body armour', "Adherent's Raiment"),
    rarity: 'rare' as const,
  }
  for (const name of ["Astrid's Creativity", "Serle's Triumph"]) {
    const capacity = id(name, 'armour')
    expect(
      createCraftState(catalog, { ...state, sockets: [present(state.sockets?.[0]), capacity] }).ok,
    ).toBe(false)
    expect(
      applyCraftStep(catalog, state, { kind: 'socket', socketIndex: 1, augmentId: capacity }).ok,
    ).toBe(false)
    const before = must(createCraftState(catalog, { ...state, sockets: [capacity, null] }))
    expect(
      applyCraftStep(catalog, before, {
        kind: 'socket',
        socketIndex: 1,
        augmentId: present(state.sockets?.[0]),
      }).ok,
    ).toBe(false)
  }
  expect(preparePutrefaction(catalog, state, 'preserved_rib')).toMatchObject({
    ok: false,
    error: expect.stringContaining('尚未核实'),
  })
  expect(prepareDesecration(catalog, state, 'preserved_rib').ok).toBe(true)
  expect(
    createCraftState(catalog, {
      ...state,
      pendingDesecration: { boneId: 'preserved_rib', kind: 'prefix' },
    }).ok,
  ).toBe(true)
})

it('不能把无关符文原文的检查结果伪造成开放词缀池声明', () => {
  const state = socket("Medved's Tending", 'body armour', "Adherent's Raiment")
  const dictionary = createCraftItemDictionary(catalog)
  const text = must(exportCraftItemText(catalog, state, { locale: 'en', dictionary })).text.replace(
    'Can roll Soul modifiers (rune)',
    'Unverified rune declaration (rune)',
  )
  const parsed = parseItem(text)
  if (!parsed.ok) throw Error(parsed.error)
  const inspection = inspectItem(parsed.item, dictionary)
  const rune = present(inspection.runes[0])
  rune.resolution.english = 'Can roll Soul modifiers'
  expect(
    importIdentifiedCraftState(catalog, state.baseId, parsed.item, inspection, state.sockets).ok,
  ).toBe(false)
})
