// L1 点缀（spec §4.2、§6.9）门禁：令牌与 tokens.css 一致（字号 px 与 rem 等值）；禁用项；对 CoE 实测底色与面板底的对比度
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { L1_FONT_FAMILY } from '../scripts/compliance.mjs'
import { contrastRatio } from './testing/contrast'
import { parseRules, rootTokens } from './testing/css'

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')
const l1 = read('./l1.css')
const rules = parseRules(l1)
const host = rules.find((rule) => rule.selectors.length === 1 && rule.selectors[0] === ':host')
const tokens = host?.declarations ?? new Map<string, string>()
const site = rootTokens(read('./tokens.css')).tokens
const norm = (value: string | undefined) => value?.replace(/\s+/g, ' ').toLowerCase()
const token = (name: string) => {
  const value = tokens.get(name)
  if (!value) throw new Error(`l1.css 的 :host 缺少 ${name}`)
  return value
}

// spec §6.9“CoE 底色与对比度”实测表（Task 2 复核后以复核值为准）
const COE_BACKGROUNDS = [
  '#1d1c1c',
  '#2c2b2b',
  '#565555',
  '#000000',
  '#333333',
  '#444444',
  '#101010',
  '#2d2d2d',
]
const PANEL = '#000000'
const L1_ONLY = [
  '--ext-ink',
  '--l1-panel',
  '--l1-edge',
  '--l1-shadow',
  '--l1-primary-bg',
  '--l1-primary-edge',
  '--l1-primary-ink',
  '--l1-serif',
]

describe('l1.css 令牌（spec §6.9 样式注入）', () => {
  it('令牌写在单独的 :host 规则上，不写 :root', () => {
    expect(host).toBeDefined()
    expect(rules.some((rule) => rule.selectors.some((s) => s.includes(':root')))).toBe(false)
  })
  it('与 tokens.css 同名的令牌取值相同（字号按 px 等值比较）；其余只能是 L1 专用令牌', () => {
    for (const [name, value] of tokens) {
      if (!name.startsWith('--')) continue
      if (L1_ONLY.includes(name)) continue
      expect(site.has(name), `${name} 不在 tokens.css`).toBe(true)
      if (name.startsWith('--fs-')) {
        // tokens.css 字号写 rem（随浏览器字号缩放）；CoE Shadow DOM 里 rem 取原站根字号，L1 保持 px，按 16px 根字号等值
        expect(value, name).toMatch(/^\d+px$/)
        const rem = /^(\d*\.?\d+)rem$/.exec(site.get(name) ?? '')?.[1]
        expect(rem, `${name} 在 tokens.css 不是 rem`).toBeDefined()
        expect(Number.parseFloat(value), name).toBe(Number(rem) * 16)
        continue
      }
      expect(norm(value), name).toBe(norm(site.get(name)))
    }
    expect(token('--ext-ink')).toBe('#9fe3dc')
    expect(token('--l1-panel')).toBe(PANEL)
  })
})

describe('L1 禁用项（spec §4.2）', () => {
  it('渐变只用于当前候选或步骤，不加载网站字体栈或外部资源', () => {
    for (const rule of rules.filter((r) =>
      [...r.declarations.values()].some((v) => /gradient\(/.test(v)),
    ))
      for (const selector of rule.selectors)
        expect([
          '::slotted(button[aria-selected="true"])',
          '::slotted(button:focus-visible)',
          '.steps [aria-current="step"]',
        ]).toContain(selector)
    expect(l1).not.toMatch(/--pt-serif|--pt-cinzel/)
    expect(l1).not.toMatch(/url\(/i)
  })
  it('::slotted() 规则的每条声明都带 !important（B.12 修订 10）', () => {
    const slotted = rules.filter((r) => r.selectors.some((s) => s.includes('::slotted(')))
    expect(slotted.length).toBeGreaterThan(0)
    for (const rule of slotted) {
      for (const [name, value] of rule.declarations)
        expect(value, `${rule.selectors.join(',')} ${name}`).toMatch(/!important$/)
    }
  })
})

describe('L1 衬线（扩展 0.4.0，DESIGN.md L1 白名单）', () => {
  it('--l1-serif 恰为 L1 子集 family 加 --font-zh-cn；全部声明里只有这一处写 family 名', () => {
    expect(token('--l1-serif')).toBe(`"${L1_FONT_FAMILY}", var(--font-zh-cn)`)
    const mentions = rules
      .flatMap((rule) => [...rule.declarations.values()])
      .filter((value) => value.includes(L1_FONT_FAMILY))
    expect(mentions).toHaveLength(1)
  })
  it('用 --l1-serif 的规则恰好一条，只声明 font-family、不带 !important，不落在定位按钮、候选、输入框、声明、提示条与署名上', () => {
    const serif = rules.filter(
      (rule) =>
        !rule.selectors.includes(':host') &&
        [...rule.declarations.values()].some((value) => value.includes('var(--l1-serif')),
    )
    expect(serif).toHaveLength(1)
    for (const rule of serif) {
      expect([...rule.declarations.keys()]).toEqual(['font-family'])
      expect(rule.declarations.get('font-family')).toBe('var(--l1-serif)')
      for (const selector of rule.selectors)
        expect(selector).not.toMatch(
          /data-tertiary|::slotted|textarea|\.disclaimer|\.notice p|\.check|\.by/,
        )
      // 语言提示只有标题与“关闭”用固定子集，正文保持无衬线（B3-07）
      expect(rule.selectors.filter((selector) => selector.startsWith('.notice'))).toEqual([
        '.notice strong',
        '.notice header button',
      ])
    }
  })
})

describe('L1 宿主压过原站全局样式（CoE `* { color; font }`）', () => {
  const byExact = (selector: string) => rules.find((r) => r.selectors.join(', ') === selector)
  it('叠加译文宿主的 color 带 !important', () => {
    const rule = byExact(':host([data-poe2-l10n="stat"])')
    expect(rule).toBeDefined()
    expect(rule?.declarations.get('color')).toMatch(/!important$/)
  })
  it('面板类宿主的 color、font 带 !important，all 恰为 initial', () => {
    const rule = byExact(
      ':host([data-poe2-l10n="import"]), :host([data-poe2-l10n="search"]), :host([data-poe2-l10n="language-notice"])',
    )
    expect(rule).toBeDefined()
    expect(rule?.declarations.get('color')).toMatch(/!important$/)
    expect(rule?.declarations.get('font')).toMatch(/!important$/)
    expect(rule?.declarations.get('all')).toBe('initial')
  })
})

describe('导入面板文本框随视口收缩（spec §8.8 声明须在视口内）', () => {
  // B3-09：两栏由只读 textarea 改为带行号的行列表 .lines，高度约束原样沿用
  it('.lines 高度 clamp(120px, 20vh, 240px)，最小 120px', () => {
    const rule = rules.find((r) => r.selectors.join(', ') === '.lines')
    expect(norm(rule?.declarations.get('height'))).toBe('clamp(120px, 20vh, 240px)')
    expect(rule?.declarations.get('min-height')).toBe('120px')
  })
})

describe('搜索候选下拉（spec §6.9 列表底部一行、§5.15 焦点环不被裁掉）', () => {
  const byExact = (selector: string) => rules.find((r) => r.selectors.join(', ') === selector)
  /** 把 var(--x) 换成 :host 上的令牌值（尺寸阶梯第三期起写成令牌） */
  const resolve = (value: string | undefined) =>
    (value ?? '').replace(/var\((--[\w-]+)\)/g, (_, name: string) => token(name))
  /** 像素值：认 “8px”、“var(--sp-2)” 与取负写法 “calc(-1 * var(--sp-2))”，忽略 !important */
  const px = (value: string | undefined) => {
    const text = resolve(value)
      .replace(/\s*!important$/, '')
      .trim()
    const negated = /^calc\(\s*-1\s*\*\s*(-?[\d.]+)px\s*\)$/.exec(text)
    const n = negated ? -Number(negated[1]) : Number.parseFloat(text)
    if (!Number.isFinite(n) || (!negated && !/^-?[\d.]+px$/.test(text)))
      throw new Error(`不是像素值：${value}`)
    return n
  }
  const searchHost = byExact(':host([data-poe2-l10n="search"])')
  const by = byExact(':host([data-poe2-l10n="search"]) .by')
  const hostPadding = px(searchHost?.declarations.get('padding'))

  it('署名 sticky 在滚动容器底部，不透明面板底；抵消宿主内边距后贴住底边', () => {
    expect(by?.declarations.get('position')).toBe('sticky')
    expect(by?.declarations.get('background')).toBe('var(--l1-panel)')
    // 粘性约束矩形是滚动容器内容框（已扣内边距）：bottom 取负的宿主内边距，署名底边才贴住边框内侧
    expect(px(by?.declarations.get('bottom'))).toBe(-hostPadding)
    // 署名自己吃掉宿主底部内边距：未滚动时文字离底边仍是 8px，滚到底也不留空隙
    expect(px(by?.declarations.get('padding-bottom'))).toBe(hostPadding)
    expect(px(by?.declarations.get('margin-bottom'))).toBe(-hostPadding)
    // 分隔线不变；字号与上内边距取尺寸阶梯（第三期：12px 与 8px）
    expect(by?.declarations.get('border-top')).toBe('1px solid var(--line)')
    expect(by?.declarations.get('font-size')).toBe('var(--fs-micro)')
    expect(by?.declarations.get('padding-top')).toBe('var(--sp-2)')
    expect([
      px(by?.declarations.get('font-size')),
      px(by?.declarations.get('padding-top')),
    ]).toEqual([12, 8])
  })

  it('scroll-padding 给 2px 焦点环 + 2px 外偏移留位：上 ≥4px，下 ≥ 署名高 + 4px', () => {
    const ring = 2 + 2
    const [top, bottom = top] = resolve(searchHost?.declarations.get('scroll-padding-block'))
      .split(' ')
      .map(px)
    // 署名高 = 上边框 1 + padding-top 8 + 一行（12px × 宿主行高 1.6）+ padding-bottom 8 = 36.2
    const panel = byExact(
      ':host([data-poe2-l10n="import"]), :host([data-poe2-l10n="search"]), :host([data-poe2-l10n="language-notice"])',
    )
    const lineHeight = Number(panel?.declarations.get('font')?.match(/\/\s*([\d.]+)/)?.[1])
    const footer =
      1 +
      px(by?.declarations.get('padding-top')) +
      px(by?.declarations.get('font-size')) * lineHeight +
      px(by?.declarations.get('padding-bottom'))
    expect(top).toBeGreaterThanOrEqual(ring)
    expect(bottom).toBeGreaterThanOrEqual(footer + ring)
  })

  it('候选按钮去掉原站 box-shadow', () => {
    expect(byExact('::slotted(button)')?.declarations.get('box-shadow')).toBe('none !important')
  })
})

describe('次级按钮禁用态（spec §6.9）', () => {
  it('button[data-tertiary]:disabled 保持透明边，且排在 button:disabled 之后', () => {
    const at = (selector: string) => rules.findIndex((r) => r.selectors.join(', ') === selector)
    const tertiary = at('button[data-tertiary]:disabled')
    expect(tertiary).toBeGreaterThan(at('button:disabled'))
    expect(rules[tertiary]?.declarations.get('border-color')).toBe('transparent')
  })
})

describe('对比度（spec §6.9、§4.3）', () => {
  it('v4 主操作有清晰边界，黑底面板与控件为直角', () => {
    const at = (selector: string) => rules.find((r) => r.selectors.join(', ') === selector)
    for (const selector of [
      '.panel',
      '.notice',
      'button',
      '.lines',
      ':host([data-poe2-l10n="search"])',
    ])
      expect(at(selector)?.declarations.get('border-radius'), selector).toBe('0')
    expect(token('--l1-primary-bg')).toBe('#0f304d')
    expect(
      contrastRatio(token('--l1-primary-edge'), token('--l1-primary-bg')),
    ).toBeGreaterThanOrEqual(3)
  })
  it('--ext-ink 对 CoE 全部实测底色 ≥4.5:1', () => {
    for (const bg of COE_BACKGROUNDS)
      expect(contrastRatio(token('--ext-ink'), bg), bg).toBeGreaterThanOrEqual(4.5)
  })
  it('面板文字对面板底 ≥4.5:1，控件边界与焦点环 ≥3:1', () => {
    for (const ink of ['--ink', '--ink-2', '--ink-3', '--ok', '--miss'])
      expect(contrastRatio(token(ink), PANEL), ink).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(token('--mod'), token('--bg-2'))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(token('--ink'), token('--bg'))).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(token('--l1-primary-ink'), token('--l1-primary-bg')),
    ).toBeGreaterThanOrEqual(4.5)
    for (const edge of ['--control-edge', '--l1-primary-edge', '--focus'])
      expect(contrastRatio(token(edge), PANEL), edge).toBeGreaterThanOrEqual(3)
  })
})

describe('导入面板核对清单（方案 §4 第三期；裁定 25）', () => {
  const byExact = (selector: string) => rules.find((r) => r.selectors.join(', ') === selector)
  it('旧的状态句、诊断列表与兼容性提示规则已删，清单规则齐全', () => {
    for (const old of [
      '[role="status"]',
      '[role="status"]:empty',
      'ul',
      '[aria-label="原站兼容性提示"]',
    ])
      expect(byExact(old), old).toBeUndefined()
    for (const selector of [
      '.verdict',
      '.verdict:empty',
      '.verdict small',
      '.check',
      '.check:empty',
      '.group',
      '.group h3',
      '.check ul',
      '.check li',
      '.ico',
      '.check li .ico',
      '.who',
      '.check li button',
      '.check li[data-kind="warning"]',
      '.ok',
      '.miss',
      '.dim',
    ])
      expect(byExact(selector), selector).toBeDefined()
    expect(byExact('.verdict:empty')?.declarations.get('display')).toBe('none')
    expect(byExact('.check:empty')?.declarations.get('display')).toBe('none')
  })
  it('“第 N 行”定位按钮高 24px（WCAG 2.5.8 下限），外边距归零', () => {
    const rule = byExact('.check li button')
    expect(rule?.declarations.get('min-height')).toBe('24px')
    expect(rule?.declarations.get('margin')).toBe('0')
  })
  it('清单相关规则的行高一律无单位', () => {
    const related = rules.filter((r) =>
      r.selectors.some((s) => /\.(check|group|who|verdict)\b/.test(s)),
    )
    expect(related.length).toBeGreaterThan(0)
    for (const rule of related) {
      const value = rule.declarations.get('line-height')
      if (value !== undefined) expect(value, rule.selectors.join(', ')).toMatch(/^\d+(\.\d+)?$/)
    }
  })
  // Task 8 评审第 1 轮：320 宽下标题词中断开、问题原文每行约 4 字；窄面板改排版，宽面板规则不动（以截图复核观感）
  it('面板是具名尺寸容器；窄于 480px 时标题不断行、署名换行、组名放上方、条目绕排', () => {
    const panel = byExact('.panel')
    expect(panel?.declarations.get('container')).toBe('import-panel / inline-size')
    const narrow = rules.filter(
      (r) => r.atRules.join(' ') === '@container import-panel (width < 480px)',
    )
    const at = (selector: string) => narrow.find((r) => r.selectors.join(', ') === selector)
    expect(at('.title')?.declarations.get('white-space')).toBe('nowrap')
    expect(at('.head')?.declarations.get('flex-wrap')).toBe('wrap')
    expect(at('.head .by')?.declarations.get('flex-basis')).toBe('100%')
    expect(at('.group')?.declarations.get('grid-template-columns')).toBe('minmax(0, 1fr)')
    expect(at('.check li')?.declarations.get('display')).toBe('flow-root')
    expect(at('.check li .ico')?.declarations.get('float')).toBe('left')
    // 宽面板规则里没有这些声明：窄排版只在容器查询里
    expect(byExact('.check li')?.declarations.get('display')).toBe('flex')
    expect(byExact('.group')?.declarations.get('grid-template-columns')).toBe('56px minmax(0, 1fr)')
  })
  it('失效态排在兼容性提示与语气色之后，只降已完成与待核对两组为 --ink-3，下一步不降', () => {
    const at = (selector: string) => rules.findIndex((r) => r.selectors.join(', ') === selector)
    const stale = at(
      '.check.stale [data-group="done"] li, .check.stale [data-group="done"] .ico, .check.stale [data-group="pending"] li, .check.stale [data-group="pending"] .ico',
    )
    expect(stale).toBeGreaterThan(at('.check li[data-kind="warning"]'))
    expect(stale).toBeGreaterThan(at('.dim'))
    expect(rules[stale]?.declarations.get('color')).toBe('var(--ink-3)')
    expect(rules.some((r) => r.selectors.join(', ').includes('[data-group="next"]'))).toBe(false)
    expect(at('.check.stale li, .check.stale .ico')).toBe(-1)
  })
})

describe('v4 复盘第 3 组', () => {
  const byExact = (selector: string, atRules = '') =>
    rules.find((r) => r.selectors.join(', ') === selector && r.atRules.join(' ') === atRules)
  it('B3-06：搜索说明行用 !important 的 font 简写压回系统无衬线与无单位行高', () => {
    const font = byExact('::slotted(div)')?.declarations.get('font')
    expect(font).toBe('var(--fs-small) / 1.6 var(--font-zh-cn) !important')
    expect(byExact('::slotted(div)')?.declarations.has('font-size')).toBe(false)
  })
  it('B3-10：强制色彩下当前步骤用系统色内描边标出；窄面板署名在 gem 隐藏后不再缩进', () => {
    const step = byExact('.steps [aria-current="step"]', '@media (forced-colors: active)')
    expect(step?.declarations.get('outline')).toBe('2px solid Highlight')
    expect(step?.declarations.get('outline-offset')).toBe('-2px')
    const by = byExact(
      '.head .by',
      '@media (forced-colors: active) @container import-panel (width < 480px)',
    )
    expect(by?.declarations.get('margin-left')).toBe('0')
  })
})

describe('顶层候选浮层（复盘 B3-01）', () => {
  it('搜索宿主以 all: initial 复位 [popover] 的浏览器默认 inset、margin、边框与底色，定位只由内联样式决定', () => {
    const host = rules.find((rule) => rule.selectors.includes(':host([data-poe2-l10n="search"])'))
    expect(host?.declarations.get('all')).toBe('initial')
  })
})

describe('B3-09：候选数量、类别、匹配高亮与导入两栏行号', () => {
  const byExact = (selector: string, atRules = '') =>
    rules.find((r) => r.selectors.join(', ') === selector && r.atRules.join(' ') === atRules)
  const decl = (selector: string, name: string, atRules = '') =>
    byExact(selector, atRules)?.declarations.get(name)
  it('说明行自带 shadow 排成一行：说明伸缩，“N 项”不换行、用无衬线小字', () => {
    expect(decl(':host([data-search-help])', 'display')).toBe('flex')
    // 不换行：数量固定在首行右端，说明文字自己折行
    expect(decl(':host([data-search-help])', 'flex-wrap')).toBeUndefined()
    const count = '::slotted([slot="help-count"])'
    expect(decl(count, 'white-space')).toBe('nowrap !important')
    expect(decl(count, 'font')).toBe('var(--fs-micro) / 1.6 var(--font-zh-cn) !important')
  })
  it('候选标签是两列网格：中英文在左，类别占右列跨两行，用无衬线小字并带边框（不只靠颜色）', () => {
    expect(decl(':host([data-candidate])', 'display')).toBe('grid')
    const kind = '::slotted([slot="candidate-kind"])'
    expect(decl(kind, 'grid-row')).toBe('1 / span 2 !important')
    expect(decl(kind, 'font')).toBe('var(--fs-micro) / 1.5 var(--font-zh-cn) !important')
    expect(decl(kind, 'border')).toBe('1px solid var(--line-2) !important')
  })
  it('命中字加重并加下划线，非命中字为常规字重：差别不只靠颜色', () => {
    expect(decl('::slotted([slot="candidate-zh"])', 'font')).toBe(
      '400 var(--fs-body) / 1.5 var(--font-zh-cn) !important',
    )
    const hit = '::slotted([data-hit])'
    expect(decl(hit, 'font-weight')).toBe('700 !important')
    expect(decl(hit, 'text-decoration-line')).toBe('underline !important')
  })
  it('行号不可选中、右对齐；待核对行有左边条与粗行号；定位行有描边；强制色彩下边条改系统色', () => {
    expect(decl('.lines .ln', 'user-select')).toBe('none')
    expect(decl('.lines li[data-issue]', 'border-left-color')).toBe('var(--miss)')
    expect(decl('.lines li[data-issue] .ln', 'font-weight')).toBe('700')
    expect(decl('.lines li[data-focus]', 'outline')).toBe('1px solid var(--miss)')
    expect(
      decl('.lines li[data-issue]', 'border-left-color', '@media (forced-colors: active)'),
    ).toBe('Highlight')
    // 透明边条在强制色彩下会变成文字色：普通行须显式改为底色，否则每行都像待核对
    expect(decl('.lines li', 'border-left-color', '@media (forced-colors: active)')).toBe('Canvas')
    expect(decl('.lines li[data-focus]', 'outline-color', '@media (forced-colors: active)')).toBe(
      'Highlight',
    )
    // 读屏提示只在视觉上隐藏
    expect(decl('.sr', 'clip-path')).toBe('inset(50%)')
  })
})
