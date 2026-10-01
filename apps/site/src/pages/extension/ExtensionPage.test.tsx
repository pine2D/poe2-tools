import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
// spec §5.14 的完整声明只有一处出处（契约 C5）；契约 C18 保证 happy-dom 测试里可以直接导入 compliance.mjs
import { FULL_DISCLAIMER } from '@poe2-tools/ui-theme/compliance'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { parseRules } from '../../../../../packages/ui-theme/src/testing/css'
import { fsPathFromMetaUrl } from '../../shared/testing/fsPath'
import { ExtensionPage } from './ExtensionPage'

const FOCUSABLE = 'a, button, input, select, textarea, [tabindex]'

afterEach(cleanup)
it('预览版安装不伪装为商店安装，明确支持范围与升级步骤', () => {
  render(<ExtensionPage />)
  expect(screen.getByRole('link', { name: /查看源码与构建说明/ }).getAttribute('href')).toContain(
    'install.md',
  )
  expect(screen.getByText(/尚未提供公开发行包/)).toBeDefined()
  expect(
    screen.getByRole('link', { name: '下载源码 ZIP（需构建）' }).getAttribute('href'),
  ).toContain('/archive/a68f6d8bacc7f336f6136a91665ca027063a536c.zip')
  expect(screen.getByText(/pnpm extension:build/)).toBeDefined()
  expect(screen.getByText(/pnpm extension:check/)).toBeDefined()
  expect(screen.queryByText(/pnpm extension:package/)).toBeNull()
  expect(screen.getByRole('heading', { name: '安装开发预览版' })).toBeDefined()
  expect(screen.getByRole('heading', { name: '更新与恢复' })).toBeDefined()
  expect(screen.getByRole('link', { name: /打开 CoE Beta/ }).getAttribute('href')).toBe(
    'https://beta.craftofexile.com/?game=poe2',
  )
})

describe('扩展介绍页结构（spec §6.3、§4.2）', () => {
  it('页面根带 pt-backdrop，跳转链接指向 main', () => {
    const { container } = render(<ExtensionPage />)
    expect((container.firstElementChild as HTMLElement).className).toBe('pt-backdrop portal')
    expect(screen.getByRole('link', { name: '跳到主要内容' }).getAttribute('href')).toBe('#main')
    expect(container.querySelector('main#main')?.className).toBe('portal-main extension-main')
  })

  it('hero 是一扇无标题栏的 pt-frame--hero，全页只有这一扇框和一个金属主按钮', () => {
    const { container } = render(<ExtensionPage />)
    const frames = container.querySelectorAll('.pt-frame')
    expect(frames).toHaveLength(1)
    const hero = frames[0] as HTMLElement
    expect(hero.tagName).toBe('SECTION')
    expect(hero.className).toBe('pt-frame pt-frame--hero extension-intro')
    expect([...hero.children].some((child) => child.classList.contains('pt-titlebar'))).toBe(false)
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.className).toBe('pt-hero-title pt-hero-title--extension')
    expect(title.textContent).toBe('熟悉的术语，就在原来的工具里。')
    expect(title.querySelector('.pt-hero-title__gold')?.textContent).toBe('就在原来的工具里。')
    const forge = container.querySelectorAll('.pt-forge-btn')
    expect(forge).toHaveLength(1)
    const install = screen.getByRole('link', { name: '查看安装步骤' })
    expect(install).toBe(forge[0])
    expect(install.getAttribute('href')).toBe('#install')
    expect(hero.contains(install)).toBe(true)
  })

  it('B12：说明在 DOM 中排在操作行之前，完整声明在操作行之后，三者同在一个 flex 列里', () => {
    const { container } = render(<ExtensionPage />)
    const copy = container.querySelector('.extension-intro__copy') as HTMLElement
    expect([...copy.children].map((child) => child.classList[0])).toEqual([
      'pt-hero-title',
      'extension-intro__lead',
      'extension-intro__note',
      'extension-actions',
      'extension-intro__legal',
    ])
    const note = copy.querySelector('.extension-intro__note') as HTMLElement
    expect(note.textContent).toBe('开发预览 · 需自行构建。适用于桌面 Chrome，请在电脑上安装。')
    expect(note.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    const legal = copy.querySelector('.extension-intro__legal') as HTMLElement
    expect(legal.textContent).toBe(FULL_DISCLAIMER)
    expect(note.querySelectorAll(FOCUSABLE)).toHaveLength(0)
    expect(legal.querySelectorAll(FOCUSABLE)).toHaveLength(0)
  })

  it('环境卡是带标题栏与 chip 的 pt-panel card（不是框中框），内容沿用现有文案', () => {
    const { container } = render(<ExtensionPage />)
    const env = container.querySelector('aside[aria-label="版本与支持范围"]') as HTMLElement
    expect(env.className).toBe('pt-panel pt-panel--card pt-panel--titled extension-env')
    expect(env.closest('.pt-frame')?.classList.contains('extension-intro')).toBe(true)
    const bar = env.querySelector('.pt-titlebar') as HTMLElement
    expect(within(bar).getByRole('heading', { level: 2 }).textContent).toBe('先确认你的使用环境')
    expect(bar.querySelector('.pt-chip')?.textContent).toBe('开发预览 · 0.1.111')
    expect(env.querySelector('.pt-panel__body > .pt-chip--body')?.textContent).toBe(
      '开发预览 · 0.1.111',
    )
    expect([...env.querySelectorAll('dt')].map((el) => el.textContent)).toEqual([
      '站点',
      '模式',
      '语言',
    ])
    expect([...env.querySelectorAll('dd')].map((el) => el.textContent)).toEqual([
      'beta.craftofexile.com',
      'PoE2 → English',
      '国服简体中文',
    ])
    expect(env.querySelector('.extension-env__note')?.textContent).toBe(
      '不支持旧版 www 站和 PoE1，也不会翻译所有英文段落。',
    )
  })

  it('能力区在框外：上方一条分隔线，三个小标题用 pt-subhead，其余标题保持 L0', () => {
    const { container } = render(<ExtensionPage />)
    const caps = container.querySelector('section[aria-label="主要能力"]') as HTMLElement
    expect(caps.closest('.pt-frame')).toBeNull()
    const divider = caps.firstElementChild as HTMLElement
    expect(divider.className).toBe('pt-divider')
    expect(divider.getAttribute('aria-hidden')).toBe('true')
    expect([...caps.querySelectorAll('h2')].map((h) => [h.className, h.textContent])).toEqual([
      ['pt-subhead', '看得懂'],
      ['pt-subhead', '搜得到'],
      ['pt-subhead', '核对后再导入'],
    ])
    expect(container.querySelectorAll('.pt-subhead')).toHaveLength(3)
    for (const name of [
      '安装开发预览版',
      '更新与恢复',
      '文本处理与隐私',
      '支持范围与已知限制',
      '遇到问题？',
    ]) {
      expect(screen.getByRole('heading', { name }).className).toBe('')
    }
    for (const h3 of container.querySelectorAll('.extension-steps h3'))
      expect(h3.className).toBe('')
  })
})

describe('extension.css（spec §6.3、§6.7、§4.5；M0 extension.html）', () => {
  const here = dirname(fsPathFromMetaUrl(import.meta.url))
  const css = readFileSync(resolve(here, '../../shared/styles/extension.css'), 'utf8')
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = parseRules(css)
  const squash = (value: string) => value.replace(/\s+/g, '')
  const norm = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()
  const NARROW = ['max-width: 620px']
  // 取某个选择器在指定条件（外层 @media/@container，由外到内）下的全部声明；conditions 为空表示顶层
  function decls(selector: string, conditions: readonly string[] = []): Map<string, string> {
    const merged = new Map<string, string>()
    for (const rule of rules) {
      if (!rule.selectors.map(norm).includes(selector)) continue
      if (rule.atRules.length !== conditions.length) continue
      if (!conditions.every((c, i) => squash(rule.atRules[i] ?? '').includes(squash(c)))) continue
      for (const [name, value] of rule.declarations) merged.set(name, norm(value))
    }
    return merged
  }

  it('hero 两栏、右栏定宽 540px；≤1199px 改单栏（M0 E2、E10）', () => {
    expect(decls('.extension-intro').get('grid-template-columns')).toBe('minmax(0, 1fr) 540px')
    expect(decls('.extension-intro', ['max-width: 1199px']).get('grid-template-columns')).toBe(
      'minmax(0, 1fr)',
    )
  })

  it('B12：≥621px 用 order 把说明排到操作行之后、无图标、--ink-3；≤620px 回到 DOM 顺序、显示图标、--ink-2', () => {
    const copy = decls('.extension-intro__copy')
    expect(copy.get('display')).toBe('flex')
    expect(copy.get('flex-direction')).toBe('column')
    expect(decls('.extension-intro__copy > .extension-intro__note').get('order')).toBe('1')
    expect(decls('.extension-intro__copy > .extension-intro__legal').get('order')).toBe('2')
    expect(decls('.extension-intro__note').get('color')).toBe('var(--ink-3)')
    expect(decls('.extension-intro__note-icon').get('display')).toBe('none')
    const narrow = decls('.extension-intro__copy > .extension-intro__note', NARROW)
    expect(narrow.get('order')).toBe('0')
    expect(narrow.get('color')).toBe('var(--ink-2)')
    expect(decls('.extension-intro__note-icon', NARROW).get('display')).toBe('block')
    expect(decls('.extension-intro__legal').get('color')).toBe('var(--ink-2)')
    expect(decls('.extension-intro__legal').get('font-size')).toBe('13px')
  })

  it('≤620px：页边距 16px，金属主按钮通栏，各区改单列（spec §6.7）', () => {
    expect(decls('.extension-main', NARROW).get('padding')).toBe('20px 16px 32px')
    expect(decls('.extension-actions .pt-forge-btn', NARROW).get('width')).toBe('100%')
    for (const selector of [
      '.extension-capabilities__grid',
      '.extension-guide',
      '.extension-details',
    ]) {
      expect(decls(selector, NARROW).get('grid-template-columns'), selector).toBe('minmax(0, 1fr)')
    }
  })

  it('页面层不写衬线字体栈、不设层级、不裁切角饰、不引用外部资源（spec §7.1、§4.5、§8.5）', () => {
    expect(bare).not.toMatch(/--pt-(serif|cinzel)/)
    expect(bare).not.toMatch(/z-index/)
    expect(bare).not.toMatch(/overflow\s*:\s*(hidden|clip)|contain\s*:\s*paint/)
    expect(bare).not.toMatch(/url\(/)
  })
})
