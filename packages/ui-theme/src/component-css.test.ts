// ui-theme 组件 CSS 的数值门禁（spec §4.5、§4.6、§5、§5.15）
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type CssRule, parseRules } from './testing/css'
import { FORGE_COLORS, NAMEPLATE_VARIANTS, TAB_COLORS } from './testing/gate'

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

  // svg 的 UA 默认 forced-color-adjust 是 preserve-parent-color：写在 svg 上的 color 原样保留，不随系统色（M2 移交 F2）
  it('给 svg 图标写了 color 的规则，在同一文件的强制色彩规则里改为 inherit（spec §5.15）', () => {
    const icon = /(^|[\s>+~])svg$/
    for (const file of files) {
      const rules = rulesOf(file)
      const reset = new Set(
        rules
          .filter((rule) => inMedia(rule, FORCED) && rule.declarations.get('color') === 'inherit')
          .flatMap((rule) => rule.selectors),
      )
      for (const rule of rules) {
        if (inMedia(rule, FORCED) || !rule.declarations.has('color')) continue
        for (const selector of rule.selectors.filter((item) => icon.test(item)))
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

  it('禁用的 --sm 悬停仍保持 --bar，且排在 --quiet 禁用悬停之后（spec §5.6、§5.12）', () => {
    // 两条同为 (0,3,0)，靠源码顺序决胜；“仅看待核对”是 --quiet --sm，禁用时悬停不能变成 --raised
    expect(declared('btn.css', '.pt-btn--sm:disabled:hover', 'background-color')).toBe('var(--bar)')
    const top = rulesOf('btn.css').filter((rule) => rule.atRules.length === 0)
    const indexOf = (selector: string) => top.findIndex((rule) => rule.selectors.includes(selector))
    expect(indexOf('.pt-btn--sm:disabled:hover')).toBeGreaterThan(
      indexOf('.pt-btn--quiet:disabled:hover'),
    )
  })

  // M2 移交 F4：强制色彩下按下态的 Highlight 内框与焦点环同为 outline，按下态规则写在后、特异性相同，
  // 按下且键盘聚焦时焦点环被盖住
  it('强制色彩：按下且键盘聚焦时照常画焦点环（2px，外偏移 3px），按下态改由 Highlight 边框表示（spec §5.15）', () => {
    const selector = '.pt-btn[aria-pressed="true"]:focus-visible'
    expect(declared('btn.css', selector, 'outline', FORCED)).toBe('var(--focus-ring)')
    expect(declared('btn.css', selector, 'outline-offset', FORCED)).toBe('3px')
    expect(declared('btn.css', selector, 'border-color', FORCED)).toBe('Highlight')
    // 按下但未聚焦时仍是 Highlight 内框
    expect(declared('btn.css', '.pt-btn[aria-pressed="true"]', 'outline-offset', FORCED)).toBe(
      '-2px',
    )
  })

  // 附录 B.10 ①：按下且键盘聚焦时边框加到 2px Highlight，按每个尺寸变体的实际左右内边距各减 1px，
  // border-box 尺寸与未聚焦时相同（站点全局 box-sizing: border-box，上下内边距为 0，高度由 height 固定）。
  // 基础补偿规则是 (0,3,0)，会盖过所有变体 (0,1,0) 的内边距，所以凡声明了左右内边距的变体都要有自己的补偿
  it('强制色彩：按下且聚焦时 2px Highlight 边框，每个声明了左右内边距的尺寸变体各减 1px，外框宽度不变（spec §5.15）', () => {
    const rules = rulesOf('btn.css')
    const pressedFocus = (variant: string) => `${variant}[aria-pressed="true"]:focus-visible`
    const base = pressedFocus('.pt-btn')
    expect(declared('btn.css', base, 'border-width', FORCED)).toBe('2px')
    expect(declared('btn.css', base, 'border-color', FORCED)).toBe('Highlight')
    const px = (value: string | undefined): number => Number.parseFloat(value ?? 'NaN')
    // 左右内边距：padding-inline 优先，否则取 padding 简写的第二个值（只有一个值时取它）
    const inlineOf = (rule: CssRule): number | undefined => {
      const inline = rule.declarations.get('padding-inline')
      if (inline !== undefined) return px(inline.split(' ')[0])
      const parts = rule.declarations.get('padding')?.split(' ')
      return parts === undefined ? undefined : px(parts[1] ?? parts[0])
    }
    const SIZE = /^\.pt-btn(--[\w-]+)?$/
    // 顶层规则里声明了左右内边距的 .pt-btn 与各尺寸变体，按源码顺序
    const variants = rules
      .filter((rule) => rule.atRules.length === 0 && inlineOf(rule) !== undefined)
      .flatMap((rule) =>
        rule.selectors
          .filter((selector) => SIZE.test(selector))
          .map((selector) => [selector, inlineOf(rule) ?? Number.NaN] as const),
      )
    expect(variants.map(([selector]) => selector)).toEqual(
      expect.arrayContaining(['.pt-btn', '.pt-btn--sm', '.pt-btn--xs', '.pt-btn--wide']),
    )
    expect(variants[0]?.[0]).toBe('.pt-btn')
    const edge = px(declared('btn.css', '.pt-btn', 'border')?.split(' ')[0])
    const focusEdge = px(declared('btn.css', base, 'border-width', FORCED))
    const forced = rules.filter((rule) => inMedia(rule, FORCED))
    const indexOf = (selector: string) =>
      forced.findIndex((rule) => rule.selectors.includes(selector))
    let previous = -1
    for (const [variant, idle] of variants) {
      const compensated = px(declared('btn.css', pressedFocus(variant), 'padding-inline', FORCED))
      expect(compensated, variant).toBe(idle - (focusEdge - edge))
      // 外框宽 = 左右内边距 + 左右边宽，按下且聚焦前后相等
      expect(2 * compensated + 2 * focusEdge, variant).toBe(2 * idle + 2 * edge)
      // 同为 (0,3,0)，靠源码顺序决胜：基础补偿在最前，变体补偿的先后与变体声明一致（叠用时胜出的变体与平时相同）
      const at = indexOf(pressedFocus(variant))
      expect(at, variant).toBeGreaterThan(previous)
      previous = at
    }
    // 其余 @media 不改按钮的左右内边距，否则上面的补偿值对不上
    for (const rule of rules) {
      if (rule.atRules.length === 0 || inMedia(rule, FORCED)) continue
      for (const selector of rule.selectors.filter((item) => SIZE.test(item))) {
        expect(inlineOf(rule), `${selector} ${rule.atRules.join(' ')}`).toBeUndefined()
      }
    }
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

  it('index.css 前 13 条 @import 与 M1 顺序一致（M2 在其后追加，不打乱）', () => {
    const imports = [
      ...readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8').matchAll(
        /@import "([^"]+)";/g,
      ),
    ].map((m) => m[1])
    expect(imports.slice(0, 13)).toEqual([
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

// —— M2：组件 CSS 取值断言（spec §5.7、§5.8、§5.11、§5.12、§6.4.4；契约 §3.4、§7.3）——
// 解析口径：选择器去空白比较（逗号内含 :is(...) 时按整条选择器文本比较，不依赖逗号拆分方式）；
// 取值比较去空白、转小写、小数补前导零（契约 §6.1 的口径）。
const m2Read = (name: string): string =>
  readFileSync(new URL(`./components/${name}`, import.meta.url), 'utf8')
const m2Css = (name: string): readonly CssRule[] => parseRules(m2Read(name))
const m2Norm = (value: string): string =>
  value
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/(^|[^\d])\.(\d)/g, (_all: string, lead: string, digit: string) => `${lead}0.${digit}`)
/** 与 selector 一致的规则；media 给出时只取外层 at-rule 含该条件的规则，否则只取顶层规则 */
function m2Rules(rules: readonly CssRule[], selector: string, media?: string): CssRule[] {
  const want = m2Norm(selector)
  return rules.filter((rule) => {
    const hit =
      rule.selectors.some((item) => m2Norm(item) === want) ||
      m2Norm(rule.selectors.join(',')) === want
    if (!hit) return false
    if (media === undefined) return rule.atRules.length === 0
    return rule.atRules.some((at) => m2Norm(at).includes(m2Norm(media)))
  })
}
/** 同一选择器、同一 at-rule 范围内某属性的最终取值（后写覆盖先写），按口径归一 */
function m2Value(
  rules: readonly CssRule[],
  selector: string,
  prop: string,
  media?: string,
): string {
  const values = m2Rules(rules, selector, media).flatMap((rule) => {
    const value = rule.declarations.get(prop)
    return value === undefined ? [] : [value]
  })
  const last = values.at(-1)
  if (last === undefined) {
    throw new Error(`${selector} 缺少 ${prop}${media === undefined ? '' : `（${media}）`}`)
  }
  return m2Norm(last)
}

describe('M2 组件文件接入 index.css（契约 §3.3）', () => {
  it('已建的 M2 组件文件按固定顺序跟在 hero-title.css 之后', () => {
    const order = ['controls.css', 'tabs.css', 'nameplate.css', 'tooltip.css', 'pairs.css']
    const imports = [
      ...readFileSync(new URL('./index.css', import.meta.url), 'utf8').matchAll(
        /@import\s+"\.\/components\/([\w-]+\.css)"/g,
      ),
    ].map((match) => match[1] ?? '')
    const present = order.filter((name) =>
      existsSync(new URL(`./components/${name}`, import.meta.url)),
    )
    const tail = imports
      .slice(imports.indexOf('hero-title.css') + 1)
      .filter((name) => order.includes(name))
    expect(tail).toEqual(present)
  })
})

describe('controls.css（spec §5.12、§6.4.1、§6.7）', () => {
  const rules = m2Css('controls.css')
  it('“选择 .build 文件”的焦点环只命中 label[for="file-input"]，取 §5.5 的值（R7）', () => {
    const selector =
      ':is(.pt-dropzone, .pt-droprail):has(#file-input:focus-visible) label[for="file-input"]'
    expect(m2Value(rules, selector, 'outline')).toBe(m2Norm('2px solid var(--focus)'))
    expect(m2Value(rules, selector, 'outline-offset')).toBe('3px')
    const focusRules = rules.filter((rule) =>
      m2Norm(rule.selectors.join(',')).includes('#file-input:focus-visible'),
    )
    expect(focusRules.length).toBeGreaterThan(0)
    for (const rule of focusRules) {
      expect(m2Norm(rule.selectors.join(','))).toMatch(/label\[for="file-input"\]$/)
    }
  })
  it('拖放区 1px 虚线 --control-edge，拖入时边色 --bronze', () => {
    expect(m2Value(rules, '.pt-dropzone', 'border')).toBe(m2Norm('1px dashed var(--control-edge)'))
    expect(m2Value(rules, '.pt-dropzone--over', 'border-color')).toBe('var(--bronze)')
  })
  it('分段控件选中项：--raised-2 底、600 字重、1px --bronze 内边（两种选中写法同值）', () => {
    for (const selector of [
      '.pt-seg__item[aria-checked="true"]',
      '.pt-seg__item:has(input:checked)',
    ]) {
      expect(m2Value(rules, selector, 'background')).toBe('var(--raised-2)')
      expect(m2Value(rules, selector, 'box-shadow')).toBe(m2Norm('inset 0 0 0 1px var(--bronze)'))
      expect(m2Value(rules, selector, 'font-weight')).toBe('600')
    }
    expect(m2Value(rules, '.pt-seg', 'border')).toBe(m2Norm('1px solid var(--control-edge)'))
    expect(m2Value(rules, '.pt-seg', 'background')).toBe('var(--bar)')
  })
  // 与 M2 移交 F4 同一根因：键盘进入 radiogroup 时焦点必落在选中项，强制色彩块里选中项的 Highlight 内框
  // 也是 outline，且与焦点规则同为 (0,2,1)、写在后，焦点环被盖住；选中项仍由 600 字重区分
  it('强制色彩：分段控件选中项聚焦时照常画焦点环，焦点规则排在选中项内框之后（spec §5.15）', () => {
    const forced = 'forced-colors: active'
    for (const selector of [
      '.pt-seg__item:has(input:focus-visible)',
      '.pt-seg__item[aria-checked="true"]:focus-visible',
    ]) {
      expect(m2Value(rules, selector, 'outline', forced)).toBe('var(--focus-ring)')
      expect(m2Value(rules, selector, 'outline-offset', forced)).toBe('3px')
    }
    const inForced = rules.filter((rule) => rule.atRules.some((at) => FORCED.test(at)))
    const at = (selector: string) => inForced.findIndex((rule) => rule.selectors.includes(selector))
    expect(at('.pt-seg__item:has(input:checked)')).toBeGreaterThanOrEqual(0)
    expect(at('.pt-seg__item:has(input:focus-visible)')).toBeGreaterThan(
      at('.pt-seg__item:has(input:checked)'),
    )
  })
  it('弹层与 Toast：底 --raised、1px --metal-line（#7a5530）', () => {
    for (const selector of ['.pt-popover', '.pt-toast']) {
      expect(m2Value(rules, selector, 'background')).toBe('var(--raised)')
      expect(m2Value(rules, selector, 'border')).toBe(m2Norm('1px solid var(--metal-line)'))
    }
    expect(m2Value(rules, '.pt-popover h2', 'font')).toContain('var(--font-zh-cn)')
  })
  it('词典状态条：最小高 34px、底 --bg-2、下边 1px --line；三态圆点 --ok / --ink-3 / --danger', () => {
    expect(m2Value(rules, '.pt-dictbar', 'min-height')).toBe('34px')
    expect(m2Value(rules, '.pt-dictbar', 'background')).toBe('var(--bg-2)')
    expect(m2Value(rules, '.pt-dictbar', 'border-bottom')).toBe(m2Norm('1px solid var(--line)'))
    expect(m2Value(rules, '.pt-dictbar__dot', 'background')).toBe('var(--ok)')
    expect(m2Value(rules, '.pt-dictbar__dot--loading', 'background')).toBe('var(--ink-3)')
    expect(m2Value(rules, '.pt-dictbar__dot--failed', 'background')).toBe('var(--danger)')
  })
  // M2 移交 F1：强制色彩会把非系统色的底色换成 Canvas，三态只靠底色区分时圆点整颗消失
  it('强制色彩：词典状态圆点改用系统色，就绪实心、加载空心、失败 Highlight，三态可辨', () => {
    const forced = 'forced-colors: active'
    expect(m2Value(rules, '.pt-dictbar__dot', 'border', forced)).toBe(
      m2Norm('1px solid CanvasText'),
    )
    expect(m2Value(rules, '.pt-dictbar__dot', 'background', forced)).toBe('canvastext')
    expect(m2Value(rules, '.pt-dictbar__dot--loading', 'background', forced)).toBe('canvas')
    expect(m2Value(rules, '.pt-dictbar__dot--failed', 'border-color', forced)).toBe('highlight')
    expect(m2Value(rules, '.pt-dictbar__dot--failed', 'background', forced)).toBe('highlight')
    // 修饰类与基础类同为 (0,1,0)，靠源码顺序决胜：两条修饰类规则排在基础类之后
    const inForced = rules.filter((rule) => rule.atRules.some((at) => FORCED.test(at)))
    const at = (selector: string) => inForced.findIndex((rule) => rule.selectors.includes(selector))
    expect(at('.pt-dictbar__dot')).toBeGreaterThanOrEqual(0)
    expect(at('.pt-dictbar__dot--loading')).toBeGreaterThan(at('.pt-dictbar__dot'))
    expect(at('.pt-dictbar__dot--failed')).toBeGreaterThan(at('.pt-dictbar__dot'))
  })
  it('侧栏折叠条：底 --bar、下边 1px --control-edge、最小高 44px（spec §6.7）', () => {
    expect(m2Value(rules, '.pt-sidetoggle', 'background')).toBe('var(--bar)')
    expect(m2Value(rules, '.pt-sidetoggle', 'border-bottom')).toBe(
      m2Norm('1px solid var(--control-edge)'),
    )
    expect(m2Value(rules, '.pt-sidetoggle', 'min-height')).toBe('44px')
  })
  it('文件项：当前项由 aria-current 选取，边 --bronze 加左侧 3px 色条（R6）', () => {
    const current = '.pt-file:has(> [aria-current="true"])'
    expect(m2Value(rules, current, 'border-color')).toBe('var(--bronze)')
    expect(m2Value(rules, current, 'box-shadow')).toBe(m2Norm('inset 3px 0 0 var(--bronze)'))
    expect(m2Value(rules, '.pt-file', 'border')).toBe(m2Norm('1px solid var(--control-edge)'))
  })
  it('kbd 键帽 11px --ink-3，边 --line-2，底 --bg-2', () => {
    expect(m2Value(rules, '.pt-kbd', 'font')).toContain('11px')
    expect(m2Value(rules, '.pt-kbd', 'color')).toBe('var(--ink-3)')
    expect(m2Value(rules, '.pt-kbd', 'border')).toBe(m2Norm('1px solid var(--line-2)'))
    expect(m2Value(rules, '.pt-kbd', 'background')).toBe('var(--bg-2)')
  })
  it('≤600px 可点目标 ≥44px（分段、触发器、文字按钮、移除按钮）', () => {
    const narrow = 'max-width: 600px'
    expect(m2Value(rules, '.pt-seg__item', 'min-height', narrow)).toBe('44px')
    expect(m2Value(rules, '.pt-trigger', 'min-height', narrow)).toBe('44px')
    expect(m2Value(rules, '.pt-textbtn', 'min-height', narrow)).toBe('44px')
    expect(m2Value(rules, '.pt-file__remove', 'width', narrow)).toBe('44px')
    expect(m2Value(rules, '.pt-file__remove', 'height', narrow)).toBe('44px')
  })
})

describe('tabs.css（spec §5.7、§6.4.2；M0 Ruling 11-1）', () => {
  const rules = m2Css('tabs.css')
  it('页签渐变色标与计数色等于 TAB_COLORS（§4.3 门禁的组件色值）', () => {
    const idle = m2Value(rules, '.pt-tab', 'background')
    for (const stop of TAB_COLORS.idleStops) expect(idle).toContain(stop)
    const selected = '.pt-tab[aria-selected="true"]'
    const on = m2Value(rules, selected, 'background')
    for (const stop of TAB_COLORS.selectedStops) expect(on).toContain(stop)
    expect(m2Value(rules, selected, 'color')).toBe(TAB_COLORS.selectedText)
    expect(m2Value(rules, '.pt-tab__count', 'color')).toBe('var(--ink-2)')
    expect(m2Value(rules, '.pt-tab[aria-selected="true"] .pt-tab__count', 'color')).toBe('inherit')
  })
  it('页签字形：衬线 700 15px、字距 .06em；计数无衬线 500 13px、字距 0', () => {
    expect(m2Value(rules, '.pt-tab', 'font')).toBe(m2Norm('700 15px/1.6 var(--pt-serif)'))
    expect(m2Value(rules, '.pt-tab', 'letter-spacing')).toBe('0.06em')
    expect(m2Value(rules, '.pt-tab__count', 'font')).toBe(m2Norm('500 13px/1 var(--font-zh-cn)'))
    expect(m2Value(rules, '.pt-tab__count', 'letter-spacing')).toBe('0')
  })
  it('基线画在整行外下方；未选中页签留 2px 缝，选中页签接通基线', () => {
    expect(m2Value(rules, '.pt-tabs-row::after', 'bottom')).toBe('-2px')
    expect(m2Value(rules, '.pt-tabs-row::after', 'height')).toBe('2px')
    expect(m2Value(rules, '.pt-tabs-row', 'margin-bottom')).toBe('2px')
    expect(m2Value(rules, '.pt-tab', 'margin')).toBe(m2Norm('0 0 2px'))
    expect(m2Value(rules, '.pt-tab[aria-selected="true"]', 'margin-bottom')).toBe('0')
  })
  it('吸顶页签行：top -1px、z-index 2（低于角饰 3）、底与遮挡阴影为 --frame-bg', () => {
    expect(m2Value(rules, '.pt-tabs-row--sticky', 'position')).toBe('sticky')
    expect(m2Value(rules, '.pt-tabs-row--sticky', 'top')).toBe('-1px')
    expect(m2Value(rules, '.pt-tabs-row--sticky', 'z-index')).toBe('2')
    expect(m2Value(rules, '.pt-tabs-row--sticky', 'background')).toBe('var(--frame-bg)')
    expect(m2Value(rules, '.pt-tabs-row--sticky', 'box-shadow')).toContain('var(--frame-bg)')
  })
  it('页签文字不折行、tablist 不被工具组挤压（M2 Ruling 10）', () => {
    expect(m2Value(rules, '.pt-tab', 'white-space')).toBe('nowrap')
    expect(m2Value(rules, '.pt-tabs', 'flex-shrink')).toBe('0')
  })
  // 沿革：Ruling 11-1 定 601–700px → M2 Ruling 10 按实测改为 601–820px → M2 终审取消上限。
  // 820 的余量太小（本机真实构筑需 811px），且构建后与 ≤600 之间留下 (600,601) 的小数视口空档
  it('工具组放不下时换行、靠右：>600px 为基础规则，不设宽度上限（M2 终审）', () => {
    expect(m2Value(rules, '.pt-tabs-row__tools', 'flex-wrap')).toBe('wrap')
    expect(m2Value(rules, '.pt-tabs-row__tools', 'justify-content')).toBe('flex-end')
    expect(m2Value(rules, '.pt-tabs-row__tools', 'min-width')).toBe('0')
    const code = m2Read('tabs.css').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toContain('max-width: 820px')
    expect(code).not.toMatch(/min-width:\s*601px/)
  })
  it('≤600px：页签独占一行，基线改画在 tablist 下方；页签最小高 44px', () => {
    const narrow = 'max-width: 600px'
    expect(m2Value(rules, '.pt-tabs-row', 'display', narrow)).toBe('block')
    expect(m2Value(rules, '.pt-tabs-row::after', 'display', narrow)).toBe('none')
    expect(m2Value(rules, '.pt-tabs::after', 'bottom', narrow)).toBe('-2px')
    expect(m2Value(rules, '.pt-tabs-row__tools', 'margin-top', narrow)).toBe('12px')
    // 基础规则的靠右在这一档覆盖回靠左，窄屏排布不变（视图分段仍由 responsive.css 的 margin-left:auto 推到右侧）
    expect(m2Value(rules, '.pt-tabs-row__tools', 'justify-content', narrow)).toBe('flex-start')
    expect(m2Value(rules, '.pt-tab', 'min-height', narrow)).toBe('44px')
  })
  // 附录 B.10：显示键帽时 601–663px 工具组排成三行（高约 144px），隐藏键帽后为两行；阈值由 ≤600px 改为 ≤680px
  // （初定 660px，复验发现最宽样本在 661–663px 仍为三行，用户 2026-10-02 决定提到 680px）
  it('≤680px：页签行工具组隐藏键帽，单独成块且只针对工具组里的键帽；≤600 块不再重复（§6.7、§5.12）', () => {
    const kbd = '.pt-tabs-row__tools .pt-kbd'
    expect(m2Value(rules, kbd, 'display', 'max-width: 680px')).toBe('none')
    const block = rules.filter((rule) =>
      rule.atRules.some((at) => m2Norm(at).includes('max-width:680px')),
    )
    expect(block.map((rule) => rule.selectors)).toEqual([[kbd]])
    // 初定的 660px 块已整体换成 680px，不留旧阈值
    expect(
      rules.some((rule) => rule.atRules.some((at) => m2Norm(at).includes('max-width:660px'))),
    ).toBe(false)
    expect(m2Rules(rules, kbd, 'max-width: 600px')).toHaveLength(0)
    expect(m2Rules(rules, kbd)).toHaveLength(0)
  })
  it('强制色彩：选中页签 2px Highlight 边框（含底边），未选中 1px CanvasText', () => {
    const forced = 'forced-colors: active'
    expect(m2Value(rules, '.pt-tab[aria-selected="true"]', 'border', forced)).toBe(
      m2Norm('2px solid Highlight'),
    )
    expect(m2Value(rules, '.pt-tab', 'border', forced)).toBe(m2Norm('1px solid CanvasText'))
  })
  // M2 移交 F3：强制色彩下两态边宽不同（选中 2px、未选中 1px，都含底边），不补偿时选中页签宽、高各多 2px，
  // 切换页签时相邻页签横移、纵移。按层叠逐条套用 tabs.css：先 (0,1,0) 的 .pt-tab，再 (0,2,0) 的选中态，
  // 同特异性按源码顺序；算出外框（含 margin-bottom）与文字起点，桌面与 ≤600px、常规与强制色彩四种组合下两态都应一致
  it('两态外框与文字起点一致：强制色彩下多出的边宽由选中页签的内边距抵消，切换页签不位移', () => {
    const len = (value: string): number =>
      /^-?[\d.]+px$/.test(value) ? Number.parseFloat(value) : 0
    const four = (value: string): [number, number, number, number] => {
      const [t = '0', r = t, b = t, l = r] = value.split(' ')
      return [len(t), len(r), len(b), len(l)]
    }
    const width = (value: string): number =>
      len(value.split(' ').find((part) => /^-?[\d.]+px$/.test(part)) ?? '0')
    const geometry = (selected: boolean, narrow: boolean, forced: boolean) => {
      // 内边距、边宽按 上、右、下、左
      const pad = [0, 0, 0, 0]
      const edge = [0, 0, 0, 0]
      let marginBottom = 0
      const applies = (rule: CssRule): boolean =>
        rule.atRules.every((at) => {
          const media = m2Norm(at)
          if (media.includes('prefers-reduced-motion')) return false
          if (media.includes('max-width:600px') && !narrow) return false
          return !(media.includes('forced-colors:active') && !forced)
        })
      const layers = selected ? ['.pt-tab', '.pt-tab[aria-selected="true"]'] : ['.pt-tab']
      for (const selector of layers) {
        for (const rule of rules) {
          if (!rule.selectors.includes(selector) || !applies(rule)) continue
          for (const [name, value] of rule.declarations) {
            if (name === 'padding') pad.splice(0, 4, ...four(value))
            else if (name === 'padding-top') pad[0] = len(value)
            else if (name === 'padding-right') pad[1] = len(value)
            else if (name === 'padding-bottom') pad[2] = len(value)
            else if (name === 'padding-left') pad[3] = len(value)
            else if (name === 'padding-inline') {
              const [left = '0', right = left] = value.split(' ')
              pad[3] = len(left)
              pad[1] = len(right)
            } else if (name === 'border') edge.fill(width(value))
            else if (name === 'border-bottom') edge[2] = width(value)
            else if (name === 'margin') marginBottom = four(value)[2]
            else if (name === 'margin-bottom') marginBottom = len(value)
          }
        }
      }
      const [pt = 0, pr = 0, pb = 0, pl = 0] = pad
      const [bt = 0, br = 0, bb = 0, bl = 0] = edge
      return {
        outerWidth: pl + pr + bl + br,
        outerHeight: pt + pb + bt + bb + marginBottom,
        textTop: pt + bt,
        textLeft: pl + bl,
      }
    }
    for (const narrow of [false, true]) {
      for (const forced of [false, true]) {
        expect(geometry(true, narrow, forced), `narrow=${narrow} forced=${forced}`).toEqual(
          geometry(false, narrow, forced),
        )
      }
    }
  })
})

describe('nameplate.css（spec §5.8、§6.4.3、§6.7；B1、B7、B8、B15）', () => {
  const rules = m2Css('nameplate.css')
  it('四个变体的三段底、边、名称与次要文字色等于 NAMEPLATE_VARIANTS', () => {
    for (const [variant, colors] of Object.entries(NAMEPLATE_VARIANTS)) {
      const selector = `.pt-nameplate--${variant}`
      expect(m2Value(rules, selector, '--np-p1')).toBe(colors.p[0])
      expect(m2Value(rules, selector, '--np-p2')).toBe(colors.p[1])
      expect(m2Value(rules, selector, '--np-p3')).toBe(colors.p[2])
      expect(m2Value(rules, selector, '--np-edge')).toBe(colors.edge)
      expect(m2Value(rules, selector, '--np-name')).toBe(colors.name)
      expect(m2Value(rules, selector, '--np-name-2')).toBe(colors.name2)
    }
  })
  it('名称牌上不使用 --ink-3', () => {
    const code = m2Read('nameplate.css').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/--ink-3(?![\w-])/)
  })
  it('名称与第二行里的标记色一律继承（§6.4.3；§4.3 标记色只用于对照行与提示框正文）', () => {
    expect(m2Value(rules, '.pt-nameplate__name [class*="mk-"]', 'color')).toBe('inherit')
    expect(m2Value(rules, '.pt-nameplate__meta [class*="mk-"]', 'color')).toBe('inherit')
    expect(m2Value(rules, '.pt-nameplate__name .pt-num', 'color')).toBe('inherit')
  })
  it('unique 的扣上宝石是传奇橙；名称衬线 20px .03em，提示框 21px .04em；繁体切 TC 栈', () => {
    const unique = '.pt-nameplate--unique'
    expect(m2Value(rules, unique, '--gem-1')).toBe('#ffd8b5')
    expect(m2Value(rules, unique, '--gem-2')).toBe('#f07a2c')
    expect(m2Value(rules, unique, '--gem-3')).toBe('#6e2405')
    expect(m2Value(rules, unique, '--gem-4')).toBe('#b44f19')
    expect(m2Value(rules, '.pt-nameplate__name', 'font')).toBe(
      m2Norm('700 20px/1.25 var(--pt-serif)'),
    )
    expect(m2Value(rules, '.pt-nameplate__name', 'letter-spacing')).toBe('0.03em')
    expect(m2Value(rules, '.pt-nameplate--tooltip .pt-nameplate__name', 'font-size')).toBe('21px')
    expect(m2Value(rules, '.pt-nameplate--tooltip .pt-nameplate__name', 'letter-spacing')).toBe(
      '0.04em',
    )
    expect(m2Value(rules, '.pt-nameplate__name:lang(zh-TW)', 'font-family')).toBe(
      'var(--pt-serif-tc)',
    )
    expect(m2Value(rules, '.pt-nameplate__en', 'font')).toBe(
      m2Norm('400 13px/1.2 var(--pt-cinzel)'),
    )
  })
  it('牌本体：最小高 62px、内边距 9px 40px 8px、顶边扣 top -7px；shut 去掉底边', () => {
    expect(m2Value(rules, '.pt-nameplate', 'min-height')).toBe('62px')
    expect(m2Value(rules, '.pt-nameplate', 'padding')).toBe(m2Norm('9px 40px 8px'))
    expect(m2Value(rules, '.pt-nameplate', 'border-bottom')).toBe(
      m2Norm('1px solid var(--np-edge)'),
    )
    expect(m2Value(rules, '.pt-nameplate__clasp', 'top')).toBe('-7px')
    expect(m2Value(rules, '.pt-nameplate--shut', 'border-bottom')).toBe('0')
  })
  it('展开控件（B15）：--gold、1px 下划线偏移 3px、13px；悬停 --ink、下划线 2px', () => {
    expect(m2Value(rules, '.pt-nameplate__toggle', 'color')).toBe('var(--gold)')
    expect(m2Value(rules, '.pt-nameplate__toggle', 'text-decoration')).toBe(m2Norm('underline 1px'))
    expect(m2Value(rules, '.pt-nameplate__toggle', 'text-underline-offset')).toBe('3px')
    expect(m2Value(rules, '.pt-nameplate__toggle', 'font-size')).toBe('13px')
    expect(m2Value(rules, '.pt-nameplate__toggle:hover', 'color')).toBe('var(--ink)')
    expect(m2Value(rules, '.pt-nameplate__toggle:hover', 'text-decoration-thickness')).toBe('2px')
  })
  it('B1 计数 --ink-2；未收录标记 --miss 虚线；“传奇 / 双语”标签 12px、圆角 3px', () => {
    expect(m2Value(rules, '.pt-nameplate__count', 'color')).toBe('var(--ink-2)')
    expect(m2Value(rules, '.pt-nameplate__miss', 'border')).toBe(m2Norm('1px dashed var(--miss)'))
    expect(m2Value(rules, '.pt-nameplate__miss', 'color')).toBe('var(--miss)')
    expect(m2Value(rules, '.pt-nameplate__tag', 'font-size')).toBe('12px')
    expect(m2Value(rules, '.pt-nameplate__tag', 'border-radius')).toBe('3px')
  })
  it('≤600px：左右内边距 12px；第二行可在组间换行，各项自身不换行', () => {
    const narrow = 'max-width: 600px'
    expect(m2Value(rules, '.pt-nameplate', 'padding-left', narrow)).toBe('12px')
    expect(m2Value(rules, '.pt-nameplate', 'padding-right', narrow)).toBe('12px')
    expect(m2Value(rules, '.pt-nameplate__meta', 'flex-wrap', narrow)).toBe('wrap')
    expect(m2Value(rules, '.pt-nameplate__group', 'white-space', narrow)).toBe('nowrap')
    expect(m2Value(rules, '.pt-nameplate__toggle', 'min-height', narrow)).toBe('44px')
  })
  it('≤600px：单组超出内容宽度时组内换行，“·”跟在上一项行尾、不出现在行首（spec 附录 B.7，M2 Ruling 12）', () => {
    const narrow = 'max-width: 600px'
    expect(m2Value(rules, '.pt-nameplate__group', 'flex-wrap', narrow)).toBe('wrap')
    expect(m2Value(rules, '.pt-nameplate__group', 'justify-content', narrow)).toBe('center')
    expect(m2Value(rules, '.pt-nameplate__group', 'row-gap', narrow)).toBe('2px')
    // 组内的 <i> 点在这一档改画成前一项的 ::after，随前一项换行
    expect(m2Value(rules, '.pt-nameplate__group > .pt-nameplate__dot', 'display', narrow)).toBe(
      'none',
    )
    const lead = '.pt-nameplate__group > :has(+ .pt-nameplate__dot)'
    expect(m2Value(rules, lead, 'position', narrow)).toBe('relative')
    expect(m2Value(rules, lead, 'margin-right', narrow)).toBe('10.5px')
    // 点不进读屏：支持替代文本写法时 content 为 "·" / ""，否则退回 "·"
    expect(
      m2Rules(rules, `${lead}::after`, narrow).flatMap((rule) => {
        const value = rule.declarations.get('content')
        return value === undefined ? [] : [m2Norm(value)]
      }),
    ).toEqual([m2Norm('"·"'), m2Norm('"·" / ""')])
    expect(m2Value(rules, `${lead}::after`, 'position', narrow)).toBe('absolute')
    expect(m2Value(rules, `${lead}::after`, 'left', narrow)).toBe('100%')
    expect(m2Value(rules, `${lead}::after`, 'width', narrow)).toBe('17.5px')
    expect(m2Value(rules, `${lead}::after`, 'color', narrow)).toBe('var(--ink-2)')
  })
  it('强制色彩下隐藏颗粒', () => {
    expect(m2Value(rules, '.pt-nameplate::after', 'display', 'forced-colors: active')).toBe('none')
  })
})

describe('tooltip.css（spec §6.4.4）', () => {
  const rules = m2Css('tooltip.css')
  it('主区内容宽 ≥880px 时两列，否则单列；列距 30px', () => {
    expect(m2Value(rules, '.pt-tooltips', 'grid-template-columns')).toBe(m2Norm('minmax(0, 1fr)'))
    expect(m2Value(rules, '.pt-tooltips', 'gap')).toBe('30px')
    expect(m2Value(rules, '.pt-tooltips', 'grid-template-columns', 'width >= 880px')).toBe(
      m2Norm('1fr 1fr'),
    )
    expect(m2Value(rules, '.pt-tooltip-wrap', 'container-type')).toBe('inline-size')
  })
  it('顶部说明 12.5px --ink-3 右对齐，后半句不拆开', () => {
    expect(m2Value(rules, '.pt-tooltip-note', 'font-size')).toBe('12.5px')
    expect(m2Value(rules, '.pt-tooltip-note', 'color')).toBe('var(--ink-3)')
    expect(m2Value(rules, '.pt-tooltip-note', 'text-align')).toBe('right')
    expect(m2Value(rules, '.pt-tooltip-note__tail', 'display')).toBe('inline-block')
  })
  it('正文居中；属性行 14px --prop，数值 --val 500；分隔线取卡片边色、左右外距 20px', () => {
    expect(m2Value(rules, '.pt-tooltip__body', 'padding')).toBe(m2Norm('12px 24px 16px'))
    expect(m2Value(rules, '.pt-tooltip__body', 'text-align')).toBe('center')
    expect(m2Value(rules, '.pt-tooltip__prop', 'font-size')).toBe('14px')
    expect(m2Value(rules, '.pt-tooltip__prop', 'color')).toBe('var(--prop)')
    expect(m2Value(rules, '.pt-tooltip__prop .pt-num', 'color')).toBe('var(--val)')
    expect(m2Value(rules, '.pt-tooltip__prop .pt-num', 'font-weight')).toBe('500')
    expect(m2Value(rules, '.pt-tooltip__body > .pt-divider', '--sep-c')).toBe('var(--edge)')
    expect(m2Value(rules, '.pt-tooltip__body > .pt-divider', 'margin')).toBe(m2Norm('8px 20px'))
  })
  // 附录 B.7 的思路用于属性行：每项连同其后的“·”是一个原子行内块，换行只在组与组之间，“·”留在上一行行尾；
  // 单组宽过属性行时（max-width: 100%）组内才换行，否则组宽取内容宽、不拆开
  it('属性行按项分组：分组为行内块、最大宽 100%，组内不另设 nowrap', () => {
    expect(m2Value(rules, '.pt-tooltip__seg', 'display')).toBe('inline-block')
    expect(m2Value(rules, '.pt-tooltip__seg', 'max-width')).toBe('100%')
    expect(
      m2Rules(rules, '.pt-tooltip__seg').some((rule) => rule.declarations.has('white-space')),
    ).toBe(false)
  })
  it('中文词缀 15.5px/1.5 --mod-hi，数值 --mod-num-zh 700', () => {
    expect(m2Value(rules, '.pt-tooltip__mod', 'color')).toBe('var(--mod-hi)')
    expect(m2Value(rules, '.pt-tooltip__mod', 'font-size')).toBe('15.5px')
    expect(m2Value(rules, '.pt-tooltip__mod', 'line-height')).toBe('1.5')
    expect(m2Value(rules, '.pt-tooltip__mod .pt-num', 'color')).toBe('var(--mod-num-zh)')
    expect(m2Value(rules, '.pt-tooltip__mod .pt-num', 'font-weight')).toBe('700')
  })
  it('未命中行：原文 --ink-2 加橙色虚线下划线，偏移 4px', () => {
    expect(m2Value(rules, '.pt-tooltip__mod--kept', 'color')).toBe('var(--ink-2)')
    expect(m2Value(rules, '.pt-tooltip__mod--kept', 'text-decoration')).toBe(
      m2Norm('underline dashed rgba(242, 167, 102, 0.7)'),
    )
    expect(m2Value(rules, '.pt-tooltip__mod--kept', 'text-underline-offset')).toBe('4px')
  })
})

describe('pairs.css（spec §5.11）', () => {
  const rules = m2Css('pairs.css')
  it('网格 20px + 两栏，列距 24px，行内边距 8px 22px 8px 6px，15px/1.6', () => {
    expect(m2Value(rules, '.pt-pair', 'grid-template-columns')).toBe(
      m2Norm('20px minmax(0, 1fr) minmax(0, 1fr)'),
    )
    expect(m2Value(rules, '.pt-pair', 'column-gap')).toBe('24px')
    expect(m2Value(rules, '.pt-pair', 'padding')).toBe(m2Norm('8px 22px 8px 6px'))
    expect(m2Value(rules, '.pt-pair', 'font-size')).toBe('15px')
    expect(m2Value(rules, '.pt-pair', 'line-height')).toBe('1.6')
    expect(m2Value(rules, '.pt-pair + .pt-pair', 'border-top')).toBe(
      m2Norm('1px solid rgba(255, 255, 255, 0.045)'),
    )
  })
  it('编号 12px --ink-3；英文 --mod（数值 --mod-hi）；中文 --ink（数值 --val 600）', () => {
    expect(m2Value(rules, '.pt-pair__no', 'font-size')).toBe('12px')
    expect(m2Value(rules, '.pt-pair__no', 'color')).toBe('var(--ink-3)')
    expect(m2Value(rules, '.pt-pair__en', 'color')).toBe('var(--mod)')
    expect(m2Value(rules, '.pt-pair__en .pt-num', 'color')).toBe('var(--mod-hi)')
    expect(m2Value(rules, '.pt-pair__zh', 'color')).toBe('var(--ink)')
    expect(m2Value(rules, '.pt-pair__zh .pt-num', 'color')).toBe('var(--val)')
    expect(m2Value(rules, '.pt-pair__zh .pt-num', 'font-weight')).toBe('600')
  })
  it('未命中行四重标记：底 --miss-bg、3px 内色条、18×18“!”方框、英文虚线下划线', () => {
    expect(m2Value(rules, '.pt-pair--miss', 'background')).toBe('var(--miss-bg)')
    expect(m2Value(rules, '.pt-pair--miss', 'box-shadow')).toBe(m2Norm('inset 3px 0 0 var(--miss)'))
    expect(m2Value(rules, '.pt-pair--miss .pt-pair__no', 'width')).toBe('18px')
    expect(m2Value(rules, '.pt-pair--miss .pt-pair__no', 'height')).toBe('18px')
    expect(m2Value(rules, '.pt-pair--miss .pt-pair__no', 'border')).toBe(
      m2Norm('1px solid var(--miss)'),
    )
    expect(m2Value(rules, '.pt-pair--miss .pt-pair__no', 'border-radius')).toBe('3px')
    expect(m2Value(rules, '.pt-pair--miss .pt-pair__en', 'text-decoration')).toBe(
      m2Norm('underline dashed rgba(242, 167, 102, 0.7)'),
    )
    expect(m2Value(rules, '.pt-pair--miss .pt-pair__en', 'text-underline-offset')).toBe('4px')
    expect(m2Value(rules, '.pt-tag-miss', 'border')).toBe(m2Norm('1px dashed var(--miss)'))
    expect(m2Value(rules, '.pt-tag-miss', 'border-radius')).toBe('4px')
    expect(m2Value(rules, '.pt-tag-miss', 'font')).toContain('12.5px')
  })
  it('solo 不留编号列、左缘 20px；译文视图只剩编号与中文两列', () => {
    expect(m2Value(rules, '.pt-pair--solo', 'grid-template-columns')).toBe(m2Norm('minmax(0, 1fr)'))
    expect(m2Value(rules, '.pt-pair--solo', 'padding-left')).toBe('20px')
    expect(m2Value(rules, '.pt-pairs--translated .pt-pair', 'grid-template-columns')).toBe(
      m2Norm('20px minmax(0, 1fr)'),
    )
  })
  it('≤600px 沿用改版前的收窄规则：18px 编号列、列距 12px、solo 左缘 12px', () => {
    const narrow = 'max-width: 600px'
    expect(m2Value(rules, '.pt-pair', 'grid-template-columns', narrow)).toBe(
      m2Norm('18px minmax(0, 1fr) minmax(0, 1fr)'),
    )
    expect(m2Value(rules, '.pt-pair', 'column-gap', narrow)).toBe('12px')
    expect(m2Value(rules, '.pt-pair--solo', 'padding-left', narrow)).toBe('12px')
  })
  it('强制色彩下未命中行改用左边框保留线索', () => {
    expect(m2Value(rules, '.pt-pair--miss', 'border-left', 'forced-colors: active')).toBe(
      m2Norm('3px solid CanvasText'),
    )
  })
})

// ---- M3：扩展介绍页能力小标题（spec §6.3、§4.4；契约 §3.4 的 subhead.css 行）----
describe('subhead.css', () => {
  const subheadCss = readFileSync(new URL('./components/subhead.css', import.meta.url), 'utf8')
  // 去掉多余空白，并把 Biome 格式化出的“21px / 1.35”还原成“21px/1.35”再比较
  const tidy = (value: string | undefined) =>
    (value ?? '')
      .replace(/\s+/g, ' ')
      .replace(/ ?\/ ?/g, '/')
      .trim()
  const subheadRules = parseRules(subheadCss).filter((rule) =>
    rule.selectors.map(tidy).includes('.pt-subhead'),
  )

  it('.pt-subhead 为衬线 700 21px、--title-gold、字距 .06em、外边距 0', () => {
    const top = subheadRules.filter((rule) => rule.atRules.length === 0)
    expect(top).toHaveLength(1)
    const decl = top[0]?.declarations
    expect(tidy(decl?.get('font'))).toBe('700 21px/1.35 var(--pt-serif)')
    expect(tidy(decl?.get('color'))).toBe('var(--title-gold)')
    expect(tidy(decl?.get('letter-spacing'))).toBe('0.06em')
    expect(tidy(decl?.get('margin'))).toBe('0')
  })

  it('强制色彩下退回 CanvasText；不引用母题、颗粒或任何 url()', () => {
    const forced = subheadRules.filter((rule) =>
      rule.atRules.some((at) => at.replace(/\s+/g, '').includes('forced-colors:active')),
    )
    expect(tidy(forced[0]?.declarations.get('color'))).toBe('CanvasText')
    expect(subheadCss.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/--pt-motif|--pt-grain|url\(/)
  })

  it('index.css 的最后一行引入 subhead.css（契约 §3.3 的 M3 行）', () => {
    const lines = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
      .trim()
      .split('\n')
    expect(lines.at(-1)).toMatch(/^@import "\.\/components\/subhead\.css";/)
  })
})

describe('pt-switch（spec §5.13）', () => {
  it('40×22、圆角 11；旋钮 16、开启右移 18px；开启边 #e0b574', () => {
    expect(declared('switch.css', '.pt-switch', 'width')).toBe('40px')
    expect(declared('switch.css', '.pt-switch', 'height')).toBe('22px')
    expect(declared('switch.css', '.pt-switch', 'border-radius')).toBe('11px')
    expect(declared('switch.css', '.pt-switch::before', 'width')).toBe('16px')
    expect(declared('switch.css', '.pt-switch:checked::before', 'transform')).toBe(
      'translateX(18px)',
    )
    expect(declared('switch.css', '.pt-switch:checked', 'border-color')).toBe('#e0b574')
    expect(declared('switch.css', '.pt-switch__state', 'font-size')).toBe('12px')
  })
  it('强制色彩：轨道 1px ButtonText 边，旋钮 ButtonText', () => {
    const FORCED = /forced-colors:\s*active/
    expect(declared('switch.css', '.pt-switch', 'border', FORCED)).toBe('1px solid ButtonText')
    expect(declared('switch.css', '.pt-switch::before', 'background', FORCED)).toBe('ButtonText')
    expect(declared('switch.css', '.pt-switch:checked', 'border-color', FORCED)).toBe('ButtonText')
    expect(declared('switch.css', '.pt-switch:checked', 'background', FORCED)).toBe('Canvas')
    expect(declared('switch.css', '.pt-switch:checked::before', 'background', FORCED)).toBe(
      'ButtonText',
    )
  })
})

describe('pt-provenance（spec §5.14）', () => {
  it('短署名 12.5px --ink-3，gem 16px；完整声明 12px --ink-2', () => {
    expect(declared('provenance.css', '.pt-provenance', 'font-size')).toBe('12.5px')
    expect(declared('provenance.css', '.pt-provenance', 'color')).toBe('var(--ink-3)')
    expect(declared('provenance.css', '.pt-provenance > .pt-motif--gem', '--ptm-w')).toBe('16px')
    expect(declared('provenance.css', '.pt-disclaimer', 'font-size')).toBe('12px')
    expect(declared('provenance.css', '.pt-disclaimer', 'color')).toBe('var(--ink-2)')
  })
})
