import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { estimateCatalystEffects } from './catalystEffects'
import { catalog, dictionary, parse } from './catalystTestFixture'
import { architectCandidates, corruptionCandidates } from './corruptionEnchantments'
import { CORRUPTION_SOURCE } from './corruptionSource'
import { collectCraftCosts } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { inspectItem } from './export'
import { JEWEL_SOURCE } from './jewels'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { STAT_SCALABILITY_SOURCE } from './statScalability'

const must = <T>(result: CraftResult<T>): T => {
  if (!result.ok) throw Error(result.error)
  return result.value
}
const blank = (baseId = 'Sapphire'): CraftState => ({
  baseId,
  itemLevel: 86,
  rarity: 'normal',
  sourceText: null,
  affixes: [],
})
const enchant: CraftStep = {
  kind: 'vaal',
  outcome: 'enchant',
  modId: 'CorruptionJewelStrength1',
  values: [6],
}
const restore = (value: unknown) => parseCraftProject(JSON.stringify(value), catalog, dictionary)
const project = (operations: CraftStep[] = [enchant]) => ({
  schemaVersion: 1,
  rulesVersion: CRAFT_RULES_VERSION,
  sourceCommit: catalog._meta.sourceCommit,
  jewelSourceHash: JEWEL_SOURCE.sha256,
  corruptionSourceHash: CORRUPTION_SOURCE.sha256,
  initialState: blank(),
  operations,
  cursor: operations.length,
})

it.each([
  'Ruby',
  'Emerald',
  'Sapphire',
  'Diamond',
  'Time-Lost Ruby',
  'Time-Lost Emerald',
  'Time-Lost Sapphire',
  'Time-Lost Diamond',
])('%s 接通11组独立强化和无变化，珠宝不获得装备孔或装备强化', (baseId) => {
  const state = blank(baseId)
  const candidates = corruptionCandidates(catalog, state)
  expect(candidates).toHaveLength(11)
  expect(candidates.every((mod) => mod.id.startsWith('CorruptionJewel'))).toBe(true)
  const next = must(applyCraftStep(catalog, state, enchant))
  expect(next).toMatchObject({
    corrupted: true,
    affixes: [],
    corruption: { modId: 'CorruptionJewelStrength1', lines: ['+6(4-6) to Strength'] },
  })
  expect(must(applyCraftStep(catalog, state, { kind: 'vaal', outcome: 'unchanged' }))).toEqual({
    ...state,
    corrupted: true,
  })
  expect(
    applyCraftStep(catalog, { ...state, sockets: [] }, { kind: 'vaal', outcome: 'socket' }).ok,
  ).toBe(false)
  expect(
    applyCraftStep(catalog, state, {
      ...enchant,
      modId: 'CorruptionChaosResistance1',
      values: [15],
    }).ok,
  ).toBe(false)
  expect(applyCraftStep(catalog, next, { currency: 'transmutation', modIds: [] }).ok).toBe(false)
  expect(applyCraftStep(catalog, next, enchant).ok).toBe(false)
})

it('催化品质与独立强化分别保留，建筑师成功和摧毁沿用历史费用与终止规则', () => {
  const state = { ...blank(), catalyst: { id: 'Adaptive', quality: 20, declared: true as const } }
  const first = must(applyCraftStep(catalog, state, enchant))
  expect(first.catalyst).toEqual(state.catalyst)
  const effects = must(estimateCatalystEffects(catalog, first, 'Adaptive', 20))
  expect(effects.groups.find((g) => g.id === 'CorruptionJewelStrength1')?.lines[0]?.after).toBe(
    '+7 to Strength',
  )
  expect(architectCandidates(catalog, first).some((m) => m.id === 'CorruptionJewelStrength1')).toBe(
    false,
  )
  const step: CraftStep = {
    kind: 'architect',
    outcome: 'enchant',
    modId: 'CorruptionJewelDexterity1',
    values: [5],
  }
  const twice = must(applyCraftStep(catalog, first, step))
  expect(twice).toMatchObject({
    twiceCorrupted: true,
    corruption: first.corruption,
    secondCorruption: { modId: 'CorruptionJewelDexterity1' },
    catalyst: state.catalyst,
  })
  expect(applyCraftStep(catalog, twice, { kind: 'architect', outcome: 'destroy' }).ok).toBe(false)
  const destroyed = must(applyCraftStep(catalog, first, { kind: 'architect', outcome: 'destroy' }))
  expect(createCraftState(catalog, destroyed).ok).toBe(false)
  expect(must(collectCraftCosts(catalog, [enchant, step]))).toEqual([
    { id: 'currency:vaal', count: 1, name: 'Vaal Orb' },
    { id: 'currency:architect', count: 1, name: "Architect's Orb" },
  ])
})

it('魔法珠宝支持连续替换新生成组，保留稀有度，拒绝跨部位和越界结果', () => {
  const prefix = catalog.modifiers.find((m) => m.id === 'JewelEnergyShield')
  expect(prefix).toBeDefined()
  if (!prefix) throw Error('缺少珠宝词缀')
  const state: CraftState = {
    ...blank(),
    rarity: 'magic',
    affixes: [{ modId: prefix.id, lines: ['15(10-20)% increased maximum Energy Shield'] }],
  }
  const step: CraftStep = {
    kind: 'vaal',
    outcome: 'reroll',
    replacements: [
      { removeModId: prefix.id, modId: prefix.id, values: [10] },
      { removeModId: prefix.id, modId: prefix.id, values: [12] },
    ],
  }
  const next = must(applyCraftStep(catalog, state, step))
  expect(next).toMatchObject({
    rarity: 'magic',
    corrupted: true,
    affixes: [{ modId: prefix.id, lines: ['12(10-20)% increased maximum Energy Shield'] }],
  })
  expect(must(collectCraftCosts(catalog, [step]))).toEqual([
    { id: 'currency:vaal', count: 1, name: 'Vaal Orb' },
  ])
  expect(
    applyCraftStep(catalog, state, {
      ...step,
      replacements: [{ removeModId: prefix.id, modId: 'IncreasedLife1', values: [19] }],
    }).ok,
  ).toBe(false)
  expect(
    applyCraftStep(catalog, state, {
      ...step,
      replacements: [{ removeModId: prefix.id, modId: prefix.id, values: [99] }],
    }).ok,
  ).toBe(false)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 珠宝强化、已有催化品质及二重状态可导出回读',
  (locale) => {
    const localeDictionary = createCraftItemDictionary(
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
    const first = must(
      applyCraftStep(
        catalog,
        {
          ...blank('Time-Lost Sapphire'),
          catalyst: { id: 'Adaptive', quality: 20, declared: true },
        },
        enchant,
      ),
    )
    const state = must(
      applyCraftStep(catalog, first, {
        kind: 'architect',
        outcome: 'enchant',
        modId: 'CorruptionJewelDexterity1',
        values: [5],
      }),
    )
    const text = must(
      exportCraftItemText(catalog, state, { locale, dictionary: localeDictionary }),
    ).text
    const item = parse(text)
    const imported = must(
      importCraftState(
        catalog,
        state.baseId,
        item,
        inspectItem(item, localeDictionary),
        undefined,
        undefined,
        localeDictionary.stats?.entries,
      ),
    )
    expect(imported).toMatchObject({
      corrupted: true,
      twiceCorrupted: true,
      corruption: state.corruption,
      secondCorruption: state.secondCorruption,
      catalyst: { id: 'Adaptive', quality: 20 },
    })
    const saved = {
      ...project([]),
      initialState: imported,
      scalabilitySourceHash: STAT_SCALABILITY_SOURCE.sha256,
    }
    expect(parseCraftProject(JSON.stringify(saved), catalog, localeDictionary).ok).toBe(true)
    expect(
      parseCraftProject(
        JSON.stringify({ ...saved, rulesVersion: 'basic-2026-09-12-v69' }),
        catalog,
        localeDictionary,
      ).ok,
    ).toBe(false)
  },
)

it('已有液态增效与品质可保留；强化不被前缀增效放大，未核实的工艺重选仍拒绝', () => {
  const state: CraftState = {
    ...blank(),
    rarity: 'rare',
    catalyst: { id: 'Adaptive', quality: 20, declared: true },
    affixes: [
      { modId: 'JewelEnergyShield', lines: ['20(10-20)% increased maximum Energy Shield'] },
      {
        modId: 'CraftedJewelPrefixEffect',
        crafted: true,
        lines: ['60(40-60)% increased Effect of Prefixes'],
      },
    ],
  }
  const next = must(applyCraftStep(catalog, state, enchant))
  expect(next.affixes).toEqual(state.affixes)
  const effects = must(estimateCatalystEffects(catalog, next, 'Adaptive', 20))
  expect(effects.groups.find((g) => g.id === 'CorruptionJewelStrength1')?.lines[0]?.after).toBe(
    '+7 to Strength',
  )
  expect(effects.groups.find((g) => g.id === 'JewelEnergyShield')?.lines[0]?.after).toBe(
    '32% increased maximum Energy Shield',
  )
  expect(
    applyCraftStep(catalog, state, {
      kind: 'vaal',
      outcome: 'reroll',
      replacements: [
        { removeModId: 'JewelEnergyShield', modId: 'JewelEnergyShield', values: [10] },
      ],
    }).ok,
  ).toBe(false)
  const broken = structuredClone(catalog)
  const source = broken._meta.sources.find((source) => source.path === CORRUPTION_SOURCE.path)
  if (!source) throw Error('缺少来源')
  source.sha256 = '0'.repeat(64)
  expect(applyCraftStep(broken, state, enchant).ok).toBe(false)
  expect(corruptionCandidates(broken, state)).toEqual([])
})

it('v70 全历史校验珠宝瓦尔与建筑师，拒绝旧版本和缺失指纹，包括撤销之后', () => {
  expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v71')
  const operations: CraftStep[] = [
    enchant,
    { kind: 'architect', outcome: 'enchant', modId: 'CorruptionJewelDexterity1', values: [4] },
  ]
  for (const cursor of [0, 1, 2]) {
    const result = must(restore({ ...project(operations), cursor }))
    expect(result.states[2]?.twiceCorrupted).toBe(true)
    expect(result.project.cursor).toBe(cursor)
  }
  for (const version of [32, 59, 60, 61, 67, 68, 69]) {
    for (const outcome of ['unchanged', 'enchant'] as const) {
      const operations: CraftStep[] = [outcome === 'enchant' ? enchant : { kind: 'vaal', outcome }]
      expect(
        restore({ ...project(operations), cursor: 0, rulesVersion: `basic-2026-09-12-v${version}` })
          .ok,
      ).toBe(false)
    }
  }
  expect(restore({ ...project(), corruptionSourceHash: undefined }).ok).toBe(false)
  expect(restore({ ...project(), jewelSourceHash: '0'.repeat(64) }).ok).toBe(false)
  expect(restore({ ...project(), cursor: 0, operations: [{ ...enchant, values: [999] }] }).ok).toBe(
    false,
  )
  expect(restore({ ...project([]), rulesVersion: 'basic-2026-09-12-v69' }).ok).toBe(true)
})
