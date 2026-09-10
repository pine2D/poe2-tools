import { describe, expect, it } from 'vitest'
import { markupClass, resolveRgbTag, sliceSpans, spanText, splitMarkupLines } from './markup'

describe('splitMarkupLines', () => {
  it('空串没有行；纯文本按 \\n 切行', () => {
    expect(splitMarkupLines('')).toEqual([])
    expect(splitMarkupLines('a\nb').map(spanText)).toEqual(['a', 'b'])
  })

  it('标记跨行也能正确切：整段先分词，再带着标记栈换行', () => {
    const lines = splitMarkupLines('<grey>{Stat Priority\n---\n1. x}')
    expect(lines.map(spanText)).toEqual(['Stat Priority', '---', '1. x'])
    for (const line of lines) expect(line[0]?.tags).toEqual(['grey'])
  })

  it('嵌套标记从外到内记进 tags', () => {
    const [line] = splitMarkupLines('<m>{<red>{Strength +5}}')
    expect(line?.[0]).toEqual({ text: 'Strength +5', tags: ['m', 'red'] })
  })

  it('一行里标记内外混排，切成多段', () => {
    const [line] = splitMarkupLines('Take <green>{BEFORE} the totem')
    expect(line?.map((s) => [s.text, s.tags])).toEqual([
      ['Take ', []],
      ['BEFORE', ['green']],
      [' the totem', []],
    ])
  })

  it('花括号配不上对时整段按纯文本透传，不丢字符', () => {
    const raw = '<red>{unclosed'
    expect(splitMarkupLines(raw).map(spanText)).toEqual([raw])
  })

  it('空行保留成空数组，行数不塌', () => {
    expect(splitMarkupLines('a\n\nb').map(spanText)).toEqual(['a', '', 'b'])
  })
})

describe('sliceSpans', () => {
  it('从头砍掉 n 个字符，跨段也对', () => {
    const [line = []] = splitMarkupLines('1. <red>{x}y')
    expect(spanText(sliceSpans(line, 3))).toBe('xy')
    expect(sliceSpans(line, 3)[0]?.tags).toEqual(['red'])
    expect(spanText(sliceSpans(line, 0))).toBe('1. xy')
    expect(sliceSpans(line, 99)).toEqual([])
  })
})

describe('markupClass', () => {
  it('取最内层的颜色标签，字号与字形可以叠加', () => {
    expect(markupClass(['m', 'red'])).toBe('mk-m mk-red')
    expect(markupClass(['red', 'green'])).toBe('mk-green')
    expect(markupClass(['b', 'u'])).toBe('mk-b mk-u')
  })

  it('未知标签不产生类名，也不影响已知标签', () => {
    expect(markupClass(['wat'])).toBe('')
    expect(markupClass(['wat', 'gold'])).toBe('mk-gold')
    expect(markupClass([])).toBe('')
  })
})

describe('resolveRgbTag', () => {
  it('识别 rgb(...) 并按需提亮到 4.5:1', () => {
    // 亮色原样返回
    expect(resolveRgbTag('rgb(255, 255, 255)')).toBe('#ffffff')
    // 暗红在 #1d1a14 上远不达标，会被向白提亮
    const lifted = resolveRgbTag('rgb(120, 0, 0)')
    expect(lifted).not.toBeNull()
    expect(lifted).not.toBe('#780000')
  })

  it('不是 rgb 标签就返回 null', () => {
    expect(resolveRgbTag('red')).toBeNull()
    expect(resolveRgbTag('rgb(1,2)')).toBeNull()
  })
})
