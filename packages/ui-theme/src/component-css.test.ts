// ui-theme 组件 CSS 的数值门禁（spec §4.5、§4.6、§5、§5.15）
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type CssRule, parseRules } from './testing/css'

const dir = fileURLToPath(new URL('./components/', import.meta.url))
const files = readdirSync(dir).filter((name) => name.endsWith('.css'))
const rulesOf = (file: string): CssRule[] => parseRules(readFileSync(`${dir}${file}`, 'utf8'))

const inMedia = (rule: CssRule, pattern: RegExp) => rule.atRules.some((at) => pattern.test(at))
const FORCED = /forced-colors:\s*active/
const REDUCED = /prefers-reduced-motion:\s*reduce/

// 在 file 里找选择器列表含 selector、且位于（或不位于）指定 @media 内的规则的声明值
function declared(
  file: string,
  selector: string,
  property: string,
  media: RegExp | null = null,
): string | undefined {
  const matches = rulesOf(file).filter(
    (rule) =>
      rule.selectors.includes(selector) &&
      (media === null ? rule.atRules.length === 0 : inMedia(rule, media)),
  )
  return matches
    .map((rule) => rule.declarations.get(property))
    .filter((value) => value !== undefined)
    .at(-1)
}

describe('通用门禁（全部组件文件）', () => {
  it('z-index ≥ 3 只出现在 .pt-frame::before / .pt-frame::after（spec §4.5）', () => {
    for (const file of files) {
      for (const rule of rulesOf(file)) {
        const z = Number.parseInt(rule.declarations.get('z-index') ?? '', 10)
        if (!(z >= 3)) continue
        for (const selector of rule.selectors) {
          expect(['.pt-frame::before', '.pt-frame::after'], `${file} ${selector}`).toContain(
            selector,
          )
        }
      }
    }
  })

  it('用到母题或颗粒的伪元素，在同一文件的强制色彩规则里隐藏（spec §4.5、§5.15）', () => {
    const motif = /var\(--(pt-motif-|pt-grain|ptm-base)/
    for (const file of files) {
      const rules = rulesOf(file)
      const hidden = new Set(
        rules
          .filter((rule) => inMedia(rule, FORCED) && rule.declarations.get('display') === 'none')
          .flatMap((rule) => rule.selectors),
      )
      for (const rule of rules) {
        if (rule.atRules.length > 0) continue
        const usesMotif = [...rule.declarations].some(
          ([name, value]) => !name.startsWith('--') && motif.test(value),
        )
        if (!usesMotif) continue
        for (const selector of rule.selectors) {
          const host = selector.replace(/::(before|after)$/, '')
          expect(hidden.has(selector) || hidden.has(host), `${file} ${selector}`).toBe(true)
        }
      }
    }
  })

  it('声明了过渡的规则，在同一文件的减少动态效果规则里取消过渡（spec §4.6）', () => {
    for (const file of files) {
      const rules = rulesOf(file)
      const reset = new Set(
        rules
          .filter(
            (rule) => inMedia(rule, REDUCED) && rule.declarations.get('transition') === 'none',
          )
          .flatMap((rule) => rule.selectors),
      )
      for (const rule of rules) {
        if (rule.atRules.length > 0 || !rule.declarations.has('transition')) continue
        for (const selector of rule.selectors)
          expect(reset.has(selector), `${file} ${selector}`).toBe(true)
      }
    }
  })
})

describe('pt-header（spec §5.2）', () => {
  it('桌面：高 74、内容最大宽 1280、左右 56、间距 40；导航衬线 15px、间距 30', () => {
    expect(declared('header.css', '.pt-header__inner', 'height')).toBe('74px')
    expect(declared('header.css', '.pt-header__inner', 'max-width')).toBe('1280px')
    expect(declared('header.css', '.pt-header__inner', 'padding')).toBe('0 56px')
    expect(declared('header.css', '.pt-header__inner', 'gap')).toBe('40px')
    expect(declared('header.css', '.pt-nav', 'gap')).toBe('30px')
    expect(declared('header.css', '.pt-nav a', 'font')).toBe('700 15px / 1 var(--pt-serif)')
    expect(declared('header.css', '.pt-header__end', 'margin-left')).toBe('auto')
  })

  it('≤850 可换行并隐藏 GitHub；≤620 导航独占一行、字标与导航可点高 ≥44px', () => {
    const at850 = /max-width:\s*850px/
    const at620 = /max-width:\s*620px/
    expect(declared('header.css', '.pt-header__inner', 'flex-wrap', at850)).toBe('wrap')
    expect(declared('header.css', '.pt-header__github', 'display', at850)).toBe('none')
    expect(declared('header.css', '.pt-header__inner', 'padding', at620)).toBe('12px 16px')
    expect(declared('header.css', '.pt-header__inner', 'gap', at620)).toBe('8px 16px')
    expect(declared('header.css', '.pt-nav', 'order', at620)).toBe('2')
    expect(declared('header.css', '.pt-nav', 'width', at620)).toBe('100%')
    expect(declared('header.css', '.pt-nav', 'gap', at620)).toBe('24px')
    expect(declared('header.css', '.pt-brand', 'min-height', at620)).toBe('44px')
    expect(declared('header.css', '.pt-brand', 'font-size', at620)).toBe('18px')
    expect(declared('header.css', '.pt-nav a', 'min-height', at620)).toBe('44px')
  })

  it('页头 z-index 为 2，低于角饰（3）', () => {
    expect(declared('header.css', '.pt-header', 'z-index')).toBe('2')
  })
})

describe('母题 span（spec §4.5）', () => {
  it('四个尺寸与所用符号', () => {
    const size = (variant: string) => [
      declared('motif.css', `.pt-motif--${variant}`, '--ptm-w'),
      declared('motif.css', `.pt-motif--${variant}`, '--ptm-h'),
      declared('motif.css', `.pt-motif--${variant}`, '--ptm-base'),
    ]
    expect(size('logo')).toEqual(['46px', '24px', 'var(--pt-motif-logo)'])
    expect(size('knot')).toEqual(['31px', '12px', 'var(--pt-motif-knot)'])
    expect(size('clasp')).toEqual(['36px', '14px', 'var(--pt-motif-knot)'])
    expect(size('gem')).toEqual(['11px', '11px', 'var(--pt-motif-gem-ring)'])
  })

  it('宝石层用宝石菱形遮罩与 conic 四刻面，边长 9.8 个视框单位', () => {
    expect(declared('motif.css', '.pt-motif::after', '--ptm-gem')).toBe('calc(9.8 * var(--ptm-u))')
    expect(declared('motif.css', '.pt-motif::after', 'mask')).toContain('var(--pt-motif-gem-mask)')
    expect(declared('motif.css', '.pt-motif::after', 'background')).toContain(
      'var(--gem-2) 0 25%, var(--gem-3) 0 50%, var(--gem-4) 0 75%, var(--gem-1) 0',
    )
  })
})

describe('pt-backdrop（spec §5.1）', () => {
  it('底色 --page，颗粒 0.05 overlay，不用 background-attachment: fixed', () => {
    expect(declared('backdrop.css', '.pt-backdrop', 'background')).toContain('var(--page)')
    expect(declared('backdrop.css', '.pt-backdrop::before', 'background')).toBe('var(--pt-grain)')
    expect(declared('backdrop.css', '.pt-backdrop::before', 'opacity')).toBe('0.05')
    expect(declared('backdrop.css', '.pt-backdrop::before', 'mix-blend-mode')).toBe('overlay')
    expect(readFileSync(`${dir}backdrop.css`, 'utf8')).not.toContain('fixed')
  })
})
