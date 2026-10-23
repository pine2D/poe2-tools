// @vitest-environment node
// 404：独立静态页，内联的最小令牌与 ui-theme 同名令牌同值；v4 外观（直角黑面板、板岩细线、衬线标题），不引用构建产物与 Web 字体
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseRules, rootTokens } from '../../../../packages/ui-theme/src/testing/css'

const html = readFileSync('apps/site/public/404.html', 'utf8')
const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? ''
const theme = rootTokens(readFileSync('packages/ui-theme/src/tokens.css', 'utf8')).tokens
const NAMES = [
  '--page',
  '--bg',
  '--line-2',
  '--metal-line',
  '--label',
  '--ink',
  '--ink-2',
  '--ink-3',
  '--gold',
  '--focus',
]

it('内联令牌与 tokens.css 同值，只声明深色', () => {
  const inline = rootTokens(style)
  expect(inline.count).toBe(1)
  expect([...inline.tokens.keys()].sort()).toEqual([...NAMES].sort())
  for (const name of NAMES) expect(inline.tokens.get(name), name).toBe(theme.get(name))
  const root = parseRules(style).find((rule) => rule.selectors.includes(':root'))
  expect(root?.declarations.get('color-scheme')).toBe('dark')
})

// B4-13、B1-08：直角、纯黑面板、板岩色章节线、衬线标题；链接 --gold，焦点环 --focus
it('body 底为 --page；面板 --bg 底、直角、1px --line-2 边；标题下一条 --metal-line 细线', () => {
  const rules = parseRules(style)
  const get = (selector: string, property: string) =>
    rules
      .find((rule) => rule.atRules.length === 0 && rule.selectors.includes(selector))
      ?.declarations.get(property)
  expect(get('body', 'background')).toBe('var(--page)')
  expect(get('main', 'background')).toBe('var(--bg)')
  expect(get('main', 'border')).toBe('1px solid var(--line-2)')
  expect(get('main', 'border-radius')).toBe('0')
  expect(get('main', 'max-width')).toBe('600px')
  expect(get('main', 'margin')).toBe('15vh auto')
  expect(get('h1', 'border-bottom')).toBe('1px solid var(--metal-line)')
  expect(get('h1', 'color')).toBe('var(--label)')
  expect(get('h1', 'font')).toMatch(/serif$/)
  expect(get('h1', 'font')).toContain('"Noto Serif SC"')
  expect(get('a', 'color')).toBe('var(--gold)')
  expect(get('a', 'min-height')).toBe('44px')
  expect(get('a:focus-visible', 'outline')).toBe('2px solid var(--focus)')
  expect(style).not.toMatch(/border-radius:\s*[1-9]/)
})

it('不加载脚本、构建产物与 Web 字体；正文无衬线，衬线只用在标题且只取本机字体', () => {
  expect(html).not.toContain('<script')
  expect(html).not.toContain('/assets/')
  expect(html).not.toContain('/fonts/')
  expect(style).not.toContain('@font-face')
  expect(style).not.toMatch(/--pt-|cinzel/i)
  const body = parseRules(style).find((rule) => rule.selectors.includes('body'))
  expect(body?.declarations.get('font')).toMatch(/sans-serif$/)
})

it('旧菱形徽标与实现历史文案已移除', () => {
  expect(html).not.toContain('<svg')
  expect(html).not.toContain('独立的工作台地址')
  expect(html).toContain('<h1>这里没有找到页面。</h1>')
  for (const href of ['/', '/build/', '/extension/']) expect(html).toContain(`href="${href}"`)
})

// 2026-10-23 字号 rem 迁移：随浏览器“字体大小”缩放，默认 16px 根字号下与原 16／13／28／24px 一致；不固定根字号
it('字号写 rem、不写 px，也不在 html／:root 固定根字号', () => {
  const rules = parseRules(style)
  const sizes = rules.flatMap((rule) =>
    [...rule.declarations]
      .filter(([name]) => name === 'font' || name === 'font-size')
      .map(([, value]) => value),
  )
  expect(sizes.length).toBeGreaterThan(0)
  for (const value of sizes) expect(value).not.toMatch(/\dpx\b/)
  expect(sizes).toEqual(
    expect.arrayContaining([expect.stringMatching(/^1rem\/1\.8 /), '0.8125rem', '1.5rem']),
  )
  expect(sizes.some((value) => value.startsWith('700 1.75rem/1.35 '))).toBe(true)
  for (const rule of rules.filter((r) => r.selectors.some((s) => /^(html|:root)$/.test(s))))
    expect(rule.declarations.has('font-size')).toBe(false)
})
