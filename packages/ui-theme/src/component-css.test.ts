// ui-theme 组件 CSS 的数值门禁（spec §4.5、§4.6、§5、§5.15）
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type CssRule, parseRules } from './testing/css'
import { FORGE_COLORS } from './testing/gate'

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

// 选择器的主体（最后一个复合选择器，去掉括号内容与伪元素）是否就是 pt-frame 元素本身
function isFrameSubject(selector: string): boolean {
  let flat = selector
  while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, '')
  const subject = flat.split(/\s*[\s>+~]\s*/).at(-1) ?? ''
  return /^\.pt-frame(?!__)/.test(subject) && !subject.includes('::')
}

describe('pt-frame 与标题栏（spec §4.5、§5.3）', () => {
  it('角饰伪元素 z-index 3，inset 为负外伸量；桌面 40/12px，≤620 为 28/9px', () => {
    for (const pseudo of ['.pt-frame::before', '.pt-frame::after']) {
      expect(declared('frame.css', pseudo, 'z-index')).toBe('3')
      expect(declared('frame.css', pseudo, 'inset')).toBe('calc(-1 * var(--pt-co))')
    }
    expect(declared('frame.css', '.pt-frame', '--pt-cs')).toBe('40px')
    expect(declared('frame.css', '.pt-frame', '--pt-co')).toBe('12px')
    expect(declared('frame.css', '.pt-frame', '--pt-cs', /max-width:\s*620px/)).toBe('28px')
    expect(declared('frame.css', '.pt-frame', '--pt-co', /max-width:\s*620px/)).toBe('9px')
  })

  it('pt-frame 自身的规则没有 overflow: hidden / clip 与 contain: paint', () => {
    for (const file of files) {
      for (const rule of rulesOf(file)) {
        if (!rule.selectors.some(isFrameSubject)) continue
        expect(rule.declarations.get('overflow') ?? '', `${file} ${rule.selectors}`).not.toMatch(
          /hidden|clip/,
        )
        expect(rule.declarations.get('contain') ?? '', `${file} ${rule.selectors}`).not.toContain(
          'paint',
        )
      }
    }
  })

  it('pt-frame 与带标题栏的 pt-panel 是容器查询挂载点；标题栏按容器宽度取内边距', () => {
    expect(declared('frame.css', '.pt-frame', 'container-type')).toBe('inline-size')
    expect(declared('panel.css', '.pt-panel--titled', 'container-type')).toBe('inline-size')
    expect(declared('frame.css', '.pt-titlebar', 'height')).toBe('46px')
    expect(declared('frame.css', '.pt-titlebar', 'padding')).toBe('0 110px')
    expect(declared('frame.css', '.pt-titlebar', 'padding', /width < 480px/)).toBe('0 20px')
    expect(declared('frame.css', '.pt-titlebar > .pt-chip', 'display', /width < 480px/)).toBe(
      'none',
    )
    expect(declared('frame.css', '.pt-chip.pt-chip--body', 'display', /width < 480px/)).toBe('flex')
    expect(declared('frame.css', '.pt-titlebar__title', 'text-overflow')).toBe('ellipsis')
    expect(declared('frame.css', '.pt-titlebar__title', 'white-space')).toBe('nowrap')
  })
})

describe('pt-forge-btn（spec §5.5）', () => {
  it('文字色与渐变中段三个色标等于门禁用的 FORGE_COLORS', () => {
    expect(declared('forge-btn.css', '.pt-forge-btn', 'color')).toBe(FORGE_COLORS.text)
    const stops = declared('forge-btn.css', '.pt-forge-btn', 'background')?.match(/#[0-9a-f]{6}/g)
    expect(stops?.slice(1, 4)).toEqual([...FORGE_COLORS.midStops])
  })

  it('按下下压 1px，减少动态效果时取消；焦点环 2px --focus 外偏移 3px', () => {
    expect(declared('forge-btn.css', '.pt-forge-btn:active', 'transform')).toBe('translateY(1px)')
    expect(
      declared('forge-btn.css', '.pt-forge-btn:active', 'transform', /prefers-reduced-motion/),
    ).toBe('none')
    expect(declared('forge-btn.css', '.pt-forge-btn:focus-visible', 'outline')).toBe(
      '2px solid var(--focus)',
    )
    expect(declared('forge-btn.css', '.pt-forge-btn:focus-visible', 'outline-offset')).toBe('3px')
  })
})

describe('pt-btn（spec §5.6）', () => {
  it('默认、--quiet、--sm、--xs 的尺寸与配色；≤600 时 --sm、--xs 最小高 44px', () => {
    expect(declared('btn.css', '.pt-btn', 'height')).toBe('46px')
    expect(declared('btn.css', '.pt-btn', 'border')).toBe('1px solid var(--bronze)')
    expect(declared('btn.css', '.pt-btn--quiet', 'border-color')).toBe('var(--control-edge)')
    expect(declared('btn.css', '.pt-btn--sm', 'height')).toBe('38px')
    expect(declared('btn.css', '.pt-btn--xs', 'height')).toBe('28px')
    for (const variant of ['.pt-btn--sm', '.pt-btn--xs']) {
      expect(declared('btn.css', variant, 'min-height', /max-width:\s*600px/)).toBe('44px')
    }
    expect(declared('btn.css', '.pt-wide-only', 'display', /max-width:\s*600px/)).toBe('none')
  })
})

describe('pt-divider、pt-chip、hero 标题（spec §4.4、§5.9、§5.10）', () => {
  it('分隔线 14px 高，hero 宽 440 居中上距 18，示例区左缩进 44', () => {
    expect(declared('divider.css', '.pt-divider', 'height')).toBe('14px')
    expect(declared('divider.css', '.pt-divider--hero', 'width')).toBe('440px')
    expect(declared('divider.css', '.pt-divider--hero', 'max-width')).toBe('100%')
    expect(declared('divider.css', '.pt-divider--hero', 'margin')).toBe('18px auto 0')
    expect(declared('divider.css', '.pt-divider--indent', 'margin')).toBe('8px 0 8px 44px')
  })

  it('chip 在标题栏用金属配色，卡体 chip 默认隐藏并用非标题栏配色（R2）', () => {
    expect(declared('chip.css', '.pt-chip', 'border')).toBe('1px solid var(--line-2)')
    expect(declared('chip.css', '.pt-chip', 'color')).toBe('var(--ink-2)')
    expect(declared('chip.css', '.pt-titlebar > .pt-chip', 'border-color')).toBe('#5d4229')
    expect(declared('chip.css', '.pt-titlebar > .pt-chip', 'color')).toBe('#cdb58c')
    expect(declared('chip.css', '.pt-titlebar > .pt-chip', 'background')).toBe(
      'rgba(0, 0, 0, 0.25)',
    )
    expect(declared('chip.css', '.pt-chip--body', 'display')).toBe('none')
  })

  it('hero 标题三种字号一次写全，≤620 缩小；渐变字在强制色彩下退回 CanvasText', () => {
    expect(declared('hero-title.css', '.pt-hero-title', 'font')).toBe(
      '700 54px / 1.2 var(--pt-serif)',
    )
    expect(declared('hero-title.css', '.pt-hero-title--extension', 'font-size')).toBe('44px')
    expect(declared('hero-title.css', '.pt-hero-title--build', 'font-size')).toBe('36px')
    const narrow = /max-width:\s*620px/
    expect(declared('hero-title.css', '.pt-hero-title', 'font-size', narrow)).toBe('34px')
    expect(declared('hero-title.css', '.pt-hero-title--extension', 'font-size', narrow)).toBe(
      '34px',
    )
    expect(declared('hero-title.css', '.pt-hero-title--build', 'font-size', narrow)).toBe('28px')
    expect(declared('hero-title.css', '.pt-hero-title__gold', 'color', FORCED)).toBe('CanvasText')
  })

  it('index.css 按契约 §3.3 的顺序引入 M1 的全部文件', () => {
    const imports = [
      ...readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8').matchAll(
        /@import "([^"]+)";/g,
      ),
    ].map((m) => m[1])
    expect(imports).toEqual([
      './tokens.css',
      './generated/motif.css',
      './components/text.css',
      './components/motif.css',
      './components/backdrop.css',
      './components/header.css',
      './components/frame.css',
      './components/panel.css',
      './components/forge-btn.css',
      './components/btn.css',
      './components/divider.css',
      './components/chip.css',
      './components/hero-title.css',
    ])
  })
})
