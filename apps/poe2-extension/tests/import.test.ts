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

const helmetTerms: Term[] = [
  ...terms,
  {
    id: 'helmet',
    en: 'Twig Circlet',
    zh: '细枝头冠',
    domain: 'base',
    source: 'test',
    version: 'test',
  },
  {
    id: 'lightning',
    sourceId: 'explicit.stat_1671376347',
    en: '+#% to Lightning Resistance',
    zh: '闪电抗性 +#%',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
]
const helmet = `物品类别: 头盔
稀有度: 魔法
辐射的 细枝头冠 暴风之
--------
能量护盾: 59 (augmented)
--------
物品等级: 86
--------
{ 前缀属性 "辐射的" (等阶：4) — 能量护盾 }
+40(36-41) 能量护盾上限
{ 后缀属性 "暴风之" (等阶：6) — 元素, 闪电, 抗性 }
闪电抗性 +18(16-20)%`
it('细枝头冠按自身类别导出，保留两个高级词缀的数值、范围和等阶', () => {
  const result = prepareImport(helmet, helmetTerms)
  expect(result.reasons).toEqual([])
  expect(result.ready).toBe(true)
  expect(result.english).toContain('Item Class: Helmets')
  expect(result.english).toContain('Tier: 4')
  expect(result.english).toContain('+40(36-41) to maximum Energy Shield')
  expect(result.english).toContain('+18(16-20)% to Lightning Resistance')
  expect(
    prepareImport(
      helmet.replace('稀有度: 魔法\n辐射的 细枝头冠 暴风之', '稀有度: 稀有\n测试 样本\n细枝头冠'),
      helmetTerms,
    ).ready,
  ).toBe(true)
})
it('不同装备导入档案不得交叉放行基底、类别和词缀', () => {
  for (const source of [
    helmet.replace('头盔', '法器'),
    helmet.replace('细枝头冠', '符文法器'),
    helmet.replace('能量护盾: 59', '护甲: 59'),
    helmet.replace('前缀属性', '后缀属性'),
  ])
    expect(prepareImport(source, helmetTerms).ready).toBe(false)
  const focusOnly = {
    id: 'cold',
    sourceId: 'explicit.stat_3291658075',
    en: '#% increased Cold Damage',
    zh: '冰霜伤害提高 #%',
    domain: 'stat',
    source: 'test',
    version: 'test',
  } as const
  expect(
    prepareImport(helmet.replace('+40(36-41) 能量护盾上限', '冰霜伤害提高 25(25-34)%'), [
      ...helmetTerms,
      focusOnly,
    ]).ready,
  ).toBe(false)
})
it('诊断保留原文行号，缺失等阶与数值范围分别定位到对应行', () => {
  const source = text.replace(' (等阶：6)', '').replace('(36-41)', '')
  const result = prepareImport(source, terms)
  expect(result.ready).toBe(false)
  expect(result.original).toBe(source)
  expect(result.issues).toContainEqual({
    line: 8,
    message: '复合词缀、特殊来源、缺等阶等结构尚未验收。',
  })
  expect(result.issues).toContainEqual({ line: 9, message: '缺少高级数值范围或数值不在范围内。' })
  expect(prepareImport(source.replaceAll('\n', '\r\n'), terms).issues).toEqual(result.issues)
})
