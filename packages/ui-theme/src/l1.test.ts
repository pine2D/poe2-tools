// L1 点缀（spec §4.2、§6.9）门禁：令牌与 tokens.css 一致；禁用项；对 CoE 实测底色与面板底的对比度
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
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
  it('不用渐变、衬线、外部或内嵌 url()', () => {
    expect(l1).not.toMatch(/gradient\(/)
    expect(l1).not.toMatch(/--pt-serif|--pt-cinzel/)
    expect(l1).not.toMatch(/url\(/i)
  })
  it('::slotted() 规则的每条声明都带 !important（B.12 修订 10）', () => {
    for (const rule of rules.filter((r) => r.selectors.some((s) => s.includes('::slotted(')))) {
      for (const [name, value] of rule.declarations)
        expect(value, `${rule.selectors.join(',')} ${name}`).toMatch(/!important$/)
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
