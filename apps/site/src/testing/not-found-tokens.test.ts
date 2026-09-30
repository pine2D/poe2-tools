// @vitest-environment node
// 404（spec §6.5）：独立静态页，内联的最小令牌与 ui-theme 同名令牌同值；只用系统无衬线，不引用构建产物
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseRules, rootTokens } from '../../../../packages/ui-theme/src/testing/css'

const html = readFileSync('apps/site/public/404.html', 'utf8')
const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? ''
const theme = rootTokens(readFileSync('packages/ui-theme/src/tokens.css', 'utf8')).tokens

it('内联 8 个令牌与 tokens.css 同值，只声明深色', () => {
  const inline = rootTokens(style)
  expect(inline.count).toBe(1)
  const names = ['--page', '--bg', '--surface', '--ink', '--ink-2', '--gold', '--bronze', '--focus']
  expect([...inline.tokens.keys()].sort()).toEqual([...names].sort())
  for (const name of names) expect(inline.tokens.get(name), name).toBe(theme.get(name))
  const root = parseRules(style).find((rule) => rule.selectors.includes(':root'))
  expect(root?.declarations.get('color-scheme')).toBe('dark')
})

it('body 底为 --page；卡片 --surface 底、1px --bronze 边；链接 --gold，焦点环 --focus', () => {
  const rules = parseRules(style)
  const get = (selector: string, property: string) =>
    rules.find((rule) => rule.selectors.includes(selector))?.declarations.get(property)
  expect(get('body', 'background')).toBe('var(--page)')
  expect(get('main', 'background')).toBe('var(--surface)')
  expect(get('main', 'border')).toBe('1px solid var(--bronze)')
  expect(get('main', 'max-width')).toBe('600px')
  expect(get('main', 'margin')).toBe('15vh auto')
  expect(get('a', 'color')).toBe('var(--gold)')
  expect(get('a:focus-visible', 'outline')).toBe('2px solid var(--focus)')
})

it('不加载脚本、构建产物与 Web 字体；字体栈没有衬线', () => {
  expect(html).not.toContain('<script')
  expect(html).not.toContain('/assets/')
  expect(html).not.toContain('/fonts/')
  expect(style).not.toContain('@font-face')
  const fonts = [...style.matchAll(/font(?:-family)?\s*:\s*([^;]+);/g)].map(
    (match) => match[1] ?? '',
  )
  expect(fonts.length).toBeGreaterThan(0)
  for (const font of fonts)
    expect(font.replaceAll('sans-serif', '')).not.toMatch(/serif|cinzel|--pt-/i)
  expect(fonts.join(' ')).toContain('sans-serif')
})
