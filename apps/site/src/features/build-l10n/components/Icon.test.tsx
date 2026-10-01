import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ICON_NAMES, Icon } from '../../../shared/components/Icon'
import { fsPathFromMetaUrl } from '../../../shared/testing/fsPath'

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

// ---- M3：零引用纪律（Icon.tsx 头注释；M1 终审 T14-1，契约 C13 v4）----
describe('Icon 名单', () => {
  it('每个图标名在站点非测试源码里都有调用方（按 <Icon name> 里的字面量核对）', () => {
    // 本文件在 apps/site/src/features/build-l10n/components/，往上三级是 apps/site/src
    const src = resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../..')
    const code = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .map((rel) => rel.split(sep).join('/'))
      .filter(
        (rel) =>
          /\.tsx?$/.test(rel) && !rel.includes('.test.') && rel !== 'shared/components/Icon.tsx',
      )
      .map((rel) => readFileSync(join(src, rel), 'utf8'))
      .join('\n')
    // 只认 <Icon …> 的 name 属性（name="x" 或 name={…} 里的字符串字面量）：整份源码粗查时，
    // addEventListener('drop') 这类同名字面量会让已无调用方的图标名照样通过
    const used = new Set<string>()
    for (const [, attr = ''] of code.matchAll(/<Icon\b[^>]*?\bname=(\{[^}]*\}|"[^"]*")/g))
      for (const [, name = ''] of attr.matchAll(/['"]([\w-]+)['"]/g)) used.add(name)
    const unused = ICON_NAMES.filter((name) => !used.has(name))
    expect(unused).toEqual([])
  })
})
