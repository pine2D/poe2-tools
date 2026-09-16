import { readFileSync } from 'node:fs'
import type { CraftCatalog, CraftState } from '@poe2-tools/item-core'
import { expect, it } from 'vitest'
import { buildCraftRehearsalReport } from './craftRehearsalReport'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  runeforging: JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8')),
}
const initialState: CraftState = {
  baseId: 'Adherent Cuffs',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  nextAffixId: 1,
  sourceText: 'PRIVATE ORIGINAL ITEM',
  quality: 20,
  sockets: [],
}
const operation = {
  kind: 'runeforge' as const,
  fromBaseId: 'Adherent Cuffs',
  toBaseId: 'Runeforged Adherent Cuffs',
}
const input = {
  catalog,
  initialState,
  operations: [operation],
  cursor: 1,
  translations: {
    'Adherent Cuffs': '信徒袖带',
    'Runeforged Adherent Cuffs': '符文信徒袖带',
    Verisium: '维里西姆',
  },
  pricing: { unit: 'divine' as const, baseCost: 0, prices: { 'currency:verisium': 0.01 } },
}

it('锻造清单显示原基底到新基底、真实材料数量与费用，保留原文隐私', () => {
  const result = buildCraftRehearsalReport(input)
  if (!result.ok) throw new Error(result.error)
  expect(result.value).toContain('步骤 1：符文锻造')
  expect(result.value).toContain('基底转换：信徒袖带 → 符文信徒袖带')
  expect(result.value).toContain('当前基底：符文信徒袖带')
  expect(result.value).toContain('维里西姆 × 350')
  expect(result.value).toContain('总费用：3.5 神圣石')
  expect(result.value).not.toContain('PRIVATE ORIGINAL ITEM')
  expect(initialState.baseId).toBe('Adherent Cuffs')
})

it('撤销后的锻造只留在未来历史，不计材料或改写当前基底', () => {
  const result = buildCraftRehearsalReport({ ...input, cursor: 0 })
  if (!result.ok) throw new Error(result.error)
  expect(result.value).toContain('尚未消耗材料')
  expect(result.value).not.toContain('符文信徒袖带')
  expect(result.value).not.toContain('× 350')
})
