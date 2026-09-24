import type { Term } from '@poe2-tools/l10n-core'
import { expect, it } from 'vitest'
import { prepareImport } from '../src/adapters/coe-beta/import'

const terms: Term[] = [
  {
    id: 'base',
    en: 'Runed Focus',
    zh: '符文法器',
    domain: 'base',
    source: 'test',
    version: 'test',
  },
  {
    id: 'stat:one',
    sourceId: 'explicit.stat_4052037485',
    en: '+# to maximum Energy Shield',
    zh: '+# 能量护盾上限',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
]
const text = `物品类别: 法器
稀有度: 稀有
测试 样本
符文法器
--------
物品等级: 86
--------
{ 前缀属性 "测试的" (等阶：6) — 能量护盾 }
+40(36-41) 能量护盾上限`
it('转换预览保留原文、词缀分组与范围，不生成携带装备的 URL', () => {
  const result = prepareImport(text, terms)
  expect(result.original).toBe(text)
  expect(result.english).toContain('+40(36-41) to maximum Energy Shield')
  expect(result.english).toContain('Prefix Modifier')
  expect(result.ready).toBe(true)
})
it('未知语义行、缺少高级范围或阶级均不能提交', () => {
  for (const source of [
    `${text}\n陌生属性 10%`,
    text.replace('(36-41)', ''),
    text.replace(' (等阶：6)', ''),
  ]) {
    const result = prepareImport(source, terms)
    expect(result.ready).toBe(false)
    expect(result.reasons.length).toBeGreaterThan(0)
  }
})
it('传奇、咒符、腐化与未验收结构仅供对照；备注不提交', () => {
  for (const source of [
    text.replace('稀有度: 稀有', '稀有度: 传奇'),
    text.replace('物品类别: 法器', '物品类别: 咒符'),
    `${text}\n--------\n被腐化`,
    text.replace('物品类别: 法器', '物品类别: 腰带'),
  ])
    expect(prepareImport(source, terms).ready).toBe(false)
  const note = prepareImport(`${text}\n--------\n备注: ~b/o 1 divine`, terms)
  expect(note.original).toContain('~b/o')
  expect(note.english).not.toContain('~b/o')
})
it('无法解析时保留完整输入和诊断', () => {
  const result = prepareImport('任意文本', terms)
  expect(result.ready).toBe(false)
  expect(result.original).toBe('任意文本')
  expect(result.reasons.length).toBeGreaterThan(0)
})
it.each([
  `${text}\n{ 前缀属性 "另一个" (等阶：6) — 能量护盾 }\n+40(36-41) 能量护盾上限`,
  text.replace('前缀属性', '后缀属性'),
  text.replace('等阶：6', '等阶：999'),
])('拒绝异常普通词缀结构 %#', (source) => expect(prepareImport(source, terms).ready).toBe(false))
