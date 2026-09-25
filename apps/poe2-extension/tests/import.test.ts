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

it('普通符文法器和细枝头冠无需虚构高级词缀分组即可转换', () => {
  for (const [itemClass, base, english, shield] of [
    ['法器', '符文法器', 'Runed Focus', 42],
    ['头盔', '细枝头冠', 'Twig Circlet', 19],
  ]) {
    const source = `物品类别: ${itemClass}\n稀有度: 普通\n${base}\n--------\n能量护盾: ${shield}\n--------\n物品等级: 86`
    const result = prepareImport(source, helmetTerms)
    expect(result.reasons).toEqual([])
    expect(result.ready).toBe(true)
    expect(result.english).toContain(`Rarity: Normal\n${english}`)
    expect(result.english).not.toContain('Modifier')
    expect(
      prepareImport(`${source}\n--------\n备注: ~b/o 1 divine`, helmetTerms).english,
    ).not.toContain('~b/o')
  }
})
it('普通装备不能携带显式词缀；魔法稀有装备仍要求完整高级分组', () => {
  expect(prepareImport(text.replace('稀有度: 稀有\n测试 样本', '稀有度: 普通'), terms).ready).toBe(
    false,
  )
  for (const rarity of ['魔法', '稀有']) {
    const name = rarity === '稀有' ? '测试 样本\n符文法器' : '符文法器'
    expect(
      prepareImport(`物品类别: 法器\n稀有度: ${rarity}\n${name}\n--------\n物品等级: 86`, terms)
        .ready,
    ).toBe(false)
  }
})

const robeTerms: Term[] = [
  ...helmetTerms,
  {
    id: 'robe',
    en: 'Silk Robe',
    zh: '丝质之袍',
    domain: 'base',
    source: 'test',
    version: 'test',
  },
]
const robe = `物品类别: 胸甲
稀有度: 稀有
测试 长袍
丝质之袍
--------
物品等级: 86
--------
{ 前缀属性 "测试的" (等阶：6) — 能量护盾 }
+40(36-41) 能量护盾上限
{ 后缀属性 "测试之" (等阶：6) — 元素, 闪电, 抗性 }
闪电抗性 +18(16-20)%`
it('丝质之袍按胸甲身份转换两个已核对词缀，不向其他胸甲或特殊结构扩展', () => {
  const result = prepareImport(robe, robeTerms)
  expect(result.ready).toBe(true)
  expect(result.english).toContain('Item Class: Body Armours')
  expect(result.english).toContain('Silk Robe')
  expect(result.english).toContain('+40(36-41) to maximum Energy Shield')
  expect(result.english).toContain('+18(16-20)% to Lightning Resistance')
  for (const source of [
    robe.replace('胸甲', '头盔'),
    `${robe}\n--------\n品质: +21%`,
    `${robe}\n--------\n插槽: S S S`,
    robe.replace('等阶：6', '等阶：0'),
  ]) {
    expect(prepareImport(source, robeTerms).ready).toBe(false)
  }
})

it('已支持基底的普通品质保持数值，重复或超范围品质不能提交', () => {
  const normal = '物品类别: 法器\n稀有度: 普通\n符文法器\n--------\n物品等级: 86'
  const withQuality = (quality: string) => `${normal}\n--------\n${quality}`
  for (const value of [0, 1, 20]) {
    const result = prepareImport(withQuality(`品质: +${value}% (augmented)`), terms)
    expect(result.ready).toBe(true)
    expect(result.english).toContain(`Quality: +${value}% (augmented)`)
  }
  for (const quality of [
    '品质: +21%',
    '品质: -1%',
    '品质: +1.5%',
    '品质: +10%\n品质: +20%',
    '品质（生命词缀）: +20%',
  ]) {
    expect(prepareImport(withQuality(quality), terms).ready).toBe(false)
  }
})

it('空插槽按已验收基底限制数量，重复、链接或镶嵌效果不放行', () => {
  const normal = '物品类别: 胸甲\n稀有度: 普通\n丝质之袍\n--------\n物品等级: 86'
  for (const sockets of ['S', 'S S']) {
    const result = prepareImport(`${normal}\n--------\n插槽: ${sockets}`, robeTerms)
    expect(result.ready).toBe(true)
    expect(result.english).toContain(`Sockets: ${sockets}`)
  }
  for (const line of [
    '插槽: S S S',
    '插槽: S-S',
    '插槽: A',
    '插槽: S\n插槽: S',
    '插槽: S\n--------\n火焰抗性 +20% (rune)',
  ]) {
    expect(prepareImport(`${normal}\n--------\n${line}`, robeTerms).ready).toBe(false)
  }
  const helmet = normal.replace('胸甲', '头盔').replace('丝质之袍', '细枝头冠')
  expect(prepareImport(`${helmet}\n--------\n插槽: S S`, robeTerms).ready).toBe(false)
})

const ringTerms: Term[] = [
  ...terms,
  {
    id: 'ring',
    en: 'Sapphire Ring',
    zh: '蓝玉戒指',
    domain: 'base',
    source: 'test',
    version: 'test',
  },
  {
    id: 'cold',
    sourceId: 'explicit.stat_4220027924',
    en: '#% to Cold Resistance',
    zh: '冰霜抗性 #%',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
]
const ring = `物品类别: 戒指
稀有度: 普通
蓝玉戒指
--------
物品等级: 86
--------
{ 基底属性 }
冰霜抗性 +25(20-30)%`
it('蓝玉戒指基底属性按分组保留，与同文字普通后缀分别识别', () => {
  const normal = prepareImport(ring, ringTerms)
  expect(normal.ready).toBe(true)
  expect(normal.english).toContain('{ Implicit Modifier }\n+25(20-30)% to Cold Resistance')
  const rare =
    ring.replace('稀有度: 普通\n', '稀有度: 稀有\n测试 戒指\n') +
    '\n--------\n{ 后缀属性 "测试之" (等阶：6) — 冰霜, 抗性 }\n冰霜抗性 +18(16-20)%'
  expect(prepareImport(rare, ringTerms).ready).toBe(true)
  expect(
    prepareImport(rare.replace('稀有度: 稀有\n测试 戒指', '稀有度: 魔法'), ringTerms).ready,
  ).toBe(true)
  expect(
    prepareImport(`${rare}\n{ 后缀属性 "重复之" (等阶：6) }\n冰霜抗性 +18(16-20)%`, ringTerms)
      .ready,
  ).toBe(false)
})
it('拒绝戒指缺失或重复基底属性、错分组、未知基底、品质及孔位', () => {
  for (const source of [
    ring.replace('\n--------\n{ 基底属性 }\n冰霜抗性 +25(20-30)%', ''),
    `${ring}\n{ 基底属性 }\n冰霜抗性 +25(20-30)%`,
    ring.replace('{ 基底属性 }', '{ 后缀属性 "测试之" (等阶：1) }'),
    ring.replace('蓝玉戒指', '符文法器'),
    `${ring}\n--------\n品质: +10%`,
    `${ring}\n--------\n插槽: S`,
    ring.replace('25(20-30)', '25'),
    ring.replace('25(20-30)', '31(20-30)'),
  ])
    expect(prepareImport(source, ringTerms).ready).toBe(false)
})

it('蓝玉戒指接受已核对的基底标签，保留标签文字并拒绝未知来源及标签', () => {
  for (const tags of ['元素, 冰霜, 抗性', '冰霜', 'Elemental, Cold, Resistance']) {
    const result = prepareImport(ring.replace('{ 基底属性 }', `{ 基底属性 — ${tags} }`), ringTerms)
    expect(result.ready).toBe(true)
    expect(result.english).toContain(`{ Implicit Modifier — ${tags} }`)
  }
  for (const header of [
    '{ 基底属性 FutureMechanic — 冰霜 }',
    '{ 基底属性 — 未知标签 }',
    '{ 基底属性 — 冰霜, }',
    '{ 基底属性 — 火焰 }',
    '{ 基底属性 — 冰霜 — 20% Increased }',
  ])
    expect(prepareImport(ring.replace('{ 基底属性 }', header), ringTerms).ready).toBe(false)
})

const hybridTerms: Term[] = [
  ...terms,
  {
    id: 'hybrid-es',
    sourceId: 'explicit.stat_4015621042',
    en: '#% increased Energy Shield',
    zh: '能量护盾提高 #%',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
  {
    id: 'hybrid-mana',
    sourceId: 'explicit.stat_1050105434',
    en: '+# to maximum Mana',
    zh: '+# 魔力上限',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
]
const hybridText = `物品类别: 法器
稀有度: 魔法
测试的 符文法器
--------
物品等级: 86
--------
{ 前缀属性 "测试的" (等阶：5) — 能量护盾, 魔力 }
能量护盾提高 20(14-20)%
+10(9-16) 魔力上限`
it('已验收法器复合前缀保留同一高级分组和两个数值', () => {
  const result = prepareImport(hybridText, hybridTerms)
  expect(result.reasons).toEqual([])
  expect(result.ready).toBe(true)
  expect(result.english.match(/Prefix Modifier/g)).toHaveLength(1)
  expect(result.english).toContain('20(14-20)% increased Energy Shield\n+10(9-16) to maximum Mana')
})
it('复合资格不放行缺行、错组、重复属性或其他基底', () => {
  for (const source of [
    hybridText.replace('\n+10(9-16) 魔力上限', ''),
    hybridText.replace('前缀属性', '后缀属性'),
    hybridText.replace('能量护盾提高 20(14-20)%', '+40(36-41) 能量护盾上限'),
    `${hybridText}\n+10(9-16) 魔力上限`,
    hybridText.replace('+10(9-16)', '+10'),
    hybridText.replace('法器', '头盔'),
    hybridText.replace('等阶：5', '等阶：999'),
    `${hybridText.replace('稀有度: 魔法\n测试的 符文法器', '稀有度: 稀有\n测试 样本\n符文法器')}\n{ 前缀属性 "第二个" (等阶：5) }\n+10(9-16) 魔力上限`,
  ])
    expect(prepareImport(source, hybridTerms).ready).toBe(false)
})
