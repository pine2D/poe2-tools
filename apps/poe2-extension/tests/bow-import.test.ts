import { expect, it } from 'vitest'
import { prepareImport } from '../src/adapters/coe-beta/import'

const terms = [
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
  normal.replace('粗制弓', '其他弓'),
  `${normal}\n--------\n被腐化`,
])('未验收武器结构继续拒绝：%s', (source) => {
  expect(prepareImport(source, terms).ready).toBe(false)
})

it('粗制弓敏捷等阶或范围不匹配时阻止原站静默纠正', () => {
  const magic = normal.replace('稀有度: 普通', '稀有度: 魔法') + suffix
  expect(prepareImport(magic.replace('等阶：4', '等阶：5'), terms).ready).toBe(false)
  expect(prepareImport(magic.replace('(21-24)', '(20-24)'), terms).ready).toBe(false)
})

it('人工兼容类别“弓”同样只映射已验收粗制弓档案', () => {
  expect(prepareImport(normal.replace('弓类', '弓'), terms).ready).toBe(true)
})
