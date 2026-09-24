import { describe, expect, it } from 'vitest'
import { createLexicon, type Term } from './index'

const term = (
  id: string,
  en: string,
  zh: string,
  domain: Term['domain'] = 'stat',
  extra: Partial<Term> = {},
): Term => ({ id, en, zh, domain, source: 'synthetic', version: 'test', ...extra })
const terms = [
  term('focus', 'Runed Focus', '符文法器', 'base'),
  term('cold', 'Cold Resistance', '冰霜抗性'),
  term('lightning', '#% to Lightning Resistance', '闪电抗性 #%'),
  term('pair', 'Adds # to # Cold Damage', '附加 # 至 # 点冰霜伤害'),
  term('fixed', 'Gain # Mana every 2 seconds', '每 2 秒获得 # 魔力'),
  term('reordered', 'Gain # Life for # seconds', '持续 # 秒获得 # 生命', 'stat', { order: [1, 0] }),
  term('alias', 'Exalted Orb', '崇高石', 'material', { aliases: ['崇高'] }),
]
describe('国服术语显示', () => {
  it('精确翻译名称且保留边缘空白', () =>
    expect(createLexicon(terms).translate(' Runed Focus\n')).toBe(' 符文法器\n'))
  it('将前置正负号和小数带到中文数字位置', () => {
    expect(createLexicon(terms).translate('+18% to Lightning Resistance')).toBe('闪电抗性 +18%')
    expect(createLexicon(terms).translate('-2.5% to Lightning Resistance')).toBe('闪电抗性 -2.5%')
  })
  it('保留基础范围和双数值身份', () =>
    expect(createLexicon(terms).translate('Adds 12(10-15) to 25(20-30) Cold Damage')).toBe(
      '附加 12(10-15) 至 25(20-30) 点冰霜伤害',
    ))
  it('固定数字不参加替换或错误匹配', () => {
    const lex = createLexicon(terms)
    expect(lex.translate('Gain 5 Mana every 2 seconds')).toBe('每 2 秒获得 5 魔力')
    expect(lex.translate('Gain 5 Mana every 3 seconds')).toBeNull()
  })
  it('按声明重排数字', () =>
    expect(createLexicon(terms).translate('Gain 40 Life for 3 seconds')).toBe(
      '持续 3 秒获得 40 生命',
    ))
  it('未知或冲突翻译不猜测', () => {
    expect(createLexicon(terms).translate('Unknown affix')).toBeNull()
    expect(
      createLexicon([...terms, term('conflict', 'Runed Focus', '另一法器', 'base')]).translate(
        'Runed Focus',
      ),
    ).toBeNull()
  })
  it('相同模板不同身份但相同译文可显示', () =>
    expect(
      createLexicon([...terms, term('duplicate', 'Cold Resistance', '冰霜抗性')]).translate(
        'Cold Resistance',
      ),
    ).toBe('冰霜抗性'))
  it('数字数量和 order 不合法时拒绝词条', () => {
    expect(() => createLexicon([term('bad', 'Gain # Life', '获得 # 至 # 生命')])).toThrow()
    expect(() =>
      createLexicon([
        term('bad', 'Gain # Life for # seconds', '获得 # 持续 #', 'stat', { order: [0, 0] }),
      ]),
    ).toThrow()
  })
  it('同一身份不能覆盖成另一词条', () =>
    expect(() =>
      createLexicon([
        term('focus', 'Runed Focus', '符文法器', 'base'),
        term('focus', 'Another', '另一', 'base'),
      ]),
    ).toThrow())
  it('模板特殊字符按字面匹配', () => {
    const lex = createLexicon([term('special', 'Damage (#%) [Local]', '伤害（#%）[本地]')])
    expect(lex.translate('Damage (15%) [Local]')).toBe('伤害（15%）[本地]')
    expect(lex.translate('Damage 15 Local')).toBeNull()
  })
})
describe('中文检索候选', () => {
  it('唯一中文精确词与英文原词找到同一身份', () => {
    expect(
      createLexicon(terms)
        .search('冰霜抗性', 'stat')
        .map((x) => [x.term.id, x.exact]),
    ).toEqual([['cold', true]])
    expect(createLexicon(terms).search('cold resistance', 'stat')[0]?.term.id).toBe('cold')
  })
  it('别名与部分词保留候选但不自动判为精确', () => {
    expect(createLexicon(terms).search('崇高', 'material')[0]?.exact).toBe(false)
    expect(createLexicon(terms).search('抗性', 'stat')).toHaveLength(2)
  })
  it('按领域隔离同名术语', () => {
    const lex = createLexicon([...terms, term('other', 'Cold Material', '冰霜抗性', 'material')])
    expect(lex.search('冰霜抗性', 'stat').map((x) => x.term.id)).toEqual(['cold'])
  })
  it('同名多身份不擅自选第一个', () =>
    expect(
      createLexicon([...terms, term('other', 'Other Resistance', '冰霜抗性')]).search(
        '冰霜抗性',
        'stat',
      ),
    ).toHaveLength(2))
  it('中英混合词全部参与匹配', () =>
    expect(createLexicon(terms).search('Runed 法器', 'base')[0]?.term.id).toBe('focus'))
  it('空输入与未知词不产生候选', () => {
    expect(createLexicon(terms).search('', 'base')).toEqual([])
    expect(createLexicon(terms).search('不存在', 'base')).toEqual([])
  })
})
it('CoE 列表占位符与区间保持原样', () => {
  const lex = createLexicon([
    {
      id: 'r',
      en: '#% to Lightning Resistance',
      zh: '闪电抗性 #%',
      domain: 'stat',
      source: 'test',
      version: 'test',
    },
  ])
  expect(lex.translate('+#% to Lightning Resistance')).toBe('闪电抗性 +#%')
  expect(lex.translate('+(16-20)% to Lightning Resistance')).toBe('闪电抗性 +(16-20)%')
})
it('部分查询先显示更简短的匹配术语，但仍不自动认作精确身份', () => {
  const lex = createLexicon([
    term('a', 'Enemies have Lightning Resistance equal to yours', '敌人的闪电抗性与你相同'),
    term('b', '#% to Maximum Lightning Resistance', '#%闪电抗性上限'),
    term('z', '#% to Lightning Resistance', '闪电抗性 #%'),
  ])
  expect(lex.search('闪电抗性', 'stat').map((c) => [c.term.id, c.exact])).toEqual([
    ['z', false],
    ['b', false],
    ['a', false],
  ])
})
it('完整名称精确匹配优先于短别名，排序后才截取50项', () => {
  const many = Array.from({ length: 55 }, (_, i) =>
    term(`a${i}`, `Long term ${i}`, `长前缀 冰霜抗性 ${i}`),
  )
  const lex = createLexicon([
    ...many,
    term('z', 'Cold Resistance', '冰霜抗性'),
    term('alias', 'Other', '其他', 'stat', { aliases: ['冰霜抗性'] }),
  ])
  const result = lex.search('冰霜抗性', 'stat')
  expect(result).toHaveLength(50)
  expect(result[0]?.term.id).toBe('z')
  expect(result[1]?.term.id).toBe('alias')
  expect(result[1]?.exact).toBe(false)
})
