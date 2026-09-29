import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { parseRules } from '../../../../../packages/ui-theme/src/testing/css'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { SiteHeader } from './SiteHeader'

afterEach(cleanup)

// 构筑页入口的九个页面样式文件，顺序同 features/build-l10n/main.tsx（契约 §4.1）
const BUILD_PAGE_STYLES = [
  'controls.css',
  'layout.css',
  'sidebar.css',
  'empty.css',
  'overview.css',
  'cards.css',
  'table.css',
  'responsive.css',
  'a11y.css',
]

describe('SiteHeader（spec §5.2、§6.1）', () => {
  it('品牌链接回首页，可访问名是产品名；logo 是 aria-hidden 的母题', () => {
    render(<SiteHeader active="home" />)
    const brand = screen.getByRole('link', { name: 'PoE2 Tools 首页' })
    expect(brand.getAttribute('href')).toBe('/')
    expect(brand.getAttribute('class')).toBe('pt-brand')
    expect(brand.querySelector('.pt-motif--logo')?.getAttribute('aria-hidden')).toBe('true')
  })

  it.each([
    ['home', null],
    ['build', '/build/'],
    ['extension', '/extension/'],
  ] as const)('active=%s 时只有对应导航带 aria-current', (active, current) => {
    render(<SiteHeader active={active} />)
    const nav = screen.getByRole('navigation', { name: '工具导航' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['构筑汉化', '/build/'],
      ['中文助手', '/extension/'],
    ])
    expect(
      links
        .filter((link) => link.getAttribute('aria-current') === 'page')
        .map((link) => link.getAttribute('href')),
    ).toEqual(current === null ? [] : [current])
  })

  it('没有主题选择；页面控件在 .pt-header__end 里、GitHub 链接之前', () => {
    render(
      <SiteHeader active="build">
        <button type="button">设置</button>
      </SiteHeader>,
    )
    expect(screen.queryByRole('combobox', { name: '界面主题' })).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: '界面主题' })).toBeNull()
    const end = document.querySelector('.pt-header__end')
    expect([...(end?.children ?? [])].map((el) => el.textContent)).toEqual(['设置', 'GitHub'])
    expect(screen.getByRole('link', { name: 'GitHub' }).getAttribute('href')).toBe(
      'https://github.com/pine2D/poe2-tools',
    )
  })

  it('构筑页页头不建层叠上下文，设置弹层不被吸顶工具栏压住（契约 C14）', () => {
    const here = dirname(fsPathFromMetaUrl(import.meta.url))
    // 按入口的引入顺序拼接后取最后一条，与层叠顺序一致；只读单个文件的第一条匹配会在 M2 两段式清理时失效
    const css = BUILD_PAGE_STYLES.map((name) =>
      readFileSync(resolve(here, `../styles/${name}`), 'utf8'),
    ).join('\n')
    const values = parseRules(css)
      .filter((rule) => rule.selectors.includes('.app .pt-header') && rule.atRules.length === 0)
      .map((rule) => rule.declarations.get('z-index'))
      .filter((value) => value !== undefined)
    expect(values.at(-1)).toBe('auto')
  })
})
