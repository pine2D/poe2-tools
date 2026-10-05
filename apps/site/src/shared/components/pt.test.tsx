import { cleanup, render } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Motif } from './Motif'
import { PtDivider } from './PtDivider'
import { PtForgeButton } from './PtForgeButton'
import { PtFrame } from './PtFrame'
import { PtPanel } from './PtPanel'
import { PtTitlebar } from './PtTitlebar'

afterEach(cleanup)

describe('Motif 与 PtDivider（spec §4.5、§5.9）', () => {
  it('Motif 是 aria-hidden 的空 span，类名按符号拼接', () => {
    const { container } = render(<Motif symbol="clasp" className="pt-nameplate__clasp" />)
    const span = container.firstElementChild
    expect(span?.tagName).toBe('SPAN')
    expect(span?.getAttribute('class')).toBe('pt-motif pt-motif--clasp pt-nameplate__clasp')
    expect(span?.getAttribute('aria-hidden')).toBe('true')
    expect(span?.childNodes).toHaveLength(0)
  })

  it('PtDivider 三种写法，中心是 knot', () => {
    const { container } = render(
      <>
        <PtDivider />
        <PtDivider variant="hero" />
        <PtDivider variant="indent" className="x" />
      </>,
    )
    const dividers = [...container.children]
    expect(dividers.map((el) => el.getAttribute('class'))).toEqual([
      'pt-divider',
      'pt-divider pt-divider--hero',
      'pt-divider pt-divider--indent x',
    ])
    for (const el of dividers) {
      expect(el.getAttribute('aria-hidden')).toBe('true')
      expect(el.innerHTML).toBe('<span class="pt-motif pt-motif--knot" aria-hidden="true"></span>')
    }
  })
})

describe('PtTitlebar（spec §5.3）', () => {
  it('默认 h2；chip 在标题之后；没有 chip 时不渲染', () => {
    const { container } = render(<PtTitlebar title="构筑汉化" chip="网页工具" />)
    const header = container.querySelector('header.pt-titlebar')
    expect(header?.innerHTML).toBe(
      '<h2 class="pt-titlebar__title">构筑汉化</h2><span class="pt-chip">网页工具</span>',
    )
    cleanup()
    const plain = render(<PtTitlebar title="文件" as="p" id="t" />).container
    expect(plain.querySelector('.pt-titlebar')?.innerHTML).toBe(
      '<p class="pt-titlebar__title" id="t">文件</p>',
    )
  })

  it('来自用户文件的长标题：title 属性给全文，带 data-user-text', () => {
    const full = '烈焰爆破法师 · 开荒到终局 · 一个很长很长的构筑名'
    const { container } = render(<PtTitlebar title={full} fullText={full} userText />)
    const title = container.querySelector('.pt-titlebar__title')
    expect(title?.getAttribute('title')).toBe(full)
    expect(title?.hasAttribute('data-user-text')).toBe(true)
  })
})

describe('PtFrame（spec §5.3）', () => {
  it('没有标题栏：内容直接放在框里；默认 section、main 变体没有修饰类', () => {
    const { container } = render(
      <PtFrame variant="hero" className="home-frame" aria-label="主区">
        <p>hero</p>
      </PtFrame>,
    )
    const frame = container.firstElementChild
    expect(frame?.tagName).toBe('SECTION')
    expect(frame?.getAttribute('class')).toBe('pt-frame pt-frame--hero home-frame')
    expect(frame?.getAttribute('aria-label')).toBe('主区')
    expect(frame?.innerHTML).toBe('<p>hero</p>')
    cleanup()
    const main = render(<PtFrame as="div">x</PtFrame>).container.firstElementChild
    expect(main?.tagName).toBe('DIV')
    expect(main?.getAttribute('class')).toBe('pt-frame')
  })

  it('有标题栏：标题栏 + body；有 chip 时 body 开头另放 .pt-chip--body；ref 指向框', () => {
    const ref = createRef<HTMLElement>()
    const { container } = render(
      <PtFrame
        ref={ref}
        variant="side"
        titlebar={{ title: '文件', chip: '1 份' }}
        bodyClassName="side-body"
      >
        <p>列表</p>
      </PtFrame>,
    )
    const frame = container.firstElementChild
    expect(ref.current).toBe(frame)
    expect(frame?.getAttribute('class')).toBe('pt-frame pt-frame--side')
    expect([...(frame?.children ?? [])].map((el) => el.getAttribute('class'))).toEqual([
      'pt-titlebar',
      'pt-frame__body side-body',
    ])
    expect(frame?.querySelector('.pt-frame__body')?.innerHTML).toBe(
      '<span class="pt-chip pt-chip--body">1 份</span><p>列表</p>',
    )
  })
})

describe('PtPanel（spec §5.4）', () => {
  it('三个变体；edge 只对 item 生效；带标题栏时加 pt-panel--titled 与 body', () => {
    const { container } = render(
      <>
        <PtPanel variant="card">a</PtPanel>
        <PtPanel variant="item" edge="unique" as="article">
          b
        </PtPanel>
        <PtPanel variant="inset" edge="gem" as="figure">
          c
        </PtPanel>
        <PtPanel variant="card" titlebar={{ title: '构筑汉化', chip: '网页工具' }}>
          d
        </PtPanel>
      </>,
    )
    const [card, item, inset, titled] = [...container.children]
    expect(card?.getAttribute('class')).toBe('pt-panel pt-panel--card')
    expect(item?.tagName).toBe('ARTICLE')
    expect(item?.getAttribute('class')).toBe('pt-panel pt-panel--item pt-panel--unique')
    expect(inset?.tagName).toBe('FIGURE')
    expect(inset?.getAttribute('class')).toBe('pt-panel pt-panel--inset')
    expect(titled?.getAttribute('class')).toBe('pt-panel pt-panel--card pt-panel--titled')
    expect(titled?.querySelector('.pt-panel__body')?.innerHTML).toBe(
      '<span class="pt-chip pt-chip--body">网页工具</span>d',
    )
  })
})

describe('PtForgeButton（spec §5.5）', () => {
  it('缺省是 type=button 的 button，两端各一颗 gem', () => {
    const { container } = render(<PtForgeButton>下载中文 .build</PtForgeButton>)
    const button = container.querySelector('button')
    expect(button?.getAttribute('type')).toBe('button')
    expect(button?.getAttribute('class')).toBe('pt-forge-btn')
    const gems = button?.querySelectorAll('.pt-motif--gem') ?? []
    expect([...gems].map((gem) => gem.getAttribute('class'))).toEqual([
      'pt-motif pt-motif--gem pt-forge-btn__cap pt-forge-btn__cap--l',
      'pt-motif pt-motif--gem pt-forge-btn__cap pt-forge-btn__cap--r',
    ])
    expect(button?.textContent).toBe('下载中文 .build')
  })

  it('a 形态：href 原样，两端 gem 夹文字', () => {
    const { container } = render(
      <PtForgeButton as="a" href="/build/">
        打开构筑汉化
      </PtForgeButton>,
    )
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/build/')
    expect(link?.getAttribute('class')).toBe('pt-forge-btn')
    expect(link?.children.length).toBe(2)
    expect(link?.textContent).toBe('打开构筑汉化')
    expect(link?.querySelectorAll('.pt-motif--gem').length).toBe(2)
    expect(link?.querySelector('.pt-forge-btn__cap--l')).toBe(link?.firstElementChild)
    expect(link?.querySelector('.pt-forge-btn__cap--r')).toBe(link?.lastElementChild)
  })

  it('label 形态指向文件输入', () => {
    const { container } = render(
      <PtForgeButton as="label" htmlFor="file-input" className="x">
        选择 .build 文件
      </PtForgeButton>,
    )
    const label = container.querySelector('label')
    expect(label?.getAttribute('for')).toBe('file-input')
    expect(label?.getAttribute('class')).toBe('pt-forge-btn x')
  })
})
