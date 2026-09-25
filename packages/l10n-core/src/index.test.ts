import { describe, expect, it, vi } from 'vitest'
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

it('界面井号按字面精确匹配，不作为游戏数值模板', () => {
  const lex = createLexicon([
    term('stored', '# Stored', '保存数量', 'ui'),
    term('label', 'Issue #', '问题 #', 'ui'),
  ])
  expect(lex.translate(' # Stored ')).toBe(' 保存数量 ')
  expect(lex.translate('10 Stored')).toBeNull()
  expect(lex.translate('Issue #')).toBe('问题 #')
  expect(lex.translate('Issue 3')).toBeNull()
  expect(() =>
    createLexicon([term('invalid-ui-order', '# Stored', '保存数量', 'ui', { order: [0] })]),
  ).toThrow()
})

it('纯数字计数不尝试带英文单词的模板，仍支持纯符号模板和数值界面词条', () => {
  const lex = createLexicon([
    ...Array.from({ length: 100 }, (_, i) =>
      term(`res-${i}`, `#% Resistance ${i}`, `抗性 ${i} #%`),
    ),
    term('plain', '#%', '#%（比例）'),
    term('numeric-ui', '100', '一百', 'ui'),
  ])
  const original = RegExp.prototype.exec
  let unrelated = 0
  const spy = vi.spyOn(RegExp.prototype, 'exec').mockImplementation(function (this: RegExp, text) {
    if (this.source.includes('resistance')) unrelated++
    return original.call(this, text)
  })
  try {
    expect(lex.translate('12345')).toBeNull()
    expect(lex.translate('25%')).toBe('25%（比例）')
    expect(lex.translate('100')).toBe('一百')
    expect(unrelated).toBe(0)
  } finally {
    spy.mockRestore()
  }
})
it('字面命中不能掩盖模板冲突，领域筛选与相同译文仍保持原语义', () => {
  const lex = createLexicon([
    term('ui', 'Gain 5 Life', '界面文案', 'ui'),
    term('stat', 'Gain # Life', '获得 # 生命'),
    term('base', 'Runed Focus', '符文法器', 'base'),
    term('other', 'Runed Focus', '符文法器', 'item'),
  ])
  expect(lex.translate('Gain 5 Life')).toBeNull()
  expect(lex.translate('Gain 5 Life', 'ui')).toBe('界面文案')
  expect(lex.translate('Gain 5 Life', 'stat')).toBe('获得 5 生命')
  expect(lex.translate('  RUNED   FOCUS  ')).toBe('  符文法器  ')
})

it('限定候选范围后仍保留排序与50项上限，后续无范围查询不受污染', () => {
  const terms = Array.from({ length: 120 }, (_, i) =>
    term(String(i), `Resistance ${i}`, `抗性 ${i}`),
  )
  const lex = createLexicon(terms)
  const accept = (entry: { id: string }) => Number(entry.id) >= 60
  const expected = createLexicon(terms.filter(accept)).search('抗性', 'stat')
  const scoped = lex.search('抗性', 'stat', accept)
  expect(scoped).toEqual(expected)
  expect(scoped).toHaveLength(50)
  expect(lex.search('抗性', 'stat').some((candidate) => Number(candidate.term.id) < 60)).toBe(true)
})
