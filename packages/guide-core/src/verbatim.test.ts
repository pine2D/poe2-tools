import { describe, expect, it } from 'vitest'
import { findVerbatim, protect, restore } from './verbatim'

const pieces = (text: string) => findVerbatim(text).map(([a, b]) => text.slice(a, b))

describe('findVerbatim', () => {
  it('识别正则、反引号代码、网址与长编码', () => {
    const text =
      'REGEX: "\\d+% i.+mov|res" then `ctrl+f` see https://example.com/a?b=1 code eNrtXVtz2zgSfsfvAAAAAAAAAAAAAAAAAAAAAAAAAAAA end'
    expect(pieces(text)).toEqual([
      '"\\d+% i.+mov|res"',
      '`ctrl+f`',
      'https://example.com/a?b=1',
      'eNrtXVtz2zgSfsfvAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ])
  })
  it('普通引号文字不算', () => {
    expect(pieces('Search "rare" in stash')).toEqual([])
  })
  it('双引号按顺序两两配对，引号之间的正文不被当成一段', () => {
    expect(pieces('The "best" item gives +50 Life and the "worst" one too.')).toEqual([])
    expect(pieces('Pick "a" (or b|c) then "d"')).toEqual([])
  })
  it('只有强正则特征才保护，词缀文本里的 + 与括号不算', () => {
    expect(pieces('"+(80-89) to maximum Life"')).toEqual([])
    expect(pieces('REGEX: "\\d+% i.+mov|res"')).toEqual(['"\\d+% i.+mov|res"'])
    expect(pieces('use "^rare$" or "a.*b" or "[abc]x" or "\\w"')).toEqual([
      '"^rare$"',
      '"a.*b"',
      '"[abc]x"',
      '"\\w"',
    ])
  })
})

describe('protect / restore', () => {
  it('替换成占位符并能还原', () => {
    const text = 'Use "a|b" and `c`'
    const p = protect(text, findVerbatim(text))
    expect(p).toEqual({ text: 'Use ⟦0⟧ and ⟦1⟧', tokens: ['"a|b"', '`c`'] })
    expect(restore('使用 ⟦0⟧ 和 ⟦1⟧', p.tokens)).toEqual({
      text: '使用 "a|b" 和 `c`',
      missing: [],
      duplicated: [],
    })
  })
  it('报告缺失与重复的占位符', () => {
    expect(restore('只有 ⟦1⟧ ⟦1⟧', ['x', 'y'])).toEqual({
      text: '只有 y y',
      missing: [0],
      duplicated: [1],
    })
  })
  it('无关的方括号与越界编号原样保留', () => {
    expect(restore('⟦9⟧ [0]', ['x'])).toEqual({ text: '⟦9⟧ [0]', missing: [0], duplicated: [] })
  })
})
