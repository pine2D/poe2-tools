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
