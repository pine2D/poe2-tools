import { readFileSync } from 'node:fs'
import type { Term } from '@poe2-tools/l10n-core'
import { expect, it } from 'vitest'
import { prepareImport } from '../src/adapters/coe-beta/import'

const ui = JSON.parse(readFileSync('data/l10n/coe-beta/ui.zh-CN.json', 'utf8')).entries as Record<
  string,
  string
>
const terms: Term[] = [
  { id: 'base', en: 'Test Base', zh: '测试基底', domain: 'base', source: 'test', version: 'test' },
  ...Object.entries(ui).map(([en, zh]) => ({
    id: en,
    en,
    zh,
    domain: 'ui' as const,
    source: 'test',
    version: 'test',
  })),
]
const source = (category: string, field = '') =>
  `物品类别: ${category}\n稀有度: 普通\n测试基底\n--------\n物品等级: 86${field ? `\n--------\n${field}` : ''}`
it.each([
  ['盾牌', 'Shields'],
  ['箭袋', 'Quivers'],
  ['弩', 'Crossbows'],
  ['单手锤', 'One Hand Maces'],
  ['双手锤', 'Two Hand Maces'],
  ['节杖', 'Quarterstaves'],
  ['长矛', 'Spears'],
  ['连枷', 'Flails'],
  ['项链', 'Amulets'],
])('复用词典类别 %s', (zh, en) => {
  const result = prepareImport(source(zh), terms)
  expect(result.issues).toEqual([])
  expect(result.english).toContain(`Item Class: ${en}`)
})
it.each([
  ['护甲: 123 (augmented)', 'Armour: 123 (augmented)'],
  ['闪避值：234', 'Evasion Rating: 234'],
  ['格挡几率: 25%', 'Block chance: 25%'],
  ['Quality (Life Modifiers): +20%', 'Quality (Life Modifiers): +20%'],
])('面板字段原值转换 %s', (raw, english) => {
  const result = prepareImport(source('胸甲', raw), terms)
  expect(result.issues).toEqual([])
  expect(result.english).toContain(english)
  expect(result.original).toBe(source('胸甲', raw))
})
it('全角类别及稀有度冒号可解析，原文仍保持原样', () => {
  const original = source('盾牌').replace('类别:', '类别：').replace('稀有度:', '稀有度：')
  expect(prepareImport(original, terms).ready).toBe(true)
  expect(prepareImport(original, terms).original).toBe(original)
})
it('未知、真实冲突译名、损坏属性及催化描述符不猜译', () => {
  for (const raw of ['未知面板: 123', '护甲: 123 rubbish', '品质（未知词缀）: +20%'])
    expect(prepareImport(source('胸甲', raw), terms).ready).toBe(false)
  const conflicting: Term = {
    id: 'conflict',
    en: 'Quivers',
    zh: '盾牌',
    domain: 'ui',
    source: 'test',
    version: 'test',
  }
  expect(prepareImport(source('盾牌'), [...terms, conflicting]).ready).toBe(false)
})

it('核心已知类别也不能绕过词典的真实歧义', () => {
  const conflicting: Term = {
    id: 'belt-conflict',
    en: 'Quivers',
    zh: '腰带',
    domain: 'ui',
    source: 'test',
    version: 'test',
  }
  expect(prepareImport(source('腰带'), [...terms, conflicting]).ready).toBe(false)
})
it('国服类别词典不覆盖台服同形词的既有语义', () => {
  const input = source('法杖').replace('物品类别', '物品種類')
  expect(prepareImport(input, terms).english).toContain('Item Class: Wands')
})
