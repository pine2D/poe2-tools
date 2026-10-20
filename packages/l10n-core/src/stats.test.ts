import { describe, expect, it } from 'vitest'
import { createGameLexicon } from './stats'
import type { Term } from './types'

const stat = (id: string, en: string, zh: string, extra: Partial<Term> = {}): Term => ({
  id,
  en,
  zh,
  domain: 'stat',
  source: 'synthetic',
  version: 'test',
  ...extra,
})

describe('共用词缀契约', () => {
  it('正反向共享数值、符号、区间及非对称顺序', () => {
    const lex = createGameLexicon([
      stat('a', 'Gain # Life for # seconds every 4 seconds', '每 4 秒持续 # 秒获得 # 生命', {
        order: [1, 0],
      }),
      stat('b', '+# to maximum Life', '+# 生命上限'),
    ])
    expect(lex.translate('Gain -2.5(1-3) Life for 6 seconds every 4 seconds', 'stat')).toBe(
      '每 4 秒持续 6 秒获得 -2.5(1-3) 生命',
    )
    expect(lex.resolveStat('每4秒持续6秒获得-2.5(1-3)生命', 'toEnglish').text).toBe(
      'Gain -2.5(1-3) Life for 6 seconds every 4 seconds',
    )
    expect(lex.resolveStat('+95(85-99) 生命上限', 'toEnglish').text).toBe(
      '+95(85-99) to maximum Life',
    )
    expect(lex.translate('+# to maximum Life', 'stat')).toBe('+# 生命上限')
    expect(lex.translate('+(85-99) to maximum Life', 'stat')).toBe('+(85-99) 生命上限')
    expect(lex.translate('Gain 5 Life for 6 seconds every 999 seconds', 'stat')).toBeNull()
    expect(lex.resolveStat('每999秒持续6秒获得5生命', 'toEnglish').status).toBe('unmatched')
    const triple = createGameLexicon([
      stat('triple', 'Gain # Life and # Mana for # seconds', '持续 # 秒获得 # 生命及 # 魔力', {
        order: [2, 0, 1],
      }),
    ])
    expect(triple.translate('Gain 10 Life and 25 Mana for 3 seconds')).toBe(
      '持续 3 秒获得 10 生命及 25 魔力',
    )
    expect(triple.resolveStat('持续 3 秒获得 10 生命及 25 魔力', 'toEnglish').text).toBe(
      'Gain 10 Life and 25 Mana for 3 seconds',
    )
  })

  it('显示、中文搜索、输入使用同一受限降低规则', () => {
    const lex = createGameLexicon([
      stat('a', '#% increased Attribute Requirements', '属性需求提高 #%'),
    ])
    expect(lex.resolveStat('(15-20)% reduced Attribute Requirements')).toMatchObject({
      status: 'translated',
      text: '属性需求降低 (15-20)%',
      candidates: [{ path: 'polarity' }],
    })
    expect(lex.resolveStat('属性需求降低 18(15-20)%', 'toEnglish').text).toBe(
      '18(15-20)% reduced Attribute Requirements',
    )
    expect(lex.search('属性需求降低', 'stat')[0]?.term.en).toBe('#% reduced Attribute Requirements')
    expect(lex.translate('20% less Attribute Requirements', 'stat')).toBeNull()
    expect(lex.resolveStat('18% reduced Attribute Requirements', 'toEnglish').text).toBe(
      '18% reduced Attribute Requirements',
    )
  })

  it('原始 reduced 模板优先；多重提高、已有降低或条件中的 increased 不盲目派生', () => {
    const lex = createGameLexicon([
      stat('a', '#% increased Damage', '伤害提高 #%'),
      stat('b', '#% reduced Damage', '伤害降低 #%（原始）'),
      stat('c', '#% increased Damage with increased Speed', '速度提高时伤害提高 #%'),
      stat('d', 'Damage while Speed is increased by #%', '速度提高 #% 时的伤害'),
    ])
    expect(lex.translate('20% reduced Damage', 'stat')).toBe('伤害降低 20%（原始）')
    expect(lex.translate('20% reduced Damage with increased Speed', 'stat')).toBeNull()
    expect(lex.translate('Damage while Speed is reduced by 20%', 'stat')).toBeNull()
  })

  it('显式 winner 仅裁决相同原模板，不吞掉别的重叠模板或真实歧义', () => {
    const entries = [
      stat('local', '#% increased Spirit', '该装备精魂提高 #%'),
      stat('general', '#% increased Spirit', '精魂提高 #%', { preferred: true }),
    ]
    expect(createGameLexicon(entries).translate('20% increased Spirit', 'stat')).toBe(
      '精魂提高 20%',
    )
    expect(
      createGameLexicon([...entries].reverse()).translate('20% increased Spirit', 'stat'),
    ).toBe('精魂提高 20%')
    expect(createGameLexicon(entries).resolveStat('该装备精魂提高 20%', 'toEnglish').text).toBe(
      '20% increased Spirit',
    )
    const overlapping = createGameLexicon([
      ...entries,
      stat('fixed', '20% increased Spirit', '固定二十精魂'),
    ])
    expect(overlapping.resolveStat('20% increased Spirit').status).toBe('ambiguous')
    const ambiguous = createGameLexicon([stat('x', 'Key', '甲'), stat('y', 'Key', '乙')])
    expect(ambiguous.translate('Key', 'stat')).toBeNull()
    expect(ambiguous.resolveStat('Key').candidates).toHaveLength(2)
  })

  it('同名中译不同英文不因 winner 猜译，输入繁体不污染简体显示', () => {
    const lex = createGameLexicon([
      stat('x', 'First', '同名', { preferred: true }),
      stat('y', 'Second', '同名'),
      stat('cn', '#% increased Armour', '护甲提高 #%'),
      stat('tw', '#% increased Armour', '增加#%護甲', { inputOnly: true }),
    ])
    expect(lex.resolveStat('同名', 'toEnglish').status).toBe('ambiguous')
    expect(lex.translate('20% increased Armour', 'stat')).toBe('护甲提高 20%')
    expect(lex.resolveStat('減少20%護甲', 'toEnglish').text).toBe('20% reduced Armour')
    expect(lex.search('護甲', 'stat')).toEqual([])
  })

  it('区分缺模板、源仍英文、候选冲突；来源已有中文时不被英文副本阻断', () => {
    const lex = createGameLexicon([
      stat('missing', 'Not localised', 'Not localised'),
      stat('translated', 'Battery', '魔力'),
      stat('untranslated', 'Battery', 'Battery'),
    ])
    expect(lex.resolveStat('Unknown').status).toBe('unmatched')
    expect(lex.resolveStat('Not localised').status).toBe('source-untranslated')
    expect(lex.translate('Not localised', 'stat')).toBeNull()
    expect(lex.translate('Battery', 'stat')).toBe('魔力')
  })

  it('已核对的导入别名与复数规范沿用，其他相似字句不猜测', () => {
    const lex = createGameLexicon([
      stat('slot', 'Has # Charm Slot', '具有 # 个咒符栏', { sourceId: 'implicit.stat_1416292992' }),
      stat(
        'onslaught',
        'Companions gain Onslaught for # second on Hitting your Marked targets',
        '同伴击中你标记的目标时获得 # 秒猛攻',
        { sourceId: 'rune.stat_226999623' },
      ),
    ])
    expect(lex.resolveStat('具有 2 个咒符位', 'toEnglish').text).toBe('Has 2 Charm Slot')
    expect(lex.search('咒符位', 'stat')[0]?.term.en).toBe('Has # Charm Slot')
    expect(lex.resolveStat('同伴击中你标记的目标时获得 3 秒猛攻', 'toEnglish').text).toBe(
      'Companions gain Onslaught for 3 seconds on Hitting your Marked targets',
    )
    expect(lex.resolveStat('具有 2 个任意槽', 'toEnglish').status).toBe('unmatched')
  })

  it('普通界面与名称接口仍精确匹配，并保留边缘空白', () => {
    const lex = createGameLexicon([stat('a', 'Armour', '护甲', { domain: 'ui' })])
    expect(lex.translate(' Armour\n', 'ui')).toBe(' 护甲\n')
    expect(lex.search('护甲', 'ui')[0]?.term.id).toBe('a')
    expect(lex.resolveStat('Armour').status).toBe('unmatched')
  })
})
