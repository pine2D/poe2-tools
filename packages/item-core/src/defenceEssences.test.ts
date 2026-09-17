import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { analyzeEssenceTargetContext } from './essenceAdvice'
import { prepareEssenceCraft } from './essenceCraft'
import { essenceResultModIds } from './essenceOutcomes'
import { analyzeEssencePreparationContext } from './essencePreparation'
import { inspectEssences } from './essences'
import { inspectItem } from './export'
import { parseItem } from './parse'
import type { CraftState } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { checkCraftStrategyAction } from './strategyActions'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const essenceId = 'Metadata/Items/Currency/CurrencyGreaterEssenceDefences'
function must<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw Error('测试目录缺少预期记录')
  return value
}
function state(baseId: string): CraftState {
  return { baseId, itemLevel: 86, rarity: 'magic', affixes: [], sourceText: null }
}
it.each([
  ['Ancestral Tiara', 'LocalIncreasedEnergyShieldPercent5', 'Energy Shield'],
  ['Sleek Jacket', 'LocalIncreasedEvasionAndEnergyShield5_', 'Evasion and Energy Shield'],
])('高级防御精华在 %s 查询与执行使用同一原生防御结果', (baseId, modId, label) => {
  const base = required(catalog.bases.find((b) => b.id === baseId))
  const entry = inspectEssences(catalog, base).find((e) => e.essence.id === essenceId)
  expect(entry?.mod?.id).toBe(modId)
  const result = applyCraftStep(catalog, state(baseId), {
    kind: 'essence',
    essenceId,
    values: [72],
  })
  expect(result).toMatchObject({
    ok: true,
    value: {
      rarity: 'rare',
      affixes: [
        { modId, crafted: true, lines: [expect.stringContaining(`72(68-79)% increased ${label}`)] },
      ],
    },
  })
  expect(
    prepareEssenceCraft(
      catalog,
      state(baseId),
      essenceId,
      undefined,
      'LocalIncreasedArmourAndEvasionAndEnergyShield5',
    ).ok,
  ).toBe(false)
})
it('无原生防御身份的黄金盾牌不猜测精华结果', () => {
  const base = required(catalog.bases.find((b) => b.id === 'Golden Flame'))
  const essence = required(required(catalog.essences).find((e) => e.id === essenceId))
  expect(essenceResultModIds(catalog, base, essence)).toEqual([])
})

it('三档与七种原生防御分别映射，锻造和当前面板不改变原生身份', () => {
  const families = [
    ['str_armour', 'LocalIncreasedPhysicalDamageReductionRatingPercent'],
    ['dex_armour', 'LocalIncreasedEvasionRatingPercent'],
    ['int_armour', 'LocalIncreasedEnergyShieldPercent'],
    ['str_dex_armour', 'LocalIncreasedArmourAndEvasion'],
    ['str_int_armour', 'LocalIncreasedArmourAndEnergyShield'],
    ['dex_int_armour', 'LocalIncreasedEvasionAndEnergyShield'],
    ['str_dex_int_armour', 'LocalIncreasedArmourAndEvasionAndEnergyShield'],
  ] as const
  for (const [material, level] of [
    ['LesserEssence', 2],
    ['Essence', 4],
    ['GreaterEssence', 5],
  ] as const) {
    const essence = required(
      required(catalog.essences).find(
        (e) => e.id === `Metadata/Items/Currency/Currency${material}Defences`,
      ),
    )
    for (const [tag, prefix] of families) {
      const base = required(
        catalog.bases.find((b) => b.tags.includes(tag) && b.type === 'Body Armour' && !b.hidden),
      )
      const id = `${prefix}${level}${tag === 'dex_int_armour' && level === 5 ? '_' : ''}`
      expect(essenceResultModIds(catalog, base, essence)).toEqual([id])
      expect(essenceResultModIds(catalog, { ...base, properties: { Ward: 100 } }, essence)).toEqual(
        [id],
      )
    }
  }
  for (const baseId of [
    'Twig Focus',
    'Painted Buckler',
    'Splintered Tower Shield',
    'Runeforged Adorned Gloves',
  ])
    expect(
      inspectEssences(catalog, required(catalog.bases.find((b) => b.id === baseId))).find(
        (entry) => entry.essence.id === essenceId,
      )?.mod,
    ).toMatchObject({ kind: 'prefix' })
})

it('来源、材料占位、实际词缀身份和多防御标签歧义不能绕过核对', () => {
  const base = required(catalog.bases.find((b) => b.id === 'Sleek Jacket'))
  const essence = required(required(catalog.essences).find((e) => e.id === essenceId))
  expect(
    essenceResultModIds(catalog, { ...base, tags: [...base.tags, 'int_armour'] }, essence),
  ).toEqual([])
  expect(essenceResultModIds(catalog, base, { ...essence, tierLevel: 54 })).toEqual([])
  expect(
    essenceResultModIds(catalog, base, { ...essence, mods: { ...essence.mods, Focus: 'wrong' } }),
  ).toEqual([])
  const bad = structuredClone(catalog)
  required(bad.modifiers.find((m) => m.id === 'LocalIncreasedEvasionAndEnergyShield5_')).group =
    'wrong'
  expect(essenceResultModIds(bad, base, essence)).toEqual([])
  bad._meta.sourceCommit = 'wrong'
  expect(essenceResultModIds(bad, base, essence)).toEqual([])
})

it('原有百分比词缀冲突，原有不同组的复合防御前缀可以保留', () => {
  const baseState = state('Sleek Jacket')
  const hybrid = required(
    catalog.modifiers.find(
      (m) =>
        m.kind === 'prefix' &&
        m.lines.length === 3 &&
        m.lines.some((l) => l.includes('increased Evasion and Energy Shield')) &&
        m.eligibility.some((e) => e.tag === 'dex_int_armour' && e.value === 1),
    ),
  )
  expect(hybrid).toBeDefined()
  const withHybrid = { ...baseState, affixes: [{ modId: hybrid.id, lines: hybrid.lines }] }
  expect(prepareEssenceCraft(catalog, withHybrid, essenceId).ok).toBe(true)
  const existing = required(
    catalog.modifiers.find((m) => m.id === 'LocalIncreasedEvasionAndEnergyShield2'),
  )
  expect(
    prepareEssenceCraft(
      catalog,
      { ...baseState, affixes: [{ modId: existing.id, lines: existing.lines }] },
      essenceId,
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('冲突') })
})

it('目标建议、普通起点准备和条件指引使用同一实际精华操作', () => {
  const start = state('Sleek Jacket')
  const target = 'LocalIncreasedEvasionAndEnergyShield5_'
  const advice = must(analyzeEssenceTargetContext(catalog, start, [target]))
  expect(advice.some((entry) => entry.operation.essenceId === essenceId)).toBe(true)
  for (const entry of advice) {
    const result = must(applyCraftStep(catalog, start, entry.operation))
    expect(result.affixes.some((a) => a.modId === target)).toBe(true)
  }
  expect(checkCraftStrategyAction(catalog, start, { kind: 'essence', essenceId }).ok).toBe(true)
  const normal = { ...start, rarity: 'normal' as const }
  const routes = must(analyzeEssencePreparationContext(catalog, normal, [target])).routes
  expect(routes.length).toBeGreaterThan(0)
  for (const route of routes) {
    let current: CraftState = normal
    for (const step of [...route.preparations, route.final.operation])
      current = must(applyCraftStep(catalog, current, step))
    expect(current.affixes.some((a) => a.modId === target)).toBe(true)
  }
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 防御工艺导出回读保留具体身份与基础范围',
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
    const start = state('Sleek Jacket')
    const crafted = must(
      applyCraftStep(catalog, start, { kind: 'essence', essenceId, values: [78] }),
    )
    const text = must(exportCraftItemText(catalog, crafted, { locale, dictionary })).text
    const parsed = parseItem(text)
    if (!parsed.ok) throw Error(parsed.error)
    const restored = must(
      importIdentifiedCraftState(
        catalog,
        start.baseId,
        parsed.item,
        inspectItem(parsed.item, dictionary),
        undefined,
        undefined,
        dictionary.stats?.entries,
      ),
    )
    expect(restored.affixes[0]).toMatchObject({
      modId: 'LocalIncreasedEvasionAndEnergyShield5_',
      crafted: true,
      lines: ['78(68-79)% increased Evasion and Energy Shield'],
    })
  },
)
