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
  ])
    expect(prepareImport(source, hybridTerms).ready).toBe(false)
})

const rareHybrid = hybridText.replace(
  '稀有度: 魔法\n测试的 符文法器',
  '稀有度: 稀有\n测试 样本\n符文法器',
)
const manaPrefix = '{ 前缀属性 "青蓝的" (等阶：8) — 魔力 }\n+48(35-54) 魔力上限'
const overlap = `${rareHybrid}\n${manaPrefix}`
it('稀有法器复合魔力与独立魔力前缀保留两组数值，不合并导出', () => {
  const result = prepareImport(overlap, hybridTerms)
  expect(result.ready).toBe(true)
  expect(result.reasons).toEqual([])
  expect(result.english.match(/Prefix Modifier/g)).toHaveLength(2)
  expect(result.english).toContain('+10(9-16) to maximum Mana')
  expect(result.english).toContain('+48(35-54) to maximum Mana')
  expect(result.english).not.toContain('+58')
})
it('允许跨复合来源重叠不放宽同类重复、魔法上限或非法后缀', () => {
  const hybridGroup = hybridText.slice(hybridText.indexOf('{ 前缀属性'))
  for (const source of [
    `${overlap}\n${manaPrefix}`,
    `${rareHybrid}\n${hybridGroup}`,
    `${hybridText}\n${manaPrefix}`,
    `${rareHybrid}\n${manaPrefix.replace('前缀属性', '后缀属性')}`,
    rareHybrid.replace('能量护盾提高 20(14-20)%', '+10(9-16) 魔力上限'),
  ])
    expect(prepareImport(source, hybridTerms).ready).toBe(false)
})

const bootsTerms: Term[] = [
  ...robeTerms,
  {
    id: 'boots',
    en: 'Silk Slippers',
    zh: '丝绸便鞋',
    domain: 'base',
    source: 'test',
    version: 'test',
  },
]
const boots =
  robe.replace('胸甲', '靴子').replace('丝质之袍', '丝绸便鞋').replace('等阶：6', '等阶：3') +
  '\n--------\n品质: +20% (augmented)\n--------\n插槽: S'
it('丝绸便鞋允许自身已验收的护盾与闪电抗性、品质和单空孔', () => {
  const result = prepareImport(boots, bootsTerms)
  expect(result.ready).toBe(true)
  expect(result.english).toContain('Item Class: Boots')
  expect(result.english).toContain('Silk Slippers')
  expect(result.english).toContain('Quality: +20% (augmented)')
  expect(result.english).toContain('Sockets: S')
  expect(result.english).toContain('+40(36-41) to maximum Energy Shield')
  for (const invalid of [
    boots.replace('靴子', '手套'),
    boots.replace('插槽: S', '插槽: S S'),
    boots.replace('品质: +20%', '品质: +21%'),
    boots.replace('(36-41)', ''),
    boots.replace('前缀属性', '后缀属性'),
  ]) {
    expect(prepareImport(invalid, bootsTerms).ready).toBe(false)
  }
})

const speedTerms: Term[] = [
  ...bootsTerms,
  {
    id: 'speed',
    sourceId: 'explicit.stat_2250533757',
    en: '#% increased Movement Speed',
    zh: '移动速度提高 #%',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
]
const speedBoots = (value: number, tier: number) =>
  `${boots}\n--------\n{ 前缀属性 "测试的" (等阶：${tier}) — 速度 }\n移动速度提高 ${value}%`
it.each([
  [10, 6],
  [15, 5],
  [20, 4],
  [25, 3],
  [30, 2],
  [35, 1],
])('丝绸便鞋固定移动速度 %s / T%s 不补造范围', (value, tier) => {
  const result = prepareImport(speedBoots(value, tier), speedTerms)
  expect(result.ready).toBe(true)
  expect(result.english).toContain(`${value}% increased Movement Speed`)
  expect(result.english).not.toContain(`${value}(${value}`)
})
it('移动速度例外不放宽数值、等阶、分组和其他属性的范围要求', () => {
  for (const source of [
    speedBoots(21, 4),
    speedBoots(20, 3),
    speedBoots(-20, 4),
    speedBoots(20, 4).replace('移动速度提高 20%', '移动速度提高 20(15-25)%'),
    speedBoots(20, 4).replace('{ 前缀属性 "测试的"', '{ 后缀属性 "测试的"'),
    speedBoots(20, 4).replace('(36-41)', ''),
    speedBoots(20, 4).replace('丝绸便鞋', '丝质之袍').replace('靴子', '胸甲'),
  ]) {
    expect(prepareImport(source, speedTerms).ready).toBe(false)
  }
})

const amuletTerms: Term[] = [
  {
    id: 'jade',
    en: 'Jade Amulet',
    zh: '翠玉项链',
    domain: 'base',
    source: 'test',
    version: 'test',
  },
  {
    id: 'dexterity',
    sourceId: 'explicit.stat_3261801346',
    en: '# to Dexterity',
    zh: '# 敏捷',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
  {
    id: 'lightning',
    sourceId: 'explicit.stat_1671376347',
    en: '#% to Lightning Resistance',
    zh: '闪电抗性 #%',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
]
const jadeNormal = `物品类别: 项链
稀有度: 普通
翠玉项链
--------
物品等级: 86
--------
{ 基底属性 — 属性 }
+12(10-15) 敏捷`
const jadeSuffix = '\n--------\n{ 后缀属性 "测试之" (等阶：4) — 属性 }\n+24(21-24) 敏捷'
it('翠玉项链固有敏捷与后缀分别保留，覆盖普通魔法稀有结构', () => {
  const magic = jadeNormal.replace('稀有度: 普通', '稀有度: 魔法') + jadeSuffix
  const rare =
    magic.replace('稀有度: 魔法\n', '稀有度: 稀有\n测试 项链\n') +
    '\n{ 后缀属性 "测试之" (等阶：6) — 元素, 闪电, 抗性 }\n闪电抗性 +18(16-20)%'
  for (const source of [jadeNormal, magic, rare]) {
    const result = prepareImport(source, amuletTerms)
    expect(result.ready).toBe(true)
    expect(result.english).toContain('{ Implicit Modifier — 属性 }\n+12(10-15) to Dexterity')
  }
  expect(prepareImport(rare, amuletTerms).english).toContain('+24(21-24) to Dexterity')
  expect(prepareImport(rare, amuletTerms).english).toContain('+18(16-20)% to Lightning Resistance')
})
it('项链固有标签不借用戒指标签，重复后缀与错误分组不能通过', () => {
  const magic = jadeNormal.replace('稀有度: 普通', '稀有度: 魔法') + jadeSuffix
  for (const source of [
    jadeNormal.replace(' — 属性', ' — 冰霜'),
    jadeNormal.replace('12(10-15)', '12'),
    jadeNormal.replace('12(10-15)', '16(10-15)'),
    jadeNormal.replace('{ 基底属性 — 属性 }\n+12(10-15) 敏捷', ''),
    magic.replace('后缀属性', '前缀属性'),
    magic + jadeSuffix,
  ])
    expect(prepareImport(source, amuletTerms).ready).toBe(false)
  expect(prepareImport(jadeNormal.replace(' — 属性', ' — Attribute'), amuletTerms).ready).toBe(true)
})
it('项链催化品质、孔位及未验收基底继续只供对照', () => {
  for (const line of ['品质: +20%', '品质 (属性): +20%', '插槽: S', '被腐化'])
    expect(prepareImport(`${jadeNormal}\n--------\n${line}`, amuletTerms).ready).toBe(false)
  expect(prepareImport(jadeNormal.replace('翠玉项链', '琥珀项链'), amuletTerms).ready).toBe(false)
})

const rubyTerms: Term[] = [
  { id: 'ruby', en: 'Ruby Ring', zh: '红玉戒指', domain: 'base', source: 'test', version: 'test' },
  {
    id: 'fire',
    sourceId: 'explicit.stat_3372524247',
    en: '#% to Fire Resistance',
    zh: '火焰抗性 #%',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
]
const rubyNormal = `物品类别: 戒指
稀有度: 普通
红玉戒指
--------
物品等级: 86
--------
{ 基底属性 — 元素, 火焰, 抗性 }
火焰抗性 +25(20-30)%`
const rubySuffix = '\n--------\n{ 后缀属性 "测试之" (等阶：6) — 火焰, 抗性 }\n火焰抗性 +18(16-20)%'
it('红玉戒指普通魔法稀有保留基底及后缀火抗的独立分组', () => {
  for (const [rarity, name] of [
    ['普通', ''],
    ['魔法', ''],
    ['稀有', '测试 戒指\n'],
  ]) {
    const source =
      rubyNormal.replace('普通\n', `${rarity}\n${name}`) + (rarity === '普通' ? '' : rubySuffix)
    const result = prepareImport(source, rubyTerms)
    expect(result.ready).toBe(true)
    expect(result.english).toContain('+25(20-30)% to Fire Resistance')
    if (rarity !== '普通') expect(result.english).toContain('+18(16-20)% to Fire Resistance')
  }
})
it('红玉戒指不继承冰霜标签，未验收品质及错分组仍不放行', () => {
  const magic = rubyNormal.replace('普通', '魔法') + rubySuffix
  for (const source of [
    rubyNormal.replace('元素, 火焰, 抗性', '冰霜'),
    rubyNormal.replace('25(20-30)', '31(20-30)'),
    rubyNormal.replace('25(20-30)', '25'),
    magic.replace('后缀属性', '前缀属性'),
    magic + rubySuffix,
    `${rubyNormal}\n--------\n品质: +20%`,
    `${rubyNormal}\n--------\n插槽: S`,
  ])
    expect(prepareImport(source, rubyTerms).ready).toBe(false)
})

const lifeTerm: Term = {
  id: 'life',
  sourceId: 'explicit.stat_3299347043',
  en: '# to maximum Life',
  zh: '# 生命上限',
  domain: 'stat',
  source: 'test',
  version: 'test',
}
it.each([
  {
    base: '蓝玉戒指',
    normal: ring,
    terms: ringTerms,
    tier: 5,
    suffix: '{ 后缀属性 "测试之" (等阶：6) }\n冰霜抗性 +18(16-20)%',
  },
  {
    base: '红玉戒指',
    normal: rubyNormal,
    terms: rubyTerms,
    tier: 5,
    suffix: '{ 后缀属性 "测试之" (等阶：6) }\n火焰抗性 +18(16-20)%',
  },
  {
    base: '翠玉项链',
    normal: jadeNormal,
    terms: amuletTerms,
    tier: 6,
    suffix: '{ 后缀属性 "测试之" (等阶：4) }\n+24(21-24) 敏捷',
  },
])('$base 生命前缀与原后缀分开转换，拒绝错分组和缺范围', ({ normal, terms, tier, suffix }) => {
  const dictionary = [...terms, lifeTerm]
  const prefix = `\n--------\n{ 前缀属性 "测试的" (等阶：${tier}) — 生命 }\n+50(40-59) 生命上限`
  const magic = `${normal.replace('普通', '魔法')}${prefix}\n${suffix}`
  for (const source of [magic, magic.replace('魔法\n', '稀有\n测试 首饰\n')]) {
    const result = prepareImport(source, dictionary)
    expect(result.ready).toBe(true)
    expect(result.english).toContain('+50(40-59) to maximum Life')
    expect(result.english).toContain(`Prefix Modifier "测试的" (Tier: ${tier})`)
  }
  for (const source of [
    normal + prefix,
    magic.replace('前缀属性', '后缀属性'),
    magic.replace('50(40-59)', '50'),
    magic.replace('50(40-59)', '60(40-59)'),
    magic.replace('魔法\n', '稀有\n测试 首饰\n') + prefix,
  ])
    expect(prepareImport(source, dictionary).ready).toBe(false)
})

it.each([
  { base: '蓝玉戒指', normal: ring, tier: 5 },
  { base: '红玉戒指', normal: rubyNormal, tier: 5 },
  { base: '翠玉项链', normal: jadeNormal, tier: 6 },
])('$base 支持生命与三种元素抗性，仍限制魔法和稀有后缀数量', ({ normal, tier }) => {
  const dictionary = [...ringTerms, ...rubyTerms, ...amuletTerms, lifeTerm]
  const prefix = `\n--------\n{ 前缀属性 "测试的" (等阶：${tier}) — 生命 }\n+50(40-59) 生命上限`
  const suffixes = ['火焰', '冰霜', '闪电'].map(
    (element) =>
      `\n{ 后缀属性 "测试之" (等阶：6) — 元素, ${element}, 抗性 }\n${element}抗性 +18(16-20)%`,
  )
  const magic = normal.replace('稀有度: 普通', '稀有度: 魔法') + prefix
  for (const suffix of suffixes) expect(prepareImport(magic + suffix, dictionary).ready).toBe(true)
  const rare =
    normal.replace('稀有度: 普通\n', '稀有度: 稀有\n测试 首饰\n') + prefix + suffixes.join('')
  const result = prepareImport(rare, dictionary)
  expect(result.ready).toBe(true)
  expect(result.english.match(/Suffix Modifier/g)).toHaveLength(3)
  for (const element of ['Fire', 'Cold', 'Lightning'])
    expect(result.english).toContain(`+18(16-20)% to ${element} Resistance`)
  expect(prepareImport(magic + suffixes.join(''), dictionary).ready).toBe(false)
  expect(prepareImport(rare + jadeSuffix, dictionary).ready).toBe(false)
  expect(prepareImport(rare.replace('后缀属性', '前缀属性'), dictionary).ready).toBe(false)
  expect(prepareImport(rare + suffixes[0], dictionary).ready).toBe(false)
})

it.each([
  {
    base: 'Topaz Ring',
    zh: '黄玉戒指',
    implicit: '闪电抗性 +25(20-30)%',
    tags: '元素, 闪电, 抗性',
  },
  { base: 'Amethyst Ring', zh: '紫晶戒指', implicit: '混沌抗性 +10(7-13)%', tags: '混沌, 抗性' },
])('$zh 独立保留固有抗性与显式词缀，不放宽品质或固有标签', ({ base, zh, implicit, tags }) => {
  const dictionary: Term[] = [
    ...ringTerms,
    ...rubyTerms,
    ...amuletTerms,
    lifeTerm,
    { id: base, en: base, zh, domain: 'base', source: 'test', version: 'test' },
    {
      id: 'chaos',
      sourceId: 'explicit.stat_2923486259',
      en: '#% to Chaos Resistance',
      zh: '混沌抗性 #%',
      domain: 'stat',
      source: 'test',
      version: 'test',
    },
  ]
  const normal = `物品类别: 戒指\n稀有度: 普通\n${zh}\n--------\n物品等级: 86\n--------\n{ 基底属性 — ${tags} }\n${implicit}`
  const prefix = '\n--------\n{ 前缀属性 "测试的" (等阶：5) — 生命 }\n+50(40-59) 生命上限'
  const magic =
    normal.replace('普通', '魔法') +
    prefix +
    '\n{ 后缀属性 "测试之" (等阶：6) }\n闪电抗性 +18(16-20)%'
  const suffix = base === 'Topaz Ring' ? '闪电抗性 +18(16-20)%' : '混沌抗性 +13(12-15)%'
  const rare =
    normal.replace('普通\n', '稀有\n测试 戒指\n') +
    prefix +
    '\n{ 后缀属性 "测试之" (等阶：6) }\n火焰抗性 +18(16-20)%\n{ 后缀属性 "测试之" (等阶：6) }\n冰霜抗性 +18(16-20)%' +
    `\n{ 后缀属性 "测试之" (等阶：${base === 'Topaz Ring' ? 6 : 4}) }\n${suffix}`
  for (const source of [normal, magic, rare]) {
    const result = prepareImport(source, dictionary)
    expect(result.ready).toBe(true)
    expect(result.english).toContain(base)
    expect(result.english.match(/Implicit Modifier/g)).toHaveLength(1)
  }
  expect(prepareImport(rare, dictionary).english.match(/Suffix Modifier/g)).toHaveLength(3)
  for (const source of [
    normal.replace(tags, '冰霜'),
    `${normal}\n--------\n品质: +20%`,
    magic.replace('后缀属性', '前缀属性'),
  ])
    expect(prepareImport(source, dictionary).ready).toBe(false)
})

const gloveTerms: Term[] = [
  ...robeTerms,
  {
    id: 'gloves',
    en: 'Torn Gloves',
    zh: '破碎手套',
    domain: 'base',
    source: 'test',
    version: 'test',
  },
]
const gloves = boots.replace('靴子', '手套').replace('丝绸便鞋', '破碎手套')
it('破碎手套保留护盾、闪电抗性、品质和单空孔，不继承靴子能力', () => {
  const result = prepareImport(gloves, gloveTerms)
  expect(result.ready).toBe(true)
  expect(result.english).toContain('Item Class: Gloves')
  expect(result.english).toContain('Torn Gloves')
  expect(result.english).toContain('Quality: +20% (augmented)')
  expect(result.english).toContain('Sockets: S')
  expect(result.english).toContain('+40(36-41) to maximum Energy Shield')
  for (const invalid of [
    gloves.replace('手套', '靴子'),
    gloves.replace('插槽: S', '插槽: S S'),
    gloves.replace('品质: +20%', '品质: +21%'),
    gloves.replace('(36-41)', ''),
    gloves.replace('前缀属性', '后缀属性'),
    `${gloves}\n{ 前缀属性 "测试的" (等阶：4) — 速度 }\n移动速度提高 20%`,
  ])
    expect(
      prepareImport(invalid, [...gloveTerms, ...speedTerms.filter((term) => term.id === 'speed')])
        .ready,
    ).toBe(false)
})
it('破碎手套普通与魔法稀有度分别校验分组', () => {
  const normal = '物品类别: 手套\n稀有度: 普通\n破碎手套\n--------\n物品等级: 86'
  expect(prepareImport(normal, gloveTerms).ready).toBe(true)
  expect(
    prepareImport(gloves.replace('稀有度: 稀有\n测试 长袍\n', '稀有度: 魔法\n'), gloveTerms).ready,
  ).toBe(true)
  expect(prepareImport(gloves.replace('稀有度: 稀有', '稀有度: 普通'), gloveTerms).ready).toBe(
    false,
  )
})
