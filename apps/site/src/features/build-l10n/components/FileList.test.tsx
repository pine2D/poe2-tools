import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceFile, TranslateResult } from '../translate/runTranslation'
import { FileList } from './FileList'

afterEach(cleanup)
const sources: SourceFile[] = [
  { id: 'a', name: 'a.build', text: '{}' },
  { id: 'b', name: 'b.build', text: 'x' },
  { id: 'c', name: 'c.build', text: '{}' },
]
const results = [
  {
    ok: true,
    id: 'a',
    name: 'a.build',
    file: { input: { name: '开荒构筑' }, report: { modTranslated: 7, modCandidates: 8 } },
  },
  { ok: false, id: 'b', name: 'b.build', error: '不是合法 JSON' },
  {
    ok: true,
    id: 'c',
    name: 'c.build',
    file: { input: { name: '终局构筑' }, report: { modTranslated: 8, modCandidates: 8 } },
  },
] as unknown as TranslateResult[]
const misses = new Map([
  ['a', 2],
  ['c', 0],
])
const noop = { onSelect: vi.fn(), onRemove: vi.fn() }

describe('FileList（spec §5.12 文件项）', () => {
  it('构筑名为主、文件名为辅；有待核对项显示“⚠ 待核对 n”，否则“✓ 词缀 x/y”（B1）', () => {
    render(
      <FileList sources={sources} results={results} misses={misses} selectedId="a" {...noop} />,
    )
    expect(screen.getByRole('list', { name: '已导入文件' }).className).toBe('app__files')
    expect(screen.getByText('开荒构筑').className).toBe('pt-file__name')
    expect(screen.getByText('a.build').className).toBe('pt-file__orig')
    const warn = screen.getByText('待核对 2')
    expect(warn.className).toBe('pt-file__warn')
    expect(warn.querySelector('svg')).not.toBeNull()
    expect(screen.queryByText('词缀 7/8')).toBeNull()
    const ok = screen.getByText('词缀 8/8')
    expect(ok.className).toBe('pt-file__ok')
    expect(screen.getByText('解析失败')).toBeDefined()
    expect(screen.getByText('不是合法 JSON').className).toBe('app__file-error')
  })

  it('当前项的 aria-current 挂在项内的选择按钮上，不挪到列表项（R6）', () => {
    render(
      <FileList sources={sources} results={results} misses={misses} selectedId="a" {...noop} />,
    )
    const pick = screen.getByRole('button', { name: '开荒构筑，a.build' })
    expect(pick.className).toBe('pt-file__pick')
    expect(pick.getAttribute('aria-current')).toBe('true')
    expect(pick.closest('li')?.className).toBe('pt-file')
    expect(pick.closest('li')?.hasAttribute('aria-current')).toBe(false)
    expect(
      screen.getByRole('button', { name: '终局构筑，c.build' }).hasAttribute('aria-current'),
    ).toBe(false)
    const remove = screen.getByRole('button', { name: '移除 a.build' })
    expect(remove.className).toBe('pt-file__remove')
    // 图标与 M0 的 .pt-icon 同为 18px（M2 Ruling 13）
    expect(remove.querySelector('svg')?.getAttribute('width')).toBe('18')
  })

  // WCAG 2.5.3：可见文字是“构筑名 + 文件名”，可访问名称须包含并以构筑名开头；没有构筑名时只有文件名
  it('选择按钮的可访问名称包含可见的构筑名与文件名（B4-05）', () => {
    render(
      <FileList sources={sources} results={results} misses={misses} selectedId="a" {...noop} />,
    )
    const names = screen
      .getAllByRole('button')
      .filter((button) => button.className === 'pt-file__pick')
      .map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual(['开荒构筑，a.build', 'b.build', '终局构筑，c.build'])
    for (const pick of document.querySelectorAll('.pt-file__pick')) {
      const visible = [...pick.querySelectorAll('span')].map((span) => span.textContent ?? '')
      for (const text of new Set(visible)) expect(pick.getAttribute('aria-label')).toContain(text)
    }
  })

  it('等待词典时文件仍可选和移除', () => {
    const onSelect = vi.fn()
    const onRemove = vi.fn()
    render(
      <FileList
        sources={sources}
        results={[]}
        misses={new Map()}
        selectedId={null}
        onSelect={onSelect}
        onRemove={onRemove}
      />,
    )
    expect(screen.getAllByText('待词典就绪')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'a.build' }))
    fireEvent.click(screen.getByRole('button', { name: '移除 b.build' }))
    expect(onSelect).toHaveBeenCalledWith('a')
    expect(onRemove).toHaveBeenCalledWith('b')
  })

  it('同名输入可明确区分，操作绑定各自身份', () => {
    const onSelect = vi.fn()
    const duplicates = sources.map((source) => ({ ...source, name: 'same.build' }))
    render(
      <FileList
        sources={duplicates}
        results={[]}
        misses={new Map()}
        selectedId={null}
        {...noop}
        onSelect={onSelect}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'same.build（第 2 份）' }))
    expect(onSelect).toHaveBeenCalledWith('b')
    expect(screen.getByRole('button', { name: '移除 same.build（第 1 份）' })).toBeDefined()
  })
})
