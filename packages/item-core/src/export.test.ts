import { describe, expect, it } from 'vitest'
import { createCoeUrl, inspectItem } from './export'
import { parseItem } from './parse'

const focus = `物品类别: 法器
稀有度: 稀有
试验 星光
符文法器
--------
能量护盾: 80 (augmented)
--------
需求： 等级 45, 64 智慧
--------
物品等级: 46
--------
{ 前缀属性 "测试的" (等阶：6) — 能量护盾 }
+38(36-41) 能量护盾上限
{ 后缀属性 "测试之" (等阶：6) — 元素, 闪电, 抗性 }
闪电抗性 +17(16-20)%`

const dictionary = {
  items: { bases: { 'Runed Focus': '符文法器', 'Stone Charm': '磐石咒符' }, uniques: {} },
  stats: {
    entries: [
      { id: 'explicit.stat_4052037485', en: '# to maximum Energy Shield', text: '# 能量护盾上限' },
      { id: 'explicit.stat_1671376347', en: '#% to Lightning Resistance', text: '闪电抗性 #%' },
    ],
  },
}

function inspect(text = focus) {
  const parsed = parseItem(text)
  if (!parsed.ok) throw new Error(parsed.error)
  return inspectItem(parsed.item, dictionary)
}

describe('装备对照与受控 CoE 转接', () => {
  it.each(['Crystal Focus', 'Twig Focus', 'Wreath Focus'])(
    '已验收的普通法器 %s 支持魔法与稀有转接',
    (name) => {
      const expanded = {
        ...dictionary,
        items: { bases: { [name]: '测试法器' }, uniques: {} },
      }
      for (const magic of [false, true]) {
        const text = focus.replace('符文法器', '测试法器')
        const parsed = parseItem(
          magic ? text.replace('稀有度: 稀有\n试验 星光', '稀有度: 魔法') : text,
        )
        if (!parsed.ok) throw new Error(parsed.error)
        const result = inspectItem(parsed.item, expanded)
        expect(result.bridgeReasons).toEqual([])
        expect(result.bridgeText).toContain(name)
        expect(result.bridgeText).toContain(`Rarity: ${magic ? 'Magic' : 'Rare'}`)
        expect(result.bridgeText).toContain('+38(36-41) to maximum Energy Shield')
        expect(result.bridgeText).toContain('+17(16-20)% to Lightning Resistance')
      }
    },
  )

  it('魔法转接拒绝超过一前一后，锻造与未知法器不借普通名单放行', () => {
    const magic = focus.replace('稀有度: 稀有\n试验 星光', '稀有度: 魔法')
    const tooMany = inspect(`${magic}\n{ 前缀属性 "重复的" (等阶：6) }\n+38(36-41) 能量护盾上限`)
    expect(tooMany.bridgeText).toBeNull()
    expect(tooMany.bridgeReasons).toContain('前后缀数量超出魔法法器的一前一后限制。')
    for (const name of ['Runeforged Runed Focus', 'Future Focus']) {
      const parsed = parseItem(focus)
      if (!parsed.ok) throw new Error(parsed.error)
      const result = inspectItem(parsed.item, {
        ...dictionary,
        items: { bases: { [name]: '符文法器' }, uniques: {} },
      })
      expect(result.bridgeText).toBeNull()
    }
  })

  it('符文行去标记反查后恢复标记，独立于普通后缀并可选择真实歧义候选', () => {
    const text = `${focus}\n--------\n闪电抗性 +20% (rune)\n未知效果 (rune)`
    const parsed = parseItem(text)
    if (!parsed.ok) throw new Error(parsed.error)
    const result = inspectItem(parsed.item, dictionary)
    expect(result.runes).toHaveLength(2)
    expect(result.mods).toHaveLength(2)
    expect(result.runes[0]?.resolution.english).toBe('+20% to Lightning Resistance')
    expect(result.exportText).toContain('+20% to Lightning Resistance (rune)')
    expect(result.exportText).toContain('未知效果 (rune)')
    expect(result.bridgeText).toBeNull()
    const ambiguous = {
      ...dictionary,
      stats: {
        entries: [
          ...dictionary.stats.entries,
          { id: 'test-cold', en: '#% to Cold Resistance', text: '闪电抗性 #%' },
        ],
      },
    }
    const before = inspectItem(parsed.item, ambiguous)
    expect(before.runes[0]?.resolution.english).toBeNull()
    const first = before.runes[0]
    if (!first) throw new Error('缺少符文行')
    const after = inspectItem(parsed.item, ambiguous, { [first.source.line]: 'test-cold' })
    expect(after.runes[0]?.resolution.english).toBe('+20% to Cold Resistance')
    expect(after.exportText).toContain('+20% to Cold Resistance (rune)')
    expect(after.runes[0]?.source.raw).toBe('闪电抗性 +20% (rune)')
  })
  it('仅以引号结尾的未知内容不会作为风味删除，风味闭合后恢复结构识别', () => {
    for (const extra of [
      'FutureState: "active"\nFutureConstraint: enabled',
      '“测试风味。”\nFutureConstraint: enabled',
      '“测试风味，\n在这里结束。”\nFutureConstraint: enabled',
    ]) {
      const result = inspect(`${focus}\n--------\n${extra}`)
      expect(result.bridgeText).toBeNull()
      expect(result.exportText).toContain('FutureConstraint: enabled')
    }
  })

  it('基底和传奇属性头仅翻译已识别结构，未知限定词保留', () => {
    for (const kind of ['基底属性', '传奇属性']) {
      const result = inspect(`${focus}\n--------\n{ FutureMechanic ${kind} }\n未知效果`)
      expect(result.exportText).toContain(`{ FutureMechanic ${kind} }`)
      expect(result.bridgeText).toBeNull()
    }
  })

  it('未知属性头修饰和多余名称行不能在转接时静默丢失', () => {
    const header = inspect(focus.replace('"测试的" (等阶：6)', '"测试的" (等阶：6) FutureMechanic'))
    expect(header.bridgeText).toBeNull()
    expect(header.exportText).toContain('FutureMechanic')
    const names = inspect(focus.replace('试验 星光\n符文法器', '试验 星光\n未知装备状态\n符文法器'))
    expect(names.bridgeText).toBeNull()
    expect(names.exportText).toContain('未知装备状态')
  })
  it('已验证法器保留实际值、范围与词缀组，备注不进入转接', () => {
    const result = inspect(`${focus}\n--------\n备注: ~b/o 5 divine`)
    expect(result.base.english).toBe('Runed Focus')
    expect(result.exportText).toContain('+38(36-41) to maximum Energy Shield')
    expect(result.exportText).toContain('{ Prefix Modifier "测试的" (Tier: 6) — 能量护盾 }')
    expect(result.exportText).not.toContain('~b/o')
    expect(result.bridgeReasons).toEqual([])
    expect(result.bridgeText).toBe(result.exportText)
  })

  it('咒符与传奇是只读对照，腐化等状态阻断转接', () => {
    expect(inspect(focus.replace('法器', '咒符')).comparisonOnly).toBe(true)
    expect(inspect(focus.replace('稀有度: 稀有', '稀有度: 传奇')).comparisonOnly).toBe(true)
    const corrupted = inspect(`${focus}\n--------\n被腐化`)
    expect(corrupted.bridgeText).toBeNull()
    expect(corrupted.exportText).toContain('Corrupted')
  })

  it('未知词缀保留原文且禁用完整转接，普通复制也不伪造高级信息', () => {
    const unknown = inspect(focus.replace('闪电抗性 +17(16-20)%', '未收录效果 17%'))
    expect(unknown.exportText).toContain('未收录效果 17%')
    expect(unknown.bridgeText).toBeNull()
    const plain = inspect(focus.replace(/\{[^}]+\}\n/g, ''))
    expect(plain.bridgeText).toBeNull()
  })

  it('无词典仍能查看原始结构；候选选择必须来自真实候选', () => {
    const parsed = parseItem(focus)
    if (!parsed.ok) throw new Error(parsed.error)
    const result = inspectItem(parsed.item, {})
    expect(result.mods).toHaveLength(2)
    expect(result.bridgeText).toBeNull()
    expect(result.base.english).toBeNull()
  })

  it('英文输入按英文模板识别，不套中文占位符顺序', () => {
    const en = inspect().exportText
    expect(inspect(en).bridgeText).toBe(en)
    const url = new URL(createCoeUrl(en))
    expect(url.searchParams.get('game')).toBe('poe2')
    expect(url.searchParams.get('eimport')).toBe(en)
  })

  it('用户只可从词典候选中选基底和属性，伪造 id 无效', () => {
    const parsed = parseItem(focus)
    if (!parsed.ok) throw new Error(parsed.error)
    const ambiguous = {
      ...dictionary,
      items: { bases: { 'Runed Focus': '符文法器', Other: '符文法器' }, uniques: {} },
    }
    const nameLine = parsed.item.nameLines.at(-1)?.line ?? 0
    expect(inspectItem(parsed.item, ambiguous).bridgeText).toBeNull()
    expect(
      inspectItem(parsed.item, ambiguous, { [nameLine]: 'Runed Focus' }).bridgeText,
    ).not.toBeNull()
    expect(inspectItem(parsed.item, ambiguous, { [nameLine]: 'fake' }).bridgeText).toBeNull()
  })

  it('混合后缀仍为一组，技能区块不当成词缀并明确未完成英译', () => {
    const sample =
      focus.replace('闪电抗性 +17(16-20)%', '闪电抗性 +17(16-20)%\n闪电抗性 +18(16-20)%') +
      '\n--------\n获得技能: 等级 12 未收录技能（最高等级 13）'
    const result = inspect(sample)
    expect(result.mods).toHaveLength(2)
    expect(result.mods[1]?.stats).toHaveLength(2)
    expect(result.bridgeText).toBeNull()
    expect(result.exportText).toContain('获得技能: 等级 12 未收录技能（最高等级 13）')
  })
})

it.each([
  '{ Prefix Modifier "Tier: 6" — energy shield }',
  '{ Prefix Modifier "Test" — energy shield (Tier: 6) }',
  '{ Prefix Modifier "等阶：6" — energy shield }',
])('名称或标签内的伪 Tier 不开放 CoE：%s', (header) => {
  const raw = `Item Class: Foci\nRarity: Rare\nCrafting Simulation\nRuned Focus\n--------\nItem Level: 80\n--------\n${header}\n+38 to maximum Energy Shield`
  const parsed = parseItem(raw)
  if (!parsed.ok) throw new Error(parsed.error)
  expect(parsed.item.mods[0]?.tier).toBeNull()
  const result = inspectItem(parsed.item, dictionary)
  expect(result.exportText).toContain(header)
  expect(result.bridgeText).toBeNull()
  expect(result.bridgeReasons).toContain('存在尚未验证的词缀类型、混合词缀或缺失阶级。')
})

it.each([
  '{ Prefix Modifier "Tier: 9" (Tier: 6) — energy shield (Tier: 8) }',
  '{ 前缀属性 "测试" (等阶：6) — 能量护盾 }',
  '{ 前綴屬性 “測試” (階級：6) — 能量護盾 }',
  '{ Suffix Modifier "Test" (Tier: 6) }',
])('仅名称后的规范独立段提供真实 Tier：%s', (header) => {
  const parsed = parseItem(
    `Item Class: Foci\nRarity: Rare\nTest Name\nRuned Focus\n--------\nItem Level: 80\n--------\n${header}\n+38 to maximum Energy Shield`,
  )
  if (!parsed.ok) throw new Error(parsed.error)
  expect(parsed.item.mods[0]?.tier).toBe(6)
})

it.each([
  ['物品类别: 法杖\n稀有度: 普通\n国服测试基底', 'Staves'],
  ['物品種類: 法杖\n稀有度: 普通\n台服測試基底', 'Wands'],
  ['物品種類: 長杖\n稀有度: 普通\n台服測試基底', 'Staves'],
  ['物品类别: 腰带\n稀有度: 普通\n国服测试基底', 'Belts'],
])('类别按原文语言反查，避免同名跨服串类：%s', (text, expected) => {
  const parsed = parseItem(text)
  if (!parsed.ok) throw Error(parsed.error)
  expect(inspectItem(parsed.item, {}).exportText.split('\n')[0]).toBe(`Item Class: ${expected}`)
})
