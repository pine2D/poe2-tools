import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../testing/contrast'
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
  it('一次算出深浅两套值：深色主题向白提亮，浅色主题向黑压暗', () => {
    // 暗红在深底上远不达标 → 提亮；在浅底上本来就够 → 原样
    const dark = resolveRgbTag('rgb(120, 0, 0)')
    expect(dark).not.toBeNull()
    expect(dark?.dark).not.toBe('#780000')
    expect(dark?.light).toBe('#780000')
    // 纯白在浅底上不可见 → 压暗；在深底上原样
    const white = resolveRgbTag('rgb(255, 255, 255)')
    expect(white?.dark).toBe('#ffffff')
    expect(white?.light).not.toBe('#ffffff')
  })

  it('两套值都真的达标（按各自的卡片底算 ≥4.5:1）', () => {
    for (const raw of ['rgb(120, 0, 0)', 'rgb(255, 255, 255)', 'rgb(128, 128, 128)']) {
      const color = resolveRgbTag(raw)
      expect(color).not.toBeNull()
      expect(contrastRatio(color?.dark ?? '', '#1d1a14')).toBeGreaterThanOrEqual(4.4)
      expect(contrastRatio(color?.light ?? '', '#fffdf8')).toBeGreaterThanOrEqual(4.4)
    }
  })

  it('近黑输入两套值都达标：深底要提亮，浅底本来就够（控制者追加 e）', () => {
    const black = resolveRgbTag('rgb(0,0,0)')
    expect(black).not.toBeNull()
    expect(contrastRatio(black?.dark ?? '', '#1d1a14')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(black?.light ?? '', '#fffdf8')).toBeGreaterThanOrEqual(4.5)
  })

  it('不是 rgb 标签就返回 null', () => {
    expect(resolveRgbTag('red')).toBeNull()
    expect(resolveRgbTag('rgb(1,2)')).toBeNull()
  })
})
