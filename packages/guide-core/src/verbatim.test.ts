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
