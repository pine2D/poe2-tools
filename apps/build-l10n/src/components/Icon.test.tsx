import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ICON_NAMES, Icon } from './Icon'

afterEach(() => {
  cleanup()
})

describe('Icon', () => {
  it('默认是装饰性图标：aria-hidden，没有可访问名', () => {
    const { container } = render(<Icon name="download" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.getAttribute('role')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('给了 title 就成为有名字的图片', () => {
    render(<Icon name="warning" title="解析失败" />)
    const img = screen.getByRole('img', { name: '解析失败' })
    expect(img.getAttribute('aria-hidden')).toBeNull()
  })

  it('尺寸与类名可控，默认 16px 且带 icon 基类', () => {
    const { container } = render(<Icon name="check" className="filelist__status" size={20} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('20')
    expect(svg?.getAttribute('height')).toBe('20')
    expect(svg?.getAttribute('class')).toBe('icon filelist__status')
    cleanup()
    const plain = render(<Icon name="check" />).container.querySelector('svg')
    expect(plain?.getAttribute('width')).toBe('16')
    expect(plain?.getAttribute('class')).toBe('icon')
  })

  it('每个图标名都画得出至少一条 path，且不含 fill 实色', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />)
      const svg = container.querySelector('svg')
      expect(svg?.querySelectorAll('path').length ?? 0).toBeGreaterThan(0)
      expect(svg?.getAttribute('fill')).toBe('none')
      expect(svg?.getAttribute('stroke')).toBe('currentColor')
      unmount()
    }
  })
})
