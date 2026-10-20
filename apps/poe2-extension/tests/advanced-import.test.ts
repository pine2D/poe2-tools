import { inspectItem, parseItem } from '@poe2-tools/item-core/text'
import { createLexicon, type Term } from '@poe2-tools/l10n-core'
import { expect, it } from 'vitest'
import { itemDictionary, prepareImport } from '../src/adapters/coe-beta/import'

// 自造语法样本，不包含玩家装备名称、交易备注或完整原文。
const term = (id: string, en: string, zh: string, domain: Term['domain']): Term => ({
  id,
  en,
  zh,
  domain,
  source: 'synthetic',
  version: 'test',
})
const terms: Term[] = [
  term('base', 'Runed Focus', '符文法器', 'base'),
  term('unique', 'Example Relic', '示例遗物', 'unique'),
  term('charm', 'Stone Charm', '磐石咒符', 'base'),
  term('life', '+# to maximum Life', '+# 生命上限', 'stat'),
  term('energy', '+# to maximum Energy Shield', '+# 能量护盾上限', 'stat'),
]
const source = (header: string, extra = '') => `物品类别: 法器
稀有度: 稀有
自造 装备
符文法器
--------
物品等级: 86
--------
${header}
+40(30-50) 生命上限${extra}`
const plain = '{ 前缀属性 "自造" (等阶：2) }'
const parsed = (text: string) => {
  const result = parseItem(text)
  if (!result.ok) throw new Error(result.error)
  return result.item
}

it.each([
  ['破碎的', 'Fractured', 'fractured'],
  ['打造的', 'Crafted', 'crafted'],
  ['Fractured', 'Fractured', 'fractured'],
])('来源标题 %s 保留为英文状态而不拒绝普通词缀', (local, english, state) => {
  const input = source(`{ ${local} 前缀属性 "自造" (等阶：2) — 生命 }`)
  expect(parsed(input).mods[0]?.states).toEqual([state])
  const result = prepareImport(input, terms)
  expect(result.ready).toBe(true)
  expect(result.english).toContain(`{ ${english} Prefix Modifier "自造" (Tier: 2) — 生命 }`)
  expect(result.english).toContain('+40(30-50) to maximum Life')
  expect(result.original).toBe(input)
  // 旧网站桥接器仍保留其特殊来源限制。
  expect(inspectItem(parsed(input), itemDictionary(terms)).bridgeText).toBeNull()
})

it.each([
  ['——提高 40%', 40, '40% Increased'],
  [' — 降低 20%', -20, '20% Reduced'],
  [' — 增加 40%', 40, '40% Increased'],
  [' — 減少 20%', -20, '20% Reduced'],
])('增效段 %s 不混入标签、不改变词缀掷值', (magnitude, value, english) => {
  const input = source(`{ 前缀属性 "自造" (等阶：2) — 生命${magnitude} }`)
  expect(parsed(input).mods[0]).toMatchObject({ magnitude: value, tags: ['生命'], tier: 2 })
  const result = prepareImport(input, terms)
  expect(result.ready).toBe(true)
  expect(result.english).toContain(`— 生命 — ${english} }`)
  expect(result.english).toContain('+40(30-50) to maximum Life')
})

it.each([
  ['{ 基底属性 — 生命——提高 40% }', 'Implicit Modifier — 生命 — 40% Increased'],
  ['{ 传奇属性 — 生命 }', 'Unique Modifier — 生命'],
  ['{ 强化 }', 'Enchant Modifier'],
  ['{ 腐化强化 — 生命 }', 'Corrupted Enhancement — 生命'],
])('已知特殊标题 %s 可转换，传奇仍仅供对照', (header, english) => {
  const input = source(header)
    .replace('稀有度: 稀有', '稀有度: 传奇')
    .replace('自造 装备', '示例遗物')
  const result = prepareImport(input, terms)
  expect(result.comparisonOnly).toBe(true)
  expect(result.issues).toHaveLength(1)
  expect(result.english).toContain('Example Relic\nRuned Focus')
  expect(result.english).toContain(`{ ${english} }`)
})

it.each([
  '{ FutureMechanic 前缀属性 "自造" (等阶：2) }',
  '{ 前缀属性 "自造" (等阶：2) — 生命——提高 forty% }',
  '{ 前缀属性 "自造" (等阶：2) — 生命, }',
  '{ 破碎的 前缀属性 "自造" (等阶：2) FutureMechanic }',
])('未知或损坏的标题不被已知片段掩盖：%s', (header) => {
  const result = prepareImport(source(header), terms)
  expect(result.ready).toBe(false)
  expect(result.english).toContain(header)
})

it.each(['分裂之物', 'Split'])('整件分裂状态 %s 保留并阻断旧桥接器', (flag) => {
  const input = source(plain, `\n--------\n${flag}`)
  expect(parsed(input)).toMatchObject({ split: true })
  const result = prepareImport(input, terms)
  expect(result.ready).toBe(true)
  expect(result.english).toContain('\nSplit')
  expect(inspectItem(parsed(input), itemDictionary(terms)).bridgeText).toBeNull()
})

it('珠宝与增幅器孔位原样保留，非法孔位不因放宽字母规则被放行', () => {
  const input = source(plain, '\n--------\n插槽: S J')
  const result = prepareImport(input, terms)
  expect(result.ready).toBe(true)
  expect(result.english).toContain('Sockets: S J')
  for (const malformed of ['S X', 'S J2', 'S--J', 'SJ']) {
    const text = input.replace('S J', malformed)
    expect(prepareImport(text, terms).ready).toBe(false)
    expect(prepareImport(text, terms).english).toContain(malformed)
  }
})

it('咒符面板转换保留充能顺序和原值，不把免疫名称猜成任意英文', () => {
  const input = `物品类别: 咒符
稀有度: 魔法
磐石咒符
--------
持续 3 秒
每次使用会从 40 充能次数中消耗 15 (augmented) 次
目前有 26 充能次数
免疫晕眩
--------
物品等级: 40
--------
{ 前缀属性 "自造" }
+40 生命上限
--------
满足条件时自动使用。只有装备于腰带上时才会充能。可通过水井或击败怪物补充。`
  const result = prepareImport(input, terms)
  expect(result.comparisonOnly).toBe(true)
  expect(result.issues).toHaveLength(1)
  expect(result.english).toContain('Lasts 3 Seconds')
  expect(result.english).toContain('Consumes 15 (augmented) of 40 Charges on use')
  expect(result.english).toContain('Currently has 26 Charges')
  expect(result.english).toContain('Immune to Stun')
  const unknown = prepareImport(input.replace('免疫晕眩', '免疫未来机制'), terms)
  expect(unknown.issues.length).toBeGreaterThan(1)
  expect(unknown.english).toContain('免疫未来机制')
})

it('无引号已核对说明与未知关键尾行区别处理，分裂状态不会被说明吞掉', () => {
  const input = source(plain, '\n--------\n我们触及遗失的誓约……\n--------\n分裂之物')
  const result = prepareImport(input, terms)
  expect(result.ready).toBe(true)
  expect(result.original).toBe(input)
  expect(result.english).not.toContain('我们触及')
  expect(result.english).toContain('Split')
  const unknown = prepareImport(input.replace('我们触及遗失的誓约……', '生命不能回复。'), terms)
  expect(unknown.ready).toBe(false)
  expect(unknown.english).toContain('生命不能回复。')
})

it('同一装备的中文标题不阻止已知英文词缀匹配', () => {
  const input = source(plain).replace('+40(30-50) 生命上限', '+40(30-50) to maximum Life')
  expect(prepareImport(input, terms).ready).toBe(true)
})

it('台服输入词条只参与导入，简体显示不被另一套译名覆盖', () => {
  const twTerms = [
    { ...term('tw-base', 'Runed Focus', '符文法器臺服', 'base'), inputOnly: true },
    { ...term('tw-life', '+# to maximum Life', '+#最大生命', 'stat'), inputOnly: true },
  ]
  const mixed = [...terms, ...twTerms]
  const input = source(plain).replace('符文法器', '符文法器臺服').replace(' 生命上限', '最大生命')
  const result = prepareImport(input, mixed)
  expect(result.ready).toBe(true)
  expect(result.english).toContain('Runed Focus')
  expect(result.english).toContain('+40(30-50) to maximum Life')
  const lexicon = createLexicon(mixed)
  expect(lexicon.translate('Runed Focus', 'base')).toBe('符文法器')
  expect(lexicon.translate('+40 to maximum Life', 'stat')).toBe('+40 生命上限')
  expect(lexicon.search('臺服', 'base')).toEqual([])
  expect(prepareImport(source(plain), mixed).ready).toBe(true)
})

it('跨服同文本的不同英文含义必须提示歧义', () => {
  const mixed = [
    ...terms,
    { ...term('tw-conflict', '+# to maximum Mana', '+# 生命上限', 'stat'), inputOnly: true },
  ]
  const result = prepareImport(source(plain), mixed)
  expect(result.ready).toBe(false)
  expect(result.english).toContain('+40(30-50) 生命上限')
})

it('授予技能按所在行的明确语言解析，保留当前与最高等级', () => {
  const skills = [
    term('skill.cn', 'Grants Skill: Level # Test Skill', '获得技能: 等级 # 测试技能', 'stat'),
    {
      ...term('skill.tw', 'Grants Skill: Level # Test Skill', '賦予技能: 等級 # 測試技能', 'stat'),
      inputOnly: true,
    },
  ]
  const cnHead = source(plain, '\n--------\n賦予技能: 等級 12 測試技能（最高等級 13）')
  const twHead = source(plain, '\n--------\n获得技能: 等级 12 测试技能（最高等级 13）').replace(
    '物品类别',
    '物品種類',
  )
  for (const input of [cnHead, twHead]) {
    const result = prepareImport(input, [...terms, ...skills])
    expect(result.ready).toBe(true)
    expect(result.english).toContain('Grants Skill: Level 12 Test Skill (Max Level 13)')
  }
})

it('繁体面板字段可按字段语法转译，损坏数字仍保留诊断', () => {
  const input = source(plain, '\n--------\n護甲: 123 (augmented)\n閃避值: 234')
  const result = prepareImport(input, terms)
  expect(result.ready).toBe(true)
  expect(result.english).toContain('Armour: 123 (augmented)')
  expect(result.english).toContain('Evasion Rating: 234')
  expect(prepareImport(input.replace('123', '123oops'), terms).ready).toBe(false)
})
