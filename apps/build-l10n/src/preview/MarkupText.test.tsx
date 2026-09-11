import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkupText } from './MarkupText'
import { splitMarkupLines } from './markup'

afterEach(() => {
  cleanup()
})

function renderLine(raw: string) {
  const [line = []] = splitMarkupLines(raw)
  return render(<MarkupText spans={line} />).container
}

describe('MarkupText', () => {
  it('没有标记也没有数字的纯文本不包 span，原样输出', () => {
    const container = renderLine('increased Spell Damage')
    expect(container.textContent).toBe('increased Spell Damage')
    expect(container.querySelectorAll('span')).toHaveLength(0)
  })

  it('数值单独包成 .num，其余文字仍是裸文本', () => {
    const container = renderLine('+10 to maximum Life')
    expect(container.textContent).toBe('+10 to maximum Life')
    const nums = container.querySelectorAll('.num')
    expect(nums).toHaveLength(1)
    expect(nums[0]?.textContent).toBe('+10')
  })

  it('百分号与小数点跟着数值走，一行里多个数值各包各的', () => {
    const container = renderLine('3% increased Attack Speed per 25 Dexterity')
    expect(container.textContent).toBe('3% increased Attack Speed per 25 Dexterity')
    expect([...container.querySelectorAll('.num')].map((n) => n.textContent)).toEqual(['3%', '25'])
  })

  it('词内的数字不算数值，T17 这类词不被切开', () => {
    const container = renderLine('T17 map')
    expect(container.textContent).toBe('T17 map')
    expect(container.querySelectorAll('.num')).toHaveLength(0)
  })

  it('带单位后缀的写法不切半截数字，30s 整体不算数值', () => {
    const container = renderLine('30s cooldown')
    expect(container.textContent).toBe('30s cooldown')
    expect(container.querySelectorAll('.num')).toHaveLength(0)
  })

  it('紧跟着字母的百分数仍然是数值，只高亮数字本身', () => {
    const container = renderLine('+42% increased')
    expect(container.textContent).toBe('+42% increased')
    const nums = container.querySelectorAll('.num')
    expect(nums).toHaveLength(1)
    expect(nums[0]?.textContent).toBe('+42%')
  })

  it('标记内部的数值同样高亮，且 .num 在颜色 span 里面', () => {
    const container = renderLine('<red>{149% increased Spell Damage}')
    const outer = container.querySelector('span')
    expect(outer?.getAttribute('class')).toBe('mk-red')
    expect(outer?.querySelector('.num')?.textContent).toBe('149%')
  })

  it('命名颜色渲染成带类名的 span', () => {
    const container = renderLine('Take <green>{BEFORE} the totem')
    const span = container.querySelector('span')
    expect(span?.textContent).toBe('BEFORE')
    expect(span?.getAttribute('class')).toBe('mk-green')
    expect(container.textContent).toBe('Take BEFORE the totem')
  })

  it('嵌套标记的字号与颜色叠加在同一个 span 上，数值 span 嵌在它里面', () => {
    const container = renderLine('<m>{<red>{Strength +5 is needed here}}')
    const outer = container.querySelector('span')
    expect(outer?.getAttribute('class')).toBe('mk-m mk-red')
    expect(outer?.querySelector('.num')?.textContent).toBe('+5')
  })

  it('未闭合标记按纯文本透传，一个字符都不丢', () => {
    const container = renderLine('<red>{unclosed')
    expect(container.textContent).toBe('<red>{unclosed')
  })

  it('未知标签只透传文字，不加类名', () => {
    const container = renderLine('<wat>{x}')
    expect(container.textContent).toBe('x')
    expect(container.querySelectorAll('span[class]')).toHaveLength(0)
  })

  it('rgb 自定义色写成两套自定义属性，由 CSS 选主题', () => {
    const container = renderLine('<rgb(255, 255, 255)>{x}')
    const span = container.querySelector('span')
    expect(span?.getAttribute('class')).toBe('mk-rgb')
    const style = span?.getAttribute('style') ?? ''
    expect(style).toContain('--mk-rgb-d')
    expect(style).toContain('--mk-rgb-l')
    // 两套值必须不同，否则等于没做主题
    const dark = /--mk-rgb-d:\s*([^;]+)/.exec(style)?.[1]?.trim()
    const light = /--mk-rgb-l:\s*([^;]+)/.exec(style)?.[1]?.trim()
    expect(dark).not.toBe(light)
  })
})
