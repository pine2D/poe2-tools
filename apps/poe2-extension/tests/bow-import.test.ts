import { expect, it } from 'vitest'
import { prepareImport } from '../src/adapters/coe-beta/import'

const terms = [
  {
    id: 'physical',
    sourceId: 'explicit.stat_1940865751',
    domain: 'stat' as const,
    en: 'Adds # to # Physical Damage',
    zh: '附加 # - # 物理伤害',
    source: 'test',
    version: 'test',
  },
  {
    id: 'speed',
    sourceId: 'explicit.stat_210067635',
    domain: 'stat' as const,
    en: '#% increased Attack Speed',
    zh: '攻击速度提高 #%',
    source: 'test',
    version: 'test',
  },
  {
    id: 'bow',
    domain: 'base' as const,
    en: 'Crude Bow',
    zh: '粗制弓',
    source: 'test',
    version: 'test',
  },
  {
    id: 'dex',
    sourceId: 'explicit.stat_3261801346',
    domain: 'stat' as const,
    en: '# to Dexterity',
    zh: '# 敏捷',
    source: 'test',
    version: 'test',
  },
]
const normal = `物品类别: 弓类
稀有度: 普通
粗制弓
--------
品质: +20% (augmented)
物理伤害: 7-11 (augmented)
暴击几率: 5.00%
每秒攻击次数: 1.20
--------
插槽: S S
--------
物品等级: 86`
const suffix = '\n--------\n{ 后缀属性 "测试之" (等阶：4) — 属性 }\n+24(21-24) 敏捷'
it.each(['普通', '魔法', '稀有'])('粗制弓%s可完整转换已验收结构', (rarity) => {
  const source =
    normal.replace('稀有度: 普通', `稀有度: ${rarity}${rarity === '稀有' ? '\n测试 狂风' : ''}`) +
    (rarity === '普通' ? '' : suffix)
  const result = prepareImport(source, terms)
  expect(result.reasons).toEqual([])
  expect(result.ready).toBe(true)
  expect(result.english).toContain('Item Class: Bows')
  expect(result.english).toContain('Physical Damage: 7-11 (augmented)')
  expect(result.english).toContain('Sockets: S S')
  if (rarity !== '普通') expect(result.english).toContain('+24(21-24) to Dexterity')
})
it.each([
  normal.replace('品质: +20%', '品质: +21%'),
  normal.replace('插槽: S S', '插槽: S S S'),
  normal.replace('物理伤害: 7-11 (augmented)', '火焰伤害: 7-11'),
  normal.replace('稀有度: 普通', '稀有度: 魔法') + suffix.replace('后缀属性', '前缀属性'),
  `${normal}\n--------\n被腐化`,
])('武器字段原样翻译，由原站判定规则：%s', (source) => {
  expect(prepareImport(source, terms).ready).toBe(true)
})

it('粗制弓敏捷等阶或范围保持输入，不替原站纠正', () => {
  const magic = normal.replace('稀有度: 普通', '稀有度: 魔法') + suffix
  expect(prepareImport(magic.replace('等阶：4', '等阶：5'), terms).ready).toBe(true)
  expect(prepareImport(magic.replace('(21-24)', '(20-24)'), terms).ready).toBe(true)
})

it('人工兼容类别“弓”同样只映射已验收粗制弓档案', () => {
  expect(prepareImport(normal.replace('弓类', '弓'), terms).ready).toBe(true)
})

const attackMods =
  '\n--------\n{ 前缀属性 "测试的" (等阶：9) — 伤害, 物理, 攻击 }\n附加 2(1-2) - 5(4-5) 物理伤害\n{ 后缀属性 "测试之" (等阶：5) — 攻击, 速度 }\n攻击速度提高 7(5-7)%'
const attackingBow =
  normal.replace('稀有度: 普通', '稀有度: 魔法').replace('7-11', '10-17').replace('1.20', '1.28') +
  attackMods
it.each([false, true])('粗制弓攻击组合保留双数值范围，稀有=%s', (rare) => {
  const source = rare
    ? attackingBow.replace('稀有度: 魔法', '稀有度: 稀有\n测试 狂风') + suffix
    : attackingBow
  const result = prepareImport(source, terms)
  expect(result.reasons).toEqual([])
  expect(result.ready).toBe(true)
  expect(result.english).toContain('Adds 2(1-2) to 5(4-5) Physical Damage')
  expect(result.english).toContain('7(5-7)% increased Attack Speed')
})
it.each([
  attackingBow.replace('2(1-2) - 5(4-5)', '5(4-5) - 2(1-2)'),
  attackingBow.replace('等阶：9', '等阶：8'),
  attackingBow.replace('等阶：5', '等阶：4'),
  attackingBow.replace('7(5-7)', '7(4-7)'),
  attackingBow.replace('前缀属性', '后缀属性'),
])('攻击词缀保持原文范围或分组：%s', (source) => {
  expect(prepareImport(source, terms).ready).toBe(true)
})

it('未知武器基底与超出原文范围的数值仍提示', () => {
  expect(prepareImport(normal.replace('粗制弓', '其他弓'), terms).ready).toBe(false)
  expect(prepareImport(attackingBow.replace('2(1-2)', '3(1-2)'), terms).ready).toBe(false)
})
