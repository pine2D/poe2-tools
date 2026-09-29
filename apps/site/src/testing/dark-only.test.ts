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
