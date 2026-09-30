import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PtNameplate } from './PtNameplate'

afterEach(cleanup)

describe('PtNameplate', () => {
  it('四个变体各自的类名；名称元素带 data-user-text 与 lang；顶边扣是 aria-hidden 的母题', () => {
    for (const variant of ['base', 'unique', 'gem', 'collapsed'] as const) {
      const { container, unmount } = render(
        <PtNameplate
          variant={variant}
          nameAttrs={{ lang: 'zh-CN' }}
          name="耐火长杖"
          en="Pyrophyte Staff"
        />,
      )
      expect(container.querySelector('header')?.className).toBe(
        `pt-nameplate pt-nameplate--${variant}`,
      )
      const name = container.querySelector('.pt-nameplate__name')
      expect(name?.tagName).toBe('H3')
      expect(name?.hasAttribute('data-user-text')).toBe(true)
      expect(name?.getAttribute('lang')).toBe('zh-CN')
      const clasp = container.querySelector('.pt-nameplate__clasp')
      expect(clasp?.className).toBe('pt-motif pt-motif--clasp pt-nameplate__clasp')
      expect(clasp?.getAttribute('aria-hidden')).toBe('true')
      unmount()
    }
  })

  it('英文名是 lang="en" 的 Cinzel 元素；en 为 null（英文回退）时不渲染', () => {
    const { container, rerender } = render(
      <PtNameplate variant="base" nameAttrs={{ lang: 'zh-CN' }} name="红玉戒指" en="Ruby Ring" />,
    )
    expect(screen.getByText('Ruby Ring').className).toBe('pt-nameplate__en')
    expect(screen.getByText('Ruby Ring').getAttribute('lang')).toBe('en')
    rerender(<PtNameplate variant="base" nameAttrs={{ lang: 'en' }} name="Any Charm" en={null} />)
    expect(container.querySelector('.pt-nameplate__en')).toBeNull()
    expect(screen.getAllByText('Any Charm')).toHaveLength(1)
  })

  it('未收录标记紧跟名称，aria-hidden 并带警示图标', () => {
    const { container } = render(
      <PtNameplate
        variant="base"
        nameAttrs={{ lang: 'en', title: '基底名：写入译文首行' }}
        name={
          <span id="line-x-0" tabIndex={-1} role="note" aria-label="基底名未收录">
            Any Charm
          </span>
        }
        en={null}
        miss="基底名未收录"
      />,
    )
    const row = container.querySelector('.pt-nameplate__row1')
    expect(row?.children[0]?.className).toBe('pt-nameplate__name')
    const mark = row?.children[1]
    expect(mark?.className).toBe('pt-nameplate__miss')
    expect(mark?.getAttribute('aria-hidden')).toBe('true')
    expect(mark?.textContent).toBe('基底名未收录')
    expect(mark?.querySelector('svg')).not.toBeNull()
    expect(screen.getByLabelText('基底名未收录').id).toBe('line-x-0')
    expect(container.querySelector('.pt-nameplate__name')?.getAttribute('title')).toBe(
      '基底名：写入译文首行',
    )
  })

  it('第二行：组内与组间的点由组件插入，组间点在前一组末尾；空组与空项省略', () => {
    const { container } = render(
      <PtNameplate
        variant="unique"
        nameAttrs={{ lang: 'zh-CN' }}
        name="稳步印记"
        en="Surefooted Sigil"
        meta={[
          [<span key="type">传奇</span>, <span key="slot">腰带</span>],
          [],
          [<span key="level">适用等级 1–100</span>, null, <span key="count">3/3</span>],
        ]}
      />,
    )
    const groups = container.querySelectorAll('.pt-nameplate__group')
    expect(groups).toHaveLength(2)
    expect(groups[0]?.textContent).toBe('传奇·腰带·')
    expect(groups[0]?.lastElementChild?.className).toBe('pt-nameplate__dot')
    expect(groups[1]?.textContent).toBe('适用等级 1–100·3/3')
    for (const dot of container.querySelectorAll('.pt-nameplate__dot')) {
      expect(dot.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('没有第二行内容时不渲染 meta；shut 加 pt-nameplate--shut', () => {
    const { container } = render(
      <PtNameplate
        variant="gem"
        shut
        nameAttrs={{ lang: 'zh-CN' }}
        name="火焰风暴"
        en="Firestorm"
        meta={[[], []]}
      />,
    )
    expect(container.querySelector('.pt-nameplate__meta')).toBeNull()
    expect(container.querySelector('header')?.className).toBe(
      'pt-nameplate pt-nameplate--gem pt-nameplate--shut',
    )
  })

  it('提示框形态：没有 row1 与 meta，名称、英文名、标记直接是子元素', () => {
    const { container } = render(
      <PtNameplate
        variant="unique"
        tooltip
        nameAttrs={{ lang: 'zh-CN', id: 'line-inventory-slots-1-unique-name', tabIndex: -1 }}
        name="稳步印记"
        en="Surefooted Sigil"
        meta={[[<span key="x">不渲染</span>]]}
      />,
    )
    const plate = container.querySelector('header')
    expect(plate?.className).toBe('pt-nameplate pt-nameplate--unique pt-nameplate--tooltip')
    expect(container.querySelector('.pt-nameplate__row1')).toBeNull()
    expect(container.querySelector('.pt-nameplate__meta')).toBeNull()
    expect(screen.queryByText('不渲染')).toBeNull()
    expect([...(plate?.children ?? [])].map((node) => node.className)).toEqual([
      'pt-motif pt-motif--clasp pt-nameplate__clasp',
      'pt-nameplate__name',
      'pt-nameplate__en',
    ])
  })

  it('nameAs 与 nameAttrs 的 id、tabIndex 落在名称元素上', () => {
    render(
      <PtNameplate
        variant="base"
        nameAs="h4"
        nameAttrs={{ lang: 'zh-TW', id: 'line-inventory-slots-0-additional-text-0', tabIndex: -1 }}
        name="耐火長杖"
        en="Pyrophyte Staff"
      />,
    )
    const name = screen.getByRole('heading', { level: 4 })
    expect(name.id).toBe('line-inventory-slots-0-additional-text-0')
    expect(name.getAttribute('tabindex')).toBe('-1')
    expect(name.getAttribute('lang')).toBe('zh-TW')
  })
})
