// L1 点缀（spec §4.2、§6.9）门禁：令牌与 tokens.css 一致；禁用项；对 CoE 实测底色与面板底的对比度
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
const PANEL = '#15120f'
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
  it('与 tokens.css 同名的令牌取值相同；其余只能是 L1 专用令牌', () => {
    for (const [name, value] of tokens) {
      if (!name.startsWith('--')) continue
      if (L1_ONLY.includes(name)) continue
      expect(site.has(name), `${name} 不在 tokens.css`).toBe(true)
      expect(norm(value), name).toBe(norm(site.get(name)))
    }
    expect(token('--ext-ink')).toBe('#9fe3dc')
    expect(token('--l1-panel')).toBe(PANEL)
  })
})

describe('L1 禁用项（spec §4.2）', () => {
  it('不用渐变、网站衬线栈（--pt-serif、--pt-cinzel）、外部或内嵌 url()', () => {
    expect(l1).not.toMatch(/gradient\(/)
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
          /data-tertiary|::slotted|textarea|\.disclaimer|\.notice|\.check|\.by/,
        )
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
  it('textarea 高度 clamp(120px, 20vh, 240px)，最小 120px', () => {
    const rule = rules.find((r) => r.selectors.join(', ') === 'textarea')
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
