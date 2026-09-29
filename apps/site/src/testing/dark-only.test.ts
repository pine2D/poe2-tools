// @vitest-environment node
// 只保留深色（spec §2 D2、§7.2）：旧令牌名与页面层衬线的门禁
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseRules, rootTokens } from '../../../../packages/ui-theme/src/testing/css'
import { contrastRatio } from '../shared/testing/contrast'

const SITE_SRC = 'apps/site/src'
const THEME_SRC = 'packages/ui-theme/src'
const read = (path: string) => readFileSync(path, 'utf8')

function sourceFiles(dir: string, extensions: readonly string[]): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile())
    .filter((path) => extensions.some((ext) => path.endsWith(ext)) && !path.includes('.test.'))
}

// 契约 §6.2 的禁用旧名单：完整令牌名匹配，前后都不能紧跟字母、数字、下划线或连字符
const OLD_TOKENS = [
  '--surface-0',
  '--surface-1',
  '--surface-2',
  '--surface-3',
  '--surface-hover',
  '--text',
  '--text-muted',
  '--accent',
  '--accent-bg',
  '--action-bg',
  '--action-text',
  '--success',
  '--warn',
  '--warn-bg',
  '--rarity-unique',
  '--rarity-gem',
  '--brand',
  '--brand-ink',
  '--portal-panel',
  '--mk-rgb-l',
]
const OLD_TOKEN_RE = new RegExp(`(?<![A-Za-z0-9_-])(${OLD_TOKENS.join('|')})(?![A-Za-z0-9-])`, 'g')

describe('令牌迁移（spec §7.2）', () => {
  it('apps/site/src（不含工坊与测试）和 packages/ui-theme/src 没有任何旧令牌名', () => {
    const files = [
      ...sourceFiles(SITE_SRC, ['.css', '.ts', '.tsx']).filter(
        (path) => !path.startsWith(`${SITE_SRC}/features/craft`),
      ),
      ...sourceFiles(THEME_SRC, ['.css', '.ts']),
    ]
    const hits = files.flatMap((path) =>
      [...read(path).matchAll(OLD_TOKEN_RE)].map((match) => `${path}: ${match[1]}`),
    )
    expect(hits).toEqual([])
  })

  it('页面层的 CSS 与 TSX 不直接用衬线：衬线只能通过 ui-theme 组件类（spec §7.1）', () => {
    const hits = sourceFiles(SITE_SRC, ['.css', '.tsx']).filter((path) =>
      /--pt-serif|--pt-cinzel/.test(read(path)),
    )
    expect(hits).toEqual([])
  })

  it('金底上的文字用 --bg（契约 C7）：跳转链接对比度 ≥4.5:1', () => {
    const tokens = rootTokens(read(`${THEME_SRC}/tokens.css`)).tokens
    const skip = parseRules(read(`${SITE_SRC}/shared/styles/site.css`)).find(
      (rule) => rule.selectors.includes('.skip-link') && rule.atRules.length === 0,
    )
    expect(skip?.declarations.get('background')).toBe('var(--gold)')
    expect(skip?.declarations.get('color')).toBe('var(--bg)')
    expect(
      contrastRatio(tokens.get('--bg') ?? '', tokens.get('--gold') ?? ''),
    ).toBeGreaterThanOrEqual(4.5)
  })
})

// spec §7.2 门禁第一条：主题相关字符串全部消失
const THEME_STRINGS = [
  'data-theme',
  'prefers-color-scheme: light',
  'poe2-tools.theme',
  'color-scheme: dark light',
  'color-scheme: light',
]
const HTML_ENTRIES = [
  'apps/site/index.html',
  'apps/site/build/index.html',
  'apps/site/extension/index.html',
  'apps/site/craft/index.html',
  'apps/site/public/404.html',
]

describe('主题移除（spec §7.2）', () => {
  it('站点源码、四个入口 HTML、404 与 ui-theme 源码里没有主题字符串', () => {
    const files = [
      ...sourceFiles(SITE_SRC, ['.css', '.ts', '.tsx']),
      ...HTML_ENTRIES,
      ...sourceFiles(THEME_SRC, ['.css', '.ts']),
    ]
    const hits = files.flatMap((path) =>
      THEME_STRINGS.filter((word) => read(path).includes(word)).map((word) => `${path}: ${word}`),
    )
    expect(hits).toEqual([])
  })

  it('三个页面入口只声明深色：color-scheme dark，唯一一条 theme-color #17130f', () => {
    for (const path of HTML_ENTRIES.slice(0, 3)) {
      const html = read(path)
      expect(html, path).toContain('<meta name="color-scheme" content="dark" />')
      expect(html.match(/name="theme-color"/g), path).toHaveLength(1)
      expect(html, path).toContain('<meta name="theme-color" content="#17130f" />')
      expect(html, path).not.toContain('<script>')
    }
  })
})
