import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
// spec §5.14 的完整声明只有一处出处（契约 C5）；契约 C18 保证 happy-dom 测试里可以直接导入 compliance.mjs
import { FULL_DISCLAIMER } from '@poe2-tools/ui-theme/compliance'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { parseRules } from '../../../../../packages/ui-theme/src/testing/css'
// @ts-expect-error 构建脚本直接由 Node 执行，不进入浏览器包。
import { EXTENSION_PAGE_FORBIDDEN } from '../../../scripts/check-site.mjs'
import { fsPathFromMetaUrl } from '../../shared/testing/fsPath'
import { ExtensionPage } from './ExtensionPage'
import { downloadHref, EXTENSION_RELEASE, formatSize } from './release'

const FOCUSABLE = 'a, button, input, select, textarea, [tabindex]'

afterEach(cleanup)
const DOWNLOAD_TEXT = `下载扩展（v${EXTENSION_RELEASE.version}，zip，${formatSize(EXTENSION_RELEASE.bytes)}）`
// 可访问名称在浏览器与 happy-dom 里可能在“下载扩展”与括号之间多一个空格，比较时忽略空白
const isDownloadName = (name: string) =>
  name.replace(/\s+/g, '') === DOWNLOAD_TEXT.replace(/\s+/g, '')
it('面向普通用户：下载按钮直链 zip，安装四步与更新说明齐全，不出现开发向内容', () => {
  const { container } = render(<ExtensionPage />)
  const download = screen.getByRole('link', { name: isDownloadName })
  expect(download.getAttribute('href')).toBe(downloadHref)
  expect(downloadHref).toBe(`/downloads/${EXTENSION_RELEASE.file}`)
  expect(download.hasAttribute('download')).toBe(true)
  expect(download.textContent).toBe(DOWNLOAD_TEXT)
  expect(screen.getByRole('heading', { name: '安装' })).toBeDefined()
  expect(
    [...container.querySelectorAll('.extension-steps > li > p')].map((p) => p.textContent),
  ).toEqual([
    '下载并解压到一个固定的文件夹（之后不要删除或移动它）。',
    '在 Chrome 地址栏打开 chrome://extensions，打开右上角“开发者模式”。',
    '点“加载已解压的扩展程序”，选刚才的文件夹。',
    '打开 CoE Beta，选 PoE2 → English 并刷新页面，在扩展弹窗里启用简体中文。',
  ])
  expect(container.querySelector('.extension-guide__note')?.textContent).toBe(
    'Chrome 会提示扩展不是来自应用商店，这是正常的；开发者模式需要一直开着，关掉后扩展会停用；Chrome 更新后如果扩展被停用，回到扩展页重新打开即可。',
  )
  expect(container.querySelector('.extension-guide__heading p')?.textContent).toContain(
    `当前版本 v${EXTENSION_RELEASE.version}，发布于 ${EXTENSION_RELEASE.date}。`,
  )
  expect(container.querySelector('#update p')?.textContent).toBe(
    '下载新版 zip，解压覆盖原文件夹里的文件，在扩展页点该扩展的“重新加载”（圆形箭头），再刷新 CoE 页面；弹窗里的“检查更新”会打开本页对比版本。',
  )
  expect(screen.getByRole('link', { name: /打开 CoE Beta/ }).getAttribute('href')).toBe(
    'https://beta.craftofexile.com/?game=poe2',
  )
  const main = container.querySelector('main') as HTMLElement
  const hrefs = [...main.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '')
  for (const word of EXTENSION_PAGE_FORBIDDEN as string[]) {
    expect(main.textContent, word).not.toContain(word)
    for (const href of hrefs) expect(href, word).not.toContain(word)
  }
  expect(
    hrefs.some((href) => /\/archive\/|install\.md|compatibility\.md|[0-9a-f]{40}/.test(href)),
  ).toBe(false)
  // SHA-256 只放在 GitHub Release；页面也不链接 Release（扩展发布 spec §7、§9）
  expect(main.textContent).not.toContain(EXTENSION_RELEASE.sha256)
  expect(hrefs.some((href) => href.includes('/releases'))).toBe(false)
  expect(container.querySelector('pre, .extension-command')).toBeNull()
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
    const download = screen.getByRole('link', { name: isDownloadName })
    expect(download).toBe(forge[0])
    expect(download.className).toBe('pt-forge-btn extension-download')
    expect(download.querySelector('.extension-download__meta')?.textContent).toBe(
      `（v${EXTENSION_RELEASE.version}，zip，${formatSize(EXTENSION_RELEASE.bytes)}）`,
    )
    expect(hero.contains(download)).toBe(true)
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
    expect(note.textContent).toBe('适用于电脑上的 Chrome。')
    expect(note.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    const legal = copy.querySelector('.extension-intro__legal') as HTMLElement
    expect(legal.textContent).toBe(FULL_DISCLAIMER)
    expect(note.querySelectorAll(FOCUSABLE)).toHaveLength(0)
    expect(legal.querySelectorAll(FOCUSABLE)).toHaveLength(0)
  })

  it('导语末段是一个文本节点：空格与“的英文界面……”拆成两个节点时，390 下 balance 会改在“Craft of Exile / 的”断行（spec §6.7，以 M0 为准）', () => {
    const { container } = render(<ExtensionPage />)
    const lead = container.querySelector('.extension-intro__lead') as HTMLElement
    expect(lead.textContent).toBe(
      '用 PoE2 中文助手，在 Craft of Exile 的英文界面查看国服简体术语。',
    )
    expect(lead.lastChild?.nodeName).toBe('#text')
    expect(lead.lastChild?.textContent).toBe(' 的英文界面查看国服简体术语。')
  })

  it('环境卡是带标题栏与 chip 的 pt-panel card（不是框中框），内容沿用现有文案', () => {
    const { container } = render(<ExtensionPage />)
    const env = container.querySelector('aside[aria-label="版本与支持范围"]') as HTMLElement
    expect(env.className).toBe('pt-panel pt-panel--card pt-panel--titled extension-env')
    expect(env.closest('.pt-frame')?.classList.contains('extension-intro')).toBe(true)
    const bar = env.querySelector('.pt-titlebar') as HTMLElement
    expect(within(bar).getByRole('heading', { level: 2 }).textContent).toBe('先确认你的使用环境')
    expect(bar.querySelector('.pt-chip')?.textContent).toBe(`v${EXTENSION_RELEASE.version}`)
    expect(env.querySelector('.pt-panel__body > .pt-chip--body')?.textContent).toBe(
      `v${EXTENSION_RELEASE.version}`,
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
      '安装',
      '确认翻译生效',
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

  it('环境卡说明不沿用 base.css 的 text-wrap: pretty，390 下按 M0 断在“翻译所有 / 英文段落”（spec §6.7 R15）', () => {
    expect(decls('.extension-env__note').get('text-wrap')).toBe('wrap')
  })

  it('安装区说明保持普通折行，不沿用 base.css 的 text-wrap: pretty（spec §6.7）', () => {
    expect(decls('.extension-guide__heading p').get('text-wrap')).toBe('wrap')
  })

  it('下载按钮：≥621px 一行且无间隙；≤620px 版本与大小换到第二行、字号 12px（扩展发布 spec §9）', () => {
    expect(decls('.extension-download').get('gap')).toBe('0')
    const narrow = decls('.extension-actions .extension-download', NARROW)
    expect(narrow.get('flex-direction')).toBe('column')
    expect(narrow.get('height')).toBe('auto')
    expect(narrow.get('min-height')).toBe('46px')
    expect(decls('.extension-download__meta', NARROW).get('font-size')).toBe('12px')
    expect(bare).not.toMatch(/\.extension-command/)
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

  it('V11：环境卡容器宽 <500px 时标题栏内边距 20px、chip 移入卡体', () => {
    const narrowCard = ['width < 500px']
    expect(decls('.extension-env > .pt-titlebar', narrowCard).get('padding')).toBe('0 20px')
    expect(decls('.extension-env > .pt-titlebar > .pt-chip', narrowCard).get('display')).toBe(
      'none',
    )
    expect(decls('.extension-env .pt-chip.pt-chip--body', narrowCard).get('display')).toBe('flex')
  })
})
