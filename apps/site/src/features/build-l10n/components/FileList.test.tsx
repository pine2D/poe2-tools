import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceFile, TranslateResult } from '../translate/runTranslation'
import { FileList } from './FileList'

afterEach(cleanup)
const sources: SourceFile[] = [
  { id: 'a', name: 'a.build', text: '{}' },
  { id: 'b', name: 'b.build', text: 'x' },
]
const results = [
  {
    ok: true,
    id: 'a',
    name: 'a.build',
    file: { input: { name: '开荒构筑' }, report: { modTranslated: 7, modCandidates: 8 } },
  },
  { ok: false, id: 'b', name: 'b.build', error: '不是合法 JSON' },
] as unknown as TranslateResult[]
const noop = { onSelect: vi.fn(), onRemove: vi.fn() }

describe('FileList', () => {
  it('构筑名为主、文件名为辅，状态同时用文字表达', () => {
    render(<FileList sources={sources} results={results} selectedId="a" {...noop} />)
    expect(screen.getByRole('list', { name: '已导入文件' })).toBeDefined()
    expect(screen.getByText('开荒构筑')).toBeDefined()
    expect(screen.getByText('词缀 7/8')).toBeDefined()
    expect(screen.getByText('解析失败')).toBeDefined()
    expect(screen.getByText('不是合法 JSON')).toBeDefined()
    expect(screen.getByRole('button', { name: 'a.build' }).getAttribute('aria-current')).toBe(
      'true',
    )
  })
  it('等待词典时文件仍可选和移除', () => {
    const onSelect = vi.fn()
    const onRemove = vi.fn()
    render(
      <FileList
        sources={sources}
        results={[]}
        selectedId={null}
        onSelect={onSelect}
        onRemove={onRemove}
      />,
    )
    expect(screen.getAllByText('待词典就绪')).toHaveLength(2)
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
