import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { craftAffixCapacities } from './affixCapacity'
import { alloyCatalogSignature } from './alloys'
import { alloyTestFixture } from './alloyTestFixture'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { craftedModifierCapacity } from './craftedCapacity'
import { exportCraftItemText } from './craftItemText'
import { serializeTargetCraftProject } from './craftProjectTargets'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { inspectNumericLines, renderNumericLines } from './numeric'
import { parseItem } from './parse'
import { addCraftAffix, type CraftState, craftCandidates, createCraftState } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { runeSocketContributionError } from './runeImport'
import { socketEffectIncrease } from './socketAmplification'
import { socketEffects } from './sockets'
import { validateStoredTargetDefinitions } from './targetDefinitions'
import { extractCraftTargets } from './targetExtraction'
import { craftTargetCandidates } from './targets'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  alloys: alloyTestFixture(),
}
const seeker = 'pob2:augment:["Legacy of Runeseeker\'s Call","wand"]'
const rune = (name: string, category = 'caster') =>
  `pob2:augment:${JSON.stringify([name, category])}`
function state(other: string, increase: number): CraftState {
  return {
    baseId: 'Volatile Wand',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    sockets: [seeker, other],
    affixes: [
      {
        modId: 'AlloyEffectOfSocketedAugments1',
        crafted: true,
        lines: [`${increase}(20-30)% increased effect of Socketed Augment Items`],
      },
    ],
  }
}
it.each([20, 25, 30])('Runeseeker 与君王 %i 合计增效只影响符文，自身保持75', (increase) => {
  const input = state(rune('Lesser Desert Rune', 'wand'), increase)
  expect(createCraftState(catalog, input).ok).toBe(true)
  const lines = socketEffects(catalog, input).flatMap((e) => e.augment.lines)
  expect(lines).toEqual([
    '75% increased effect of Socketed Runes',
    `Gain ${increase === 20 ? 11 : 12}% of Damage as Extra Fire Damage`,
  ])
  expect(runeSocketContributionError(catalog, { ...input, runeSourceLines: lines })).toBeNull()
})
it.each([
  [20, 1],
  [25, 2],
  [30, 2],
])('君王 %i 时 Serle 提供 %i 个额外后缀', (increase, extra) => {
  const input = state(rune("Serle's Triumph"), increase)
  expect(createCraftState(catalog, input).ok).toBe(true)
  expect(craftAffixCapacities(catalog, input)).toEqual({ prefix: 3, suffix: 3 + extra })
  const lines = socketEffects(catalog, input).flatMap((e) => e.augment.lines)
  expect(lines).toContain(`+${extra} Suffix Modifier allowed`)
  expect(runeSocketContributionError(catalog, { ...input, runeSourceLines: lines })).toBeNull()
})
it.each([
  [20, 2],
  [25, 3],
  [30, 3],
])('君王 %i 时 Astrid 总工艺容量为 %i', (increase, total) => {
  const input = state(rune("Astrid's Creativity"), increase)
  expect(craftedModifierCapacity(catalog, input)).toEqual({ ok: true, value: total })
  expect(createCraftState(catalog, input).ok).toBe(true)
  const lines = socketEffects(catalog, input).flatMap((e) => e.augment.lines)
  expect(lines).toContain(`Can have ${total - 1} additional Crafted Modifier`)
  expect(runeSocketContributionError(catalog, { ...input, runeSourceLines: lines })).toBeNull()
})
it('Runeseeker 与其他遗产共享限量，同孔替换允许', () => {
  const input = { ...state(rune('Lesser Desert Rune', 'wand'), 25), sockets: [seeker, null] }
  expect(
    applyCraftStep(catalog, input, {
      kind: 'socket',
      socketIndex: 1,
      augmentId: rune('Legacy of Lifesprig', 'wand'),
    }),
  ).toMatchObject({ ok: false, error: expect.stringContaining('限量') })
  expect(
    applyCraftStep(catalog, input, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: rune('Legacy of Lifesprig', 'wand'),
    }).ok,
  ).toBe(true)
})

it('符文专用75不进入魂核或雕像倍率，未知君王值不确定额外容量', () => {
  const input = state(rune("Astrid's Creativity"), 25)
  expect(socketEffectIncrease(catalog, input, 'Rune')).toBe(100)
  expect(socketEffectIncrease(catalog, input, 'SoulCore')).toBe(25)
  expect(socketEffectIncrease(catalog, input, 'Idol')).toBe(25)
  const affix = input.affixes[0]
  if (!affix) throw Error('缺少工艺词缀')
  affix.lines = ['(20-30)% increased effect of Socketed Augment Items']
  expect(craftedModifierCapacity(catalog, input).ok).toBe(false)
})
it('重复增效与伪造可缩放标志不能制造更高容量', () => {
  const input = state(rune("Serle's Triumph"), 30)
  expect(createCraftState(catalog, { ...input, sockets: [seeker, seeker] }).ok).toBe(false)
  const forged = structuredClone(catalog)
  if (!forged.scalability) throw Error('缺少缩放目录')
  forged.scalability['75% increased effect of Socketed Runes'] = [{ scalable: true, formats: [] }]
  expect(createCraftState(forged, input).ok).toBe(false)
})

it('八组状态可移除词缀；神圣通过数量校验后仍保留授予技能验收限制', () => {
  const input = fullState()
  expect(input.affixes).toHaveLength(8)
  const rolls = input.affixes.map((affix) => {
    const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
    if (!mod) throw Error('缺少词缀')
    const ranges = inspectNumericLines(mod.lines)
    if (!ranges.ok) throw Error(ranges.error)
    return {
      modId: mod.id,
      values: mod.id === 'AlloyEffectOfSocketedAugments1' ? [30] : ranges.value.map((r) => r.min),
    }
  })
  const result = applyCraftStep(catalog, input, { currency: 'divine', modIds: [], rolls })
  expect(result).toMatchObject({ ok: false, error: expect.stringContaining('授予技能') })
  const last = input.affixes.at(-1)
  if (!last) throw Error('缺少最后词缀')
  const removed = applyCraftStep(catalog, input, {
    currency: 'annulment',
    modIds: [],
    removeModId: last.modId,
  })
  if (!removed.ok) throw Error(removed.error)
  expect(removed.value.affixes).toHaveLength(7)
  expect(removed.value.sockets).toEqual(input.sockets)
})

it('容量词条不可缩放时不能仍按倍率增加工艺容量', () => {
  const forged = structuredClone(catalog)
  if (!forged.scalability) throw Error('缺少缩放目录')
  forged.scalability['Can have 1 additional Crafted Modifier'] = [{ scalable: false, formats: [] }]
  expect(craftedModifierCapacity(forged, state(rune("Astrid's Creativity"), 25)).ok).toBe(false)
})

function fullState(): CraftState {
  let input = state(rune("Serle's Triumph"), 25)
  for (const kind of [
    'prefix',
    'prefix',
    'prefix',
    'suffix',
    'suffix',
    'suffix',
    'suffix',
  ] as const) {
    const mod = craftCandidates(catalog, input).find((entry) => entry.kind === kind)
    if (!mod) throw Error('缺少候选')
    const next = addCraftAffix(catalog, input, mod.id)
    if (!next.ok) throw Error(next.error)
    input = next.value
  }
  return input
}

it('八组容量起点的君王仍可选为目标，全部词缀可提取', () => {
  const input = fullState()
  expect(
    craftTargetCandidates(catalog, input.baseId, input).some(
      (mod) => mod.id === 'AlloyEffectOfSocketedAugments1',
    ),
  ).toBe(true)
  expect(
    extractCraftTargets(
      catalog,
      input,
      input.affixes.map((a) => a.modId),
      false,
      false,
    ).ok,
  ).toBe(true)
})
it('八组目标的君王数值上限24不能借当前25的容量通过', () => {
  const input = fullState()
  const definitions = {
    nextTargetId: 9,
    targets: input.affixes.map((a, i) => ({ targetId: `t${i + 1}`, modId: a.modId })),
    alternatives: [],
    values: [],
  }
  expect(validateStoredTargetDefinitions(catalog, input.baseId, definitions, input).ok).toBe(true)
  expect(
    validateStoredTargetDefinitions(
      catalog,
      input.baseId,
      {
        ...definitions,
        values: [
          {
            targetId: 't1',
            modId: 'AlloyEffectOfSocketedAugments1',
            bounds: [{ index: 0, max: 24 }],
          },
        ],
      },
      input,
    ).ok,
  ).toBe(false)
})

it('八组目标与剥离未来可逐游标保存恢复，旧版拒绝；降容操作不改动原态', () => {
  const raw = { ...fullState(), implicitLines: ['Grants Skill: Level 12 Volatile Dead'] }
  const text = exportCraftItemText(catalog, raw)
  if (!text.ok) throw Error(text.error)
  const parsed = parseItem(text.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const imported = importIdentifiedCraftState(
    catalog,
    raw.baseId,
    parsed.item,
    inspectItem(parsed.item, createCraftItemDictionary(catalog)),
    raw.sockets,
  )
  if (!imported.ok) throw Error(imported.error)
  const initial = imported.value
  const last = initial.affixes.at(-1)
  if (!last) throw Error('缺少词缀')
  const project = {
    schemaVersion: 1,
    rulesVersion: 'basic-2026-09-18-v125',
    sourceCommit: catalog._meta.sourceCommit,
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    scalabilitySourceHash: catalog._meta.sources.find(
      (s) => s.path === 'src/Data/ModScalability.lua',
    )?.sha256,
    alloyCatalogSignature: alloyCatalogSignature(catalog),
    initialState: initial,
    importedSockets: initial.sockets,
    operations: [
      { currency: 'annulment', modIds: [], removeModId: last.modId, removeAffixId: last.affixId },
    ],
    cursor: 0,
    targetDefinitions: {
      nextTargetId: 9,
      targets: initial.affixes.map((a, i) => ({ targetId: `t${i + 1}`, modId: a.modId })),
      alternatives: [],
      values: [],
    },
    orphanedTargets: [],
  }
  for (const cursor of [0, 1]) {
    const loaded = loadTargetWorkbenchProject(JSON.stringify({ ...project, cursor }), catalog)
    if (!loaded.ok) throw Error(loaded.error)
    expect(loaded.value.states.map((s) => s.affixes.length)).toEqual([8, 7])
    expect(loaded.value.project.targetDefinitions.targets).toHaveLength(8)
    expect(serializeTargetCraftProject(loaded.value.project, catalog).ok).toBe(true)
  }
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-18-v124' }),
      catalog,
    ).ok,
  ).toBe(false)
  const before = structuredClone(initial)
  expect(
    applyCraftStep(catalog, initial, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: rune('Lesser Desert Rune', 'wand'),
    }).ok,
  ).toBe(false)
  const withoutSovereign = applyCraftStep(catalog, initial, {
    currency: 'annulment',
    modIds: [],
    removeModId: 'AlloyEffectOfSocketedAugments1',
  })
  if (!withoutSovereign.ok) throw Error(withoutSovereign.error)
  expect(withoutSovereign.value.affixes).toHaveLength(7)
  expect(craftAffixCapacities(catalog, withoutSovereign.value)).toEqual({ prefix: 3, suffix: 4 })
  expect(initial).toEqual(before)
})

it('Astrid 三工艺可共存并提取目标，降到95%时不能伪造第三工艺', () => {
  const input = state(rune("Astrid's Creativity"), 25)
  for (const id of ['SpellDamageOnWeapon2', 'IncreasedCastSpeed2']) {
    const mod = catalog.modifiers.find((m) => m.id === id)
    if (!mod) throw Error('缺少精华词缀')
    const bounds = inspectNumericLines(mod.lines)
    if (!bounds.ok) throw Error(bounds.error)
    const lines = renderNumericLines(
      mod.lines,
      bounds.value.map((b) => b.min),
    )
    if (!lines.ok) throw Error(lines.error)
    input.affixes.push({ modId: id, crafted: true, lines: lines.value })
  }
  expect(createCraftState(catalog, input).ok).toBe(true)
  expect(
    extractCraftTargets(
      catalog,
      input,
      input.affixes.map((a) => a.modId),
      false,
      false,
    ).ok,
  ).toBe(true)
  const weaker = structuredClone(input)
  const sovereign = weaker.affixes[0]
  if (!sovereign) throw Error('缺少君王')
  sovereign.lines = ['20(20-30)% increased effect of Socketed Augment Items']
  expect(createCraftState(catalog, weaker).ok).toBe(false)
})
it.each(['zh-CN', 'zh-TW'] as const)('%s 增效后容量文本可完整回读', (locale) => {
  const dictionary = createCraftItemDictionary(catalog, {
    stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
    items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
  })
  const raw = { ...fullState(), implicitLines: ['Grants Skill: Level 12 Volatile Dead'] }
  const text = exportCraftItemText(catalog, raw, { locale, dictionary })
  if (!text.ok) throw Error(text.error)
  const parsed = parseItem(text.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const imported = importIdentifiedCraftState(
    catalog,
    raw.baseId,
    parsed.item,
    inspectItem(parsed.item, dictionary),
    raw.sockets,
    undefined,
    dictionary.stats?.entries,
  )
  if (!imported.ok) throw Error(imported.error)
  expect(imported.value.affixes).toHaveLength(8)
  expect(socketEffects(catalog, imported.value).flatMap((e) => e.augment.lines)).toEqual([
    '75% increased effect of Socketed Runes',
    '+2 Suffix Modifier allowed',
  ])
})

it('当前君王20仍可规划明确要求至少25的八组目标', () => {
  const full = fullState()
  const input = {
    ...full,
    affixes: full.affixes
      .slice(0, 7)
      .map((a, i) =>
        i === 0 ? { ...a, lines: ['20(20-30)% increased effect of Socketed Augment Items'] } : a,
      ),
  }
  expect(createCraftState(catalog, input).ok).toBe(true)
  const definitions = {
    nextTargetId: 9,
    targets: full.affixes.map((a, i) => ({ targetId: `t${i + 1}`, modId: a.modId })),
    alternatives: [],
    values: [
      { targetId: 't1', modId: 'AlloyEffectOfSocketedAugments1', bounds: [{ index: 0, min: 25 }] },
    ],
  }
  expect(validateStoredTargetDefinitions(catalog, input.baseId, definitions, input).ok).toBe(true)
})
