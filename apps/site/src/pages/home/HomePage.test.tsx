// 首页“对照长带”（2026-10-03 方案 §3.2 按场景分流；样稿 2026-10-03-home-b，本地留存）
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { parseRules } from '../../../../../packages/ui-theme/src/testing/css'
import { L1_DEMO_CANDIDATES, L1_DEMO_LABEL } from '../../shared/l1Demo'
import { fsPathFromMetaUrl } from '../../shared/testing/fsPath'
import { HomePage } from './HomePage'

afterEach(cleanup)

const BUILD_SCENE = '我拿到了一份英文 .build'
const COE_SCENE = '我在 Craft of Exile 做装'
const BAND = '两件工具的对照示例'

describe('首页结构', () => {
  it('两个场景入口等重：同款 pt-btn，分别去构筑汉化与扩展介绍页；不推荐已搁置的工坊', () => {
    render(<HomePage />)
    const regions = [BUILD_SCENE, COE_SCENE].map((name) => screen.getByRole('region', { name }))
    const links = regions.map((region) => within(region).getByRole('link'))
    expect(
      links.map((link) => [
        link.getAttribute('class'),
        link.getAttribute('href'),
        link.textContent?.trim(),
      ]),
    ).toEqual([
      ['pt-btn', '/build/', '打开构筑汉化'],
      ['pt-btn', '/extension/', '安装中文助手'],
    ])
    // 去向箭头是 Icon arrow-right（aria-hidden 的 SVG），不用 Unicode 字形；读屏只读动作本身
    for (const link of links) {
      const icons = link.querySelectorAll('svg.icon')
      expect(icons).toHaveLength(1)
      expect(icons[0]?.getAttribute('aria-hidden')).toBe('true')
      expect(icons[0]?.querySelector('path')?.getAttribute('d')).toBe('M5 12h14')
      expect(link.textContent).not.toContain('→')
    }
    expect(screen.getByRole('link', { name: '打开构筑汉化' })).toBe(links[0])
    expect(screen.getByRole('link', { name: '安装中文助手' })).toBe(links[1])
    // 每个按钮由同一端的事实条描述
    expect(
      links.map(
        (link) => document.getElementById(link.getAttribute('aria-describedby') ?? '')?.textContent,
      ),
    ).toEqual([
      '网页工具 · 国服简体／台服繁体 · 文件只在本机处理',
      'Chrome 扩展 · CoE Beta 的 PoE2 英文界面 · 国服简体 · 本站下载',
    ])
    expect(document.querySelectorAll('.pt-forge-btn')).toHaveLength(0)
    expect(document.querySelector('a[href="/craft/"]')).toBeNull()
    expect(screen.queryByText(/开发预览|需自行构建/)).toBeNull()
  })

  it('全页只有一个 h1；两个场景标题是 h2.pt-subhead.pt-subhead--lg', () => {
    render(<HomePage />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => [heading.getAttribute('class'), heading.textContent]),
    ).toEqual([
      ['pt-subhead pt-subhead--lg', BUILD_SCENE],
      ['pt-subhead pt-subhead--lg', COE_SCENE],
    ])
  })

  it('一扇没有标题栏的 hero 框（.band）是唯一的金属重点：不嵌套框，没有标题栏和金属主按钮', () => {
    render(<HomePage />)
    const frames = document.querySelectorAll('.pt-frame')
    expect(frames).toHaveLength(1)
    const frame = frames[0]
    expect(frame?.getAttribute('class')).toBe('pt-frame pt-frame--hero band')
    expect(frame?.querySelector('.pt-frame')).toBeNull()
    expect(document.querySelectorAll('.pt-titlebar, .pt-forge-btn')).toHaveLength(0)
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.getAttribute('class')).toBe('pt-hero-title')
    expect(title.textContent).toBe('少查译名，多研究构筑。')
    expect(title.querySelector('.pt-hero-title__gold')?.textContent).toBe('多研究构筑。')
    for (const name of [BUILD_SCENE, COE_SCENE, BAND]) {
      expect(frame?.contains(screen.getByRole('region', { name }))).toBe(true)
    }
  })

  it('对照带是有名称的 inset 区域：两段都标“示例”，左段英 → 中，右段中 → 英；只做示意，没有可操作元素', () => {
    render(<HomePage />)
    const band = screen.getByRole('region', { name: BAND })
    expect(band.getAttribute('class')).toBe('pt-panel pt-panel--inset strip')
    const figures = within(band).getAllByRole('figure')
    expect(figures).toHaveLength(2)
    expect(
      figures.map(
        (figure) => figure.querySelector('figcaption.l1demo__cap > .l1demo__tag')?.textContent,
      ),
    ).toEqual(['示例', '示例'])
    expect(
      within(band).getByRole('figure', { name: /构筑汉化的阶段看板 · 示例构筑（自造）/ }),
    ).toBe(figures[0])
    expect(
      within(band).getByRole('figure', { name: /中文助手的搜索候选 · 自绘示意，不是 CoE 截图/ }),
    ).toBe(figures[1])
    const [build, coe] = figures as [HTMLElement, HTMLElement]
    expect([...build.querySelectorAll('.pt-stagehead')].map((th) => th.textContent)).toEqual([
      '31–60 级',
      '终局',
    ])
    expect(build.querySelector('.demo__spot .pt-pair__en')?.textContent).toBe('+60 to maximum Life')
    expect(build.querySelector('.demo__spot .pt-pair__zh')?.textContent).toBe('+60 生命上限')
    expect(coe.querySelector('.demo__spot')?.textContent).toBe('水晶法器→Crystal Focus')
    // 右段用共用的 l1demo__ 示意：两个搜索框都画 Icon 的 search；候选框拆成框顶、框腰、框底三段，选中项只靠类名
    expect(coe.querySelectorAll('.l1demo__field > svg.icon')).toHaveLength(2)
    // 扩展不渲染“中文输入”之类的徽记：搜索框里只有图标、查询词与光标，没有虚构控件
    expect(coe.querySelector('.l1demo__ime')).toBeNull()
    expect(coe.querySelector('.l1demo__field')?.textContent).toBe('水晶')
    // 搜索框标签是扩展生效时原站标签的译名（shared/l1Demo.ts 的 L1_DEMO_LABEL，与扩展介绍页同一常量）
    const label = coe.querySelector('.l1demo__label') as HTMLElement
    expect(label.textContent).toBe(L1_DEMO_LABEL)
    expect(label.hasAttribute('lang')).toBe(false)
    expect([...coe.querySelectorAll('.l1demo__box')].map((box) => box.className)).toEqual([
      'l1demo__box l1demo__box--top',
      'l1demo__box l1demo__box--mid',
      'l1demo__box l1demo__box--bottom',
    ])
    expect(coe.querySelector('.l1demo__opt--selected')).toBe(coe.querySelector('.demo__spot'))
    expect(
      band.querySelectorAll(
        'a, button, input, select, textarea, [tabindex], [aria-expanded], [aria-selected]',
      ),
    ).toHaveLength(0)
    expect(band.querySelector('.seam')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('阅读顺序：两组场景句与按钮在 DOM 中都排在对照带之前（≤1099px 不靠 CSS order 也先读到入口）', () => {
    render(<HomePage />)
    const all = [...document.querySelectorAll('*')]
    const band = all.indexOf(screen.getByRole('region', { name: BAND }))
    expect(band).toBeGreaterThan(-1)
    const entries = [
      ...screen.getAllByRole('heading', { level: 2 }),
      screen.getByRole('link', { name: '打开构筑汉化' }),
      screen.getByRole('link', { name: '安装中文助手' }),
    ]
    for (const element of entries) expect(all.indexOf(element)).toBeLessThan(band)
  })

  it('示例名称取自正式 zh-CN 词典：右段候选即共用的 L1_DEMO_CANDIDATES，左段格子的中英名都在 items.json 里', () => {
    render(<HomePage />)
    const [, coe] = within(screen.getByRole('region', { name: BAND })).getAllByRole('figure')
    expect(
      [...(coe?.querySelectorAll('.l1demo__opt') ?? [])].map((opt) => [
        opt.firstElementChild?.textContent,
        opt.querySelector('[lang="en"]')?.textContent,
      ]),
    ).toEqual(L1_DEMO_CANDIDATES.map(([zh, en]) => [zh, en]))
    const items = JSON.parse(
      readFileSync(
        resolve(
          dirname(fsPathFromMetaUrl(import.meta.url)),
          '../../../../../data/dict/zh-CN/items.json',
        ),
        'utf8',
      ),
    ) as { bases: Record<string, string>; uniques: Record<string, string> }
    const cells = [...document.querySelectorAll('.mini-cell')]
    expect(cells).toHaveLength(4)
    for (const cell of cells) {
      const en = cell.querySelector('.mini-cell__en [lang="en"]')?.textContent ?? ''
      expect(items.bases[en] ?? items.uniques[en], en).toBe(
        cell.querySelector('.mini-cell__zh')?.textContent,
      )
    }
  })

  it('文案：扩展能力带限定语；不再有“本次站点更新”和外链箭头“↗”', () => {
    render(<HomePage />)
    expect(screen.getByRole('region', { name: COE_SCENE }).textContent).toContain(
      '部分装备的国服文本可转成英文导入（支持范围见介绍页）。',
    )
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('本次站点更新')
    expect(text).not.toContain('↗')
    expect(document.querySelector('.home-common')?.textContent).toBe(
      '简体与繁体译名按国服、台服分别整理，不做繁简互转。',
    )
  })

  it('旧版本留下的浅色偏好不再生效：页面不写 data-theme，也没有主题控件（spec D2）', () => {
    localStorage.setItem('poe2-tools.theme', 'light')
    document.documentElement.removeAttribute('data-theme')
    render(<HomePage />)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(screen.queryByRole('combobox', { name: '界面主题' })).toBeNull()
    localStorage.removeItem('poe2-tools.theme')
  })
})

describe('home.css', () => {
  const css = readFileSync(
    resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../shared/styles/home.css'),
    'utf8',
  )
  const rules = parseRules(css)
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const at = (selector: string, prop: string, media: string): string | undefined =>
    rules
      .filter(
        (rule) =>
          rule.selectors.includes(selector) && rule.atRules.some((item) => item.includes(media)),
      )
      .map((rule) => rule.declarations.get(prop))
      .filter((value) => value !== undefined)
      .at(-1)

  it('≤1099px：两列入口在前，示例带整体移到第 4 行；全文件不用 order 调整阅读顺序', () => {
    expect(rules.some((rule) => rule.declarations.has('order'))).toBe(false)
    expect(at('.band', 'grid-template-columns', '1099px')).toBe('minmax(0, 1fr) minmax(0, 1fr)')
    expect(at('.strip', 'grid-row', '1099px')).toBe('4')
    expect(at('.entry__head', 'grid-row', '1099px')).toBe('auto')
    expect(at('.entry__act', 'grid-row', '1099px')).toBe('auto')
    expect(at('.entry__head .pt-subhead--lg', 'font-size', '1099px')).toBe('var(--fs-title)')
    expect(at('.band', 'grid-template-columns', '620px')).toBe('minmax(0, 1fr)')
  })

  it('字号与间距只用尺寸阶梯令牌；不写色值、衬线字体栈与 z-index', () => {
    const SIZE = /^(font-size|margin|padding|gap|row-gap|column-gap)(-|$)/
    for (const rule of rules) {
      for (const [prop, value] of rule.declarations) {
        if (!SIZE.test(prop)) continue
        const where = `${rule.atRules.join(' ')} ${rule.selectors.join(', ')} { ${prop}: ${value} }`
        // 列头、行头里的“+ 1px”是格子边框的补偿，属于几何值
        expect(value.replace(/\+ 1px/g, ''), where).not.toMatch(/\d(px|rem|em)\b/)
        if (prop === 'font-size') expect(value, where).toMatch(/^var\(--fs-[a-z-]+\)$/)
      }
    }
    expect(bare).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
    expect(bare).not.toMatch(/--pt-(serif|cinzel)/)
    expect(bare).not.toMatch(/z-index/)
  })
})
