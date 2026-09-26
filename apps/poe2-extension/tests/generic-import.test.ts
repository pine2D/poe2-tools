import type { Term } from '@poe2-tools/l10n-core'
import { expect, it } from 'vitest'
import { prepareImport } from '../src/adapters/coe-beta/import'

const terms: Term[] = [
  {
    id: 'base',
    en: 'Antler Focus',
    zh: '鹿角法器',
    domain: 'base',
    source: 'test',
    version: 'test',
  },
  {
    id: 'life',
    en: '+# to maximum Life',
    zh: '+# 生命上限',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
  {
    id: 'mana',
    en: '+# to maximum Mana',
    zh: '+# 魔力上限',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
]
const life = terms.find((term) => term.id === 'life')
if (!life) throw new Error('测试词典缺少生命')
const source = `物品类别: 法器
稀有度: 稀有
测试 装备
鹿角法器
--------
物品等级: 86
--------
{ 前缀属性 "测试" (等阶：2) }
+40(30-50) 生命上限
+25 魔力上限`
it('已知译文可通用转换，不用基底、词缀身份、等阶或单行分组白名单', () => {
  const result = prepareImport(source, terms)
  expect(result.ready).toBe(true)
  expect(result.english).toContain('Antler Focus')
  expect(result.english).toContain('+40(30-50) to maximum Life\n+25 to maximum Mana')
  expect(result.english.match(/Prefix Modifier/g)).toHaveLength(1)
  expect(result.original).toBe(source)
})
it('同英文多个身份仍可转换，真实不同英文才阻止回填', () => {
  expect(prepareImport(source, [...terms, { ...life, id: 'other-life' }]).ready).toBe(true)
  expect(
    prepareImport(source, [
      ...terms,
      { ...life, id: 'ambiguous', en: '+# to maximum Energy Shield' },
    ]).ready,
  ).toBe(false)
})
it('缺等阶、固定数值及未测试范围原样转换，不补造数据', () => {
  const result = prepareImport(
    source.replace(' (等阶：2)', '').replace('40(30-50)', '40(20-60)'),
    terms,
  )
  expect(result.ready).toBe(true)
  expect(result.english).not.toContain('Tier:')
  expect(result.english).toContain('+40(20-60) to maximum Life')
  expect(result.english).toContain('+25 to maximum Mana')
})
it('未知关键内容与损坏范围仍阻止回填，保留原文供对照', () => {
  for (const input of [
    `${source}\n未知词缀 5%`,
    source.replace('鹿角法器', '未知基底'),
    source.replace('(30-50)', '(30-50'),
    source.replace('40(30-50)', '60(30-50)'),
  ]) {
    const result = prepareImport(input, terms)
    expect(result.ready).toBe(false)
    expect(result.original).toBe(input)
    expect(result.issues.length).toBeGreaterThan(0)
  }
})

it('同一中文基底对应不同英文时不猜选，保留原名称供核对', () => {
  const duplicate: Term = {
    id: 'staghorn',
    en: 'Staghorn Focus',
    zh: '鹿角法器',
    domain: 'base',
    source: 'test',
    version: 'test',
  }
  const result = prepareImport(source, [...terms, duplicate])
  expect(result.ready).toBe(false)
  expect(result.reasons.join(' ')).toContain('基底译名未匹配或存在歧义')
  expect(result.english).toContain('鹿角法器')
})
