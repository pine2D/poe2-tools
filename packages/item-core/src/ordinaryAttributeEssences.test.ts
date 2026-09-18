import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import { essenceResultModIds } from './essenceOutcomes'
import { buildInitialSkillVariantLines } from './skillVariantAmulets'

const catalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')) as CraftCatalog
const tiers = [
  ['LesserEssence', 2, 11, 10, '9-12'],
  ['Essence', 4, 33, 18, '17-20'],
  ['GreaterEssence', 6, 55, 26, '25-27'],
] as const

function results(data: CraftCatalog, baseId: string, prefix: string) {
  const base = data.bases.find((b) => b.id === baseId)
  const essence = data.essences?.find(
    (e) => e.id === `Metadata/Items/Currency/Currency${prefix}Attribute`,
  )
  if (!base || !essence) throw new Error('缺少测试目录记录')
  return essenceResultModIds(data, base, essence)
}

describe('普通无限精华的三属性交集', () => {
  it.each(tiers)('%s 展开三个具体属性', (prefix, tier) => {
    expect(results(catalog, 'Amber Amulet', prefix)).toEqual([
      `Strength${tier}`,
      `Dexterity${tier}`,
      `Intelligence${tier}`,
    ])
  })
  it.each(tiers)('%s 三种结果升级稀有并保留原词缀', (prefix, tier, level, value, range) => {
    for (const attribute of ['Strength', 'Dexterity', 'Intelligence']) {
      const result = applyCraftStep(
        catalog,
        {
          baseId: 'Amber Amulet',
          itemLevel: level,
          rarity: 'magic',
          sourceText: null,
          affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }],
        },
        {
          kind: 'essence',
          essenceId: `Metadata/Items/Currency/Currency${prefix}Attribute`,
          resultModId: `${attribute}${tier}`,
          values: [value],
        },
      )
      expect(result).toMatchObject({
        ok: true,
        value: {
          rarity: 'rare',
          affixes: [
            { modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] },
            {
              modId: `${attribute}${tier}`,
              crafted: true,
              lines: [`+${value}(${range}) to ${attribute}`],
            },
          ],
        },
      })
    }
  })
  it('不把腰带或纯护盾头盔的普通子集当作精华完整结果', () => {
    expect(results(catalog, 'Double Belt', 'GreaterEssence')).toEqual([])
    expect(results(catalog, 'Ancestral Tiara', 'GreaterEssence')).toEqual([])
  })
  it('改写来源或实际属性身份不能开放结果', () => {
    const altered = structuredClone(catalog)
    altered._meta.sourceCommit = 'unverified'
    expect(results(altered, 'Amber Amulet', 'GreaterEssence')).toEqual([])
    const wrongMod = structuredClone(catalog)
    const mod = wrongMod.modifiers.find((m) => m.id === 'Dexterity6')
    if (!mod) throw new Error('缺少属性')
    mod.level = 1
    expect(results(wrongMod, 'Amber Amulet', 'GreaterEssence')).toEqual([])
  })
})
it('属性精华不能越过物等、同族冲突或缺少结果选择', () => {
  const operation = {
    kind: 'essence' as const,
    essenceId: 'Metadata/Items/Currency/CurrencyGreaterEssenceAttribute',
    resultModId: 'Strength6',
    values: [26],
  }
  const initial = {
    baseId: 'Amber Amulet',
    itemLevel: 54,
    rarity: 'magic' as const,
    sourceText: null,
    affixes: [],
  }
  expect(applyCraftStep(catalog, initial, operation).ok).toBe(false)
  expect(
    applyCraftStep(
      catalog,
      { ...initial, itemLevel: 55, affixes: [{ modId: 'Strength2', lines: ['+10 to Strength'] }] },
      operation,
    ).ok,
  ).toBe(false)
  expect(
    applyCraftStep(
      catalog,
      { ...initial, itemLevel: 55 },
      { kind: 'essence', essenceId: operation.essenceId, values: operation.values },
    ).ok,
  ).toBe(false)
})

it.each(['Absent', 'Portent', 'Lament'])('%s技能声明完整时可通过精华升级稀有', (name) => {
  const base = catalog.bases.find((b) => b.id === `${name} Amulet`)
  if (!base) throw Error('缺少技能项链')
  const lines = buildInitialSkillVariantLines(base, 1, 10)
  if (!lines.ok) throw Error(lines.error)
  const result = applyCraftStep(
    catalog,
    {
      baseId: base.id,
      itemLevel: 86,
      rarity: 'magic',
      sourceText: null,
      affixes: [],
      implicitLines: lines.value,
    },
    {
      kind: 'essence',
      essenceId: 'Metadata/Items/Currency/CurrencyGreaterEssenceAttribute',
      resultModId: 'Intelligence6',
      values: [26],
    },
  )
  expect(result).toMatchObject({
    ok: true,
    value: {
      rarity: 'rare',
      implicitLines: lines.value,
      affixes: [{ modId: 'Intelligence6', crafted: true }],
    },
  })
})
