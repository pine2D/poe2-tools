import { expect, it } from 'vitest'
import { createCatalogTranslator } from './catalogTranslation'

it('目录范围整体回填中文，双范围按词典顺序排列，歧义不猜测', () => {
  const translate = createCatalogTranslator([
    { id: 'life', en: '# to maximum Life', text: '# 生命上限' },
    {
      id: 'swap',
      en: 'Lose # Life to gain # Mana',
      text: '获得 # 魔力，消耗 # 生命',
      order: [1, 0],
    },
    { id: 'literal', en: 'Level 20 Spell has # Damage', text: '20 级法术有 # 伤害' },
  ])
  expect(translate('+(10-20) to maximum Life')).toBe('+(10-20) 生命上限')
  expect(translate('Lose (10-20) Life to gain (3-5) Mana')).toBe(
    '获得 (3-5) 魔力，消耗 (10-20) 生命',
  )
  expect(translate('Level 20 Spell has (3-5) Damage')).toBe('20 级法术有 (3-5) 伤害')
  expect(translate('Future effect')).toBeNull()
})

it('按trade hash消歧同英文模板并缓存上下文，错误身份不借其他namespace翻译', () => {
  const translate = createCatalogTranslator([
    {
      id: 'explicit.stat_3523867985',
      en: '#% increased Armour, Evasion and Energy Shield',
      text: '护甲、闪避和能量护盾提高 #%',
    },
    {
      id: 'sanctum.stat_1016362888',
      en: '#% increased Armour, Evasion and Energy Shield',
      text: '护甲、闪避与能量护盾提高 #%',
    },
    {
      id: 'explicit.stat_42',
      en: 'Lose # Life to gain # Mana',
      text: '获得 # 魔力，消耗 # 生命',
      order: [1, 0],
    },
    { id: 'life', en: '# to maximum Life', text: '# 生命上限' },
  ])
  expect(translate('16% increased Armour, Evasion and Energy Shield')).toBeNull()
  expect(translate('16% increased Armour, Evasion and Energy Shield', ['3523867985'])).toBe(
    '护甲、闪避和能量护盾提高 16%',
  )
  expect(translate('16% increased Armour, Evasion and Energy Shield', ['1016362888'])).toBe(
    '护甲、闪避与能量护盾提高 16%',
  )
  expect(translate('16% increased Armour, Evasion and Energy Shield', ['42'])).toBeNull()
  expect(translate('Lose (10-20) Life to gain (3-5) Mana', ['42'])).toBe(
    '获得 (3-5) 魔力，消耗 (10-20) 生命',
  )
  expect(translate('+(10-20) to maximum Life', ['missing'])).toBe('+(10-20) 生命上限')
})

import { readFileSync } from 'node:fs'
import { createStatResolver, type StatTemplate } from './resolve'

it.each(['zh-CN', 'zh-TW'] as const)('%s 真实雕像词典翻译并反查6.4秒和160/4条件', (locale) => {
  const entries: StatTemplate[] = JSON.parse(
    readFileSync(new URL(`../../../data/dict/${locale}/stats.json`, import.meta.url), 'utf8'),
  ).entries
  const translate = createCatalogTranslator(entries),
    resolve = createStatResolver(entries)
  for (const [hash, line] of [
    [
      '3370077792',
      'Enemies you Critically Hit get 160% reduced Life Regeneration Rate for 4 seconds',
    ],
    ['226999623', 'Companions gain Onslaught for 6.4 seconds on Hitting your Marked targets'],
  ] as const) {
    const local = translate(line, [hash])
    expect(local).not.toBeNull()
    expect(local).toMatch(/[\u4e00-\u9fff]/)
    expect(resolve(local as string).english).toBe(line)
  }
})
it('方向派生保留直接模板优先、歧义不猜测，单复数仅核对固定身份', () => {
  const direct = { id: 'rune.stat_1', en: '#% reduced Damage', text: '伤害下降 #%' }
  const increased = { id: 'rune.stat_1', en: '#% increased Damage', text: '伤害提高 #%' }
  expect(createCatalogTranslator([increased, direct])('10% reduced Damage', ['1'])).toBe(
    '伤害下降 10%',
  )
  expect(
    createCatalogTranslator([increased, { ...increased, text: '伤害数值提高 #%' }])(
      '10% reduced Damage',
    ),
  ).toBeNull()
  expect(
    createCatalogTranslator([
      {
        id: 'wrong',
        en: 'Companions gain Onslaught for # second on Hitting your Marked targets',
        text: '持续 # 秒',
      },
    ])('Companions gain Onslaught for 6.4 seconds on Hitting your Marked targets'),
  ).toBeNull()
  expect(
    createCatalogTranslator([{ ...increased, en: '#% more Damage' }])('10% less Damage'),
  ).toBeNull()
})
