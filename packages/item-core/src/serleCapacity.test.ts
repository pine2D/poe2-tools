import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { craftAffixCapacities, craftAffixSpace } from './affixCapacity'
import { enableCraftAffixIdentity } from './affixIdentity'
import { alloyTestFixture } from './alloyTestFixture'
import { desecrationCandidates, prepareDesecration } from './boneCraft'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { prepareExtractionCraft } from './extraction'
import { applyFluxCraft, prepareFluxCraft } from './fluxCraft'
import { FLUXES } from './fluxes'
import { inspectNumericLines, renderNumericLines } from './numeric'
import { parseItem } from './parse'
import {
  addCraftAffix,
  type CraftResult,
  type CraftState,
  craftCandidates,
  createCraftState,
} from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { runeSocketContributionError } from './runeImport'
import { isSerleRune, serleCapacity } from './serleRune'
import { socketCandidates, socketEffects } from './sockets'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const serle = 'pob2:augment:["Serle\'s Triumph","armour"]'
const fluxCatalog: CraftCatalog = {
  ...catalog,
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('缺少测试数据')
  return value
}
function initial(): CraftState {
  return {
    baseId: 'Twig Focus',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    sockets: [null, null],
    affixes: [],
  }
}
function fill(state: CraftState, kind: 'prefix' | 'suffix', count: number): CraftState {
  for (let i = 0; i < count; i++) {
    const mod = craftCandidates(catalog, state).find((mod) => mod.kind === kind)
    if (!mod) throw Error('缺少可添加词缀')
    state = must(addCraftAffix(catalog, state, mod.id))
  }
  return state
}
function socketed(state = initial()): CraftState {
  return must(applyCraftStep(catalog, state, { kind: 'socket', socketIndex: 0, augmentId: serle }))
}
it('三后三前镶入 Serle 后可加第四后缀，总容量七组仍严格限制', () => {
  const base = fill(fill(initial(), 'prefix', 3), 'suffix', 3)
  const state = socketed(base)
  expect(craftAffixCapacities(catalog, state)).toEqual({ prefix: 3, suffix: 4 })
  expect(craftAffixSpace(catalog, state)).toEqual({ prefix: 0, suffix: 1, total: 1 })
  const full = fill(state, 'suffix', 1)
  expect(full.affixes).toHaveLength(7)
  expect(craftCandidates(catalog, full)).toEqual([])
  expect(createCraftState(catalog, { ...full, sockets: [null, null] }).ok).toBe(false)
})
it('绑定前态不能覆盖，即使同 ID 或没有额外后缀；全绑定萃取消费保持未知', () => {
  const state = socketed()
  expect(
    applyCraftStep(catalog, state, { kind: 'socket', socketIndex: 0, augmentId: serle }),
  ).toMatchObject({ ok: false, error: expect.stringContaining('绑定') })
  expect(prepareExtractionCraft(catalog, state)).toMatchObject({
    ok: false,
    error: expect.stringContaining('尚未核实'),
  })
})

function numericValues(modId: string): number[] {
  const mod = catalog.modifiers.find((entry) => entry.id === modId)
  if (!mod) throw Error('缺少词缀')
  return must(inspectNumericLines(mod.lines)).map((range) => range.min)
}
function complete(): CraftState {
  const state = fill(fill(socketed(), 'prefix', 3), 'suffix', 4)
  return must(
    enableCraftAffixIdentity(catalog, {
      ...state,
      affixes: state.affixes.map((affix) => ({
        ...affix,
        lines: must(renderNumericLines(affix.lines, numericValues(affix.modId))),
      })),
    }),
  )
}
it('七组神圣、第四后缀破裂、剥离与混沌均保留容量来源和实例身份', () => {
  const state = complete()
  const rolls = state.affixes.map((affix) => ({
    modId: affix.modId,
    affixId: affix.affixId as string,
    values: numericValues(affix.modId),
  }))
  expect(rolls).toHaveLength(7)
  const divine = must(applyCraftStep(catalog, state, { currency: 'divine', modIds: [], rolls }))
  expect(divine.affixes.map((a) => a.affixId)).toEqual(state.affixes.map((a) => a.affixId))
  const last = required(state.affixes[6])
  const fractured = must(
    applyCraftStep(catalog, divine, {
      kind: 'fracture',
      modId: last.modId,
      affixId: last.affixId as string,
    }),
  )
  expect(fractured.affixes[6]?.fractured).toBe(true)
  const removed = must(
    applyCraftStep(catalog, state, {
      currency: 'annulment',
      modIds: [],
      removeModId: last.modId,
      removeAffixId: last.affixId as string,
    }),
  )
  expect(craftAffixSpace(catalog, removed).suffix).toBe(1)
  const chaos = must(
    applyCraftStep(catalog, state, {
      currency: 'chaos',
      modIds: [last.modId],
      removeModId: last.modId,
      removeAffixId: last.affixId as string,
    }),
  )
  expect(chaos.affixes).toHaveLength(7)
  expect(chaos.sockets).toEqual(state.sockets)
  expect(
    applyCraftStep(catalog, state, { currency: 'divine', modIds: [], rolls: rolls.slice(1) }).ok,
  ).toBe(false)
})
it('限一、来源、隐藏声明、绑定和精确类别篡改不能授权容量', () => {
  const state = socketed()
  for (const change of [
    'hidden',
    'visible',
    'source',
    'bound',
    'limit',
    'id',
    'category',
    'bonded',
  ] as const) {
    const bad = structuredClone(catalog)
    const augment = required(bad.augments?.find((a) => a.id === serle))
    if (change === 'hidden') delete augment.tradeHashes['1950607759']
    if (change === 'visible') augment.lines = ['+2 Suffix Modifier allowed']
    if (change === 'source')
      bad._meta.sources = bad._meta.sources.filter((s) => s.path !== 'src/Data/ModRunes.lua')
    if (change === 'bound') augment.isSocketBound = false
    if (change === 'limit') augment.limit = 2
    if (change === 'id') augment.id = 'forged'
    if (change === 'category') augment.category = 'caster'
    if (change === 'bonded')
      augment.bonded = { lines: ['+2 Suffix Modifier allowed'], statOrder: [19] }
    expect(serleCapacity(bad, state).ok, change).toBe(false)
    expect(createCraftState(bad, state).ok, change).toBe(false)
  }
  expect(createCraftState(catalog, { ...state, sockets: [serle, serle] }).ok).toBe(false)
  expect(createCraftState(catalog, { ...state, baseId: 'Gold Ring' }).ok).toBe(false)
})
it.each(['normal', 'magic'] as const)(
  '声明候选保留，但 %s 真实状态和新增操作标记尚未核实',
  (rarity) => {
    const state = { ...initial(), rarity }
    expect(socketCandidates(catalog, state).some(isSerleRune)).toBe(true)
    expect(createCraftState(catalog, { ...state, sockets: [serle] })).toMatchObject({
      ok: false,
      error: expect.stringContaining('尚未核实'),
    })
    expect(
      applyCraftStep(catalog, state, { kind: 'socket', socketIndex: 0, augmentId: serle }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('尚未核实') })
  },
)
it('已有腐化可保留；新镶腐化、覆盖普通孔和重复 Serle 均拒绝', () => {
  const state = socketed()
  expect(createCraftState(catalog, { ...state, corrupted: true }).ok).toBe(true)
  expect(
    applyCraftStep(
      catalog,
      { ...initial(), corrupted: true },
      { kind: 'socket', socketIndex: 0, augmentId: serle },
    ).ok,
  ).toBe(false)
  expect(
    applyCraftStep(catalog, state, { kind: 'socket', socketIndex: 1, augmentId: serle }).ok,
  ).toBe(false)
  const ordinary = required(
    socketCandidates(catalog, initial()).find((a) => a.name === 'Iron Rune'),
  )
  const withOrdinary = must(
    applyCraftStep(catalog, initial(), { kind: 'socket', socketIndex: 0, augmentId: ordinary.id }),
  )
  expect(
    applyCraftStep(catalog, withOrdinary, { kind: 'socket', socketIndex: 0, augmentId: serle }),
  ).toMatchObject({ ok: false, error: expect.stringContaining('尚未核实') })
  const mixed = must(
    applyCraftStep(catalog, state, { kind: 'socket', socketIndex: 1, augmentId: ordinary.id }),
  )
  expect(must(prepareExtractionCraft(catalog, mixed)).returns.map((r) => r.augmentId)).toEqual([
    ordinary.id,
  ])
  expect(must(applyCraftStep(catalog, mixed, { kind: 'extraction' })).destroyed).toBe(true)
  expect(mixed).not.toHaveProperty('destroyed')
})
it('七组腐化仍只顺序替换指定词缀，不按新容量生成额外组', () => {
  const state = complete()
  const last = required(state.affixes[6])
  const next = must(
    applyCraftStep(catalog, state, {
      kind: 'vaal',
      outcome: 'reroll',
      replacements: [
        {
          removeModId: last.modId,
          removeAffixId: last.affixId as string,
          modId: last.modId,
          values: numericValues(last.modId),
        },
      ],
    }),
  )
  expect(next.corrupted).toBe(true)
  expect(next.affixes).toHaveLength(7)
  expect(next.sockets).toEqual(state.sockets)
})
it('三后三前的骨骼占位仍有第四后缀空位，七组才需要先移除', () => {
  const state = fill(fill(socketed(), 'prefix', 3), 'suffix', 3)
  const prepared = must(prepareDesecration(catalog, state, 'preserved_rib'))
  expect(prepared.requiresRemoval).toBe(false)
  expect(prepared.kinds).toEqual(['suffix'])
  const next = must(
    applyCraftStep(catalog, state, {
      kind: 'desecrate',
      boneId: 'preserved_rib',
      affixKind: 'suffix',
    }),
  )
  expect(next.pendingDesecration?.kind).toBe('suffix')
  expect(craftAffixSpace(catalog, next).total).toBe(0)
  const options = desecrationCandidates(catalog, next).slice(0, 3)
  expect(options).toHaveLength(3)
  const offered = must(
    applyCraftStep(catalog, next, {
      kind: 'desecration-offer',
      modIds: options.map((mod) => mod.id),
    }),
  )
  const selected = required(options[0])
  const revealed = must(
    applyCraftStep(catalog, offered, {
      kind: 'desecration-reveal',
      modId: selected.id,
      values: numericValues(selected.id),
    }),
  )
  expect(revealed.affixes).toHaveLength(7)
  expect(revealed.affixes[6]?.desecrated).toBe(true)
  expect(revealed.pendingDesecration).toBeUndefined()
  expect(must(prepareDesecration(catalog, complete(), 'preserved_rib')).requiresRemoval).toBe(true)
})
it('七组溶剂转换保留第四后缀并要求全部实际转换实例', () => {
  let state: CraftState = must(enableCraftAffixIdentity(fluxCatalog, socketed()))
  for (const modId of ['FireResist1', 'ColdResist2', 'LightningResist3'])
    state = must(addCraftAffix(fluxCatalog, state, modId))
  state = fill(fill(state, 'prefix', 3), 'suffix', 1)
  const prepared = must(prepareFluxCraft(fluxCatalog, state, FLUXES[0].id))
  const step = {
    kind: 'flux' as const,
    fluxId: FLUXES[0].id,
    rolls: prepared.changes.map(({ affix, toMod }) => ({
      affixId: affix.affixId,
      modId: toMod.id,
      values: numericValues(toMod.id),
    })),
  }
  const next = must(applyFluxCraft(fluxCatalog, state, step))
  expect(next.affixes).toHaveLength(7)
  expect(next.affixes.map((a) => a.affixId)).toEqual(state.affixes.map((a) => a.affixId))
  expect(applyFluxCraft(fluxCatalog, state, { ...step, rolls: step.rolls.slice(1) }).ok).toBe(false)
})
it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 七组文本声明 Serle 后可导入，缺失或矛盾声明拒绝',
  (locale) => {
    const state = complete()
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
    const restored = must(read(state.sockets))
    expect(restored.affixes).toHaveLength(7)
    expect(restored.sockets).toEqual(state.sockets)
    expect(read().ok).toBe(false)
    expect(read([null, null]).ok).toBe(false)
    expect(socketEffects(catalog, restored)[0]?.augment.lines).toEqual([
      '+1 Suffix Modifier allowed',
    ])
  },
)

it.each([
  ['Twig Focus', 'armour'],
  ['Adherent Cuffs', 'armour'],
  ['Bandit Mace', 'weapon'],
  ['Volatile Wand', 'caster'],
  ['Ashen Staff', 'caster'],
])('%s 的精确 Serle 类别可识别，容量行不会丢失或被重复抵消', (baseId, category) => {
  const state = {
    ...initial(),
    baseId,
    sockets: [`pob2:augment:${JSON.stringify(["Serle's Triumph", category])}`],
  }
  expect(createCraftState(catalog, state).ok).toBe(true)
  const checked = (lines: string[]) =>
    runeSocketContributionError(catalog, { ...state, runeSourceLines: lines })
  expect(checked(['+1 Suffix Modifier allowed'])).toBeNull()
  expect(checked([])).not.toBeNull()
  expect(checked(['+1 Suffix Modifier allowed', '+1 Suffix Modifier allowed'])).not.toBeNull()
})

it('Serle 与 Astrid 双工艺独立，恐惧60%增效仍只增加一条后缀', () => {
  const state: CraftState = {
    ...initial(),
    baseId: 'Adherent Cuffs',
    sockets: [serle, 'pob2:augment:["Astrid\'s Creativity","armour"]'],
    affixes: [
      { modId: 'IncreasedLife7', lines: ['+(80-89) to maximum Life'], crafted: true },
      {
        modId: 'EssenceLocalRuneAndSoulCoreEffect1',
        lines: ['60% increased effect of Socketed Augment Items'],
        crafted: true,
      },
    ],
  }
  const life = required(catalog.modifiers.find((m) => m.id === 'IncreasedLife7'))
  required(state.affixes[0]).lines = [...life.lines]
  expect(createCraftState(catalog, state).ok).toBe(true)
  expect(craftAffixCapacities(catalog, state)).toEqual({ prefix: 3, suffix: 4 })
  expect(socketEffects(catalog, state)[0]?.augment.lines).toEqual(['+1 Suffix Modifier allowed'])
  const bad = structuredClone(catalog)
  required(bad.scalability)['+1 Suffix Modifier allowed'] = [{ scalable: false, formats: [] }]
  expect(createCraftState(bad, state).ok).toBe(false)
})

it.each([20, 25, 30])(
  '君王增效%d（百分比）与精华替换不把Serle容量扩大，也不混入工艺计数',
  (increase) => {
    const withAlloys = { ...catalog, alloys: alloyTestFixture() }
    const state: CraftState = {
      ...initial(),
      baseId: 'Volatile Wand',
      sockets: [
        'pob2:augment:["Serle\'s Triumph","caster"]',
        'pob2:augment:["Astrid\'s Creativity","caster"]',
      ],
      implicitLines: ['Grants Skill: Level 12 Volatile Dead'],
      affixes: [
        { modId: 'SpellDamageOnWeapon1', lines: ['30% increased Spell Damage'] },
        {
          modId: 'AlloyEffectOfSocketedAugments1',
          lines: [`${increase}(20-30)% increased effect of Socketed Augment Items`],
          crafted: true,
        },
      ],
    }
    expect(createCraftState(withAlloys, state).ok).toBe(true)
    expect(socketEffects(withAlloys, state)[0]?.augment.lines).toEqual([
      '+1 Suffix Modifier allowed',
    ])
    const result = must(
      applyCraftStep(withAlloys, state, {
        kind: 'essence',
        essenceId: 'Metadata/Items/Currency/CurrencyPerfectEssenceCaster',
        removeModId: 'SpellDamageOnWeapon1',
        values: numericValues('EssenceSpellSkillLevel1H1'),
      }),
    )
    expect(result.affixes.filter((a) => a.crafted)).toHaveLength(2)
    expect(craftAffixCapacities(withAlloys, result).suffix).toBe(4)
  },
)
