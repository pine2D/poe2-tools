import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceFile, TranslateResult } from '../translate/runTranslation'
import type { MeterCell } from './CoverageMeter'
import { FileList } from './FileList'

afterEach(() => {
  cleanup()
})

const sources: SourceFile[] = [
  { id: 'a', name: 'a.build', text: '{}' },
  { id: 'b', name: 'b.build', text: 'x' },
]
// 只用到 id / name / ok / error / file.rate，其余字段不参与渲染
const results = [
  { ok: true, id: 'a', name: 'a.build', file: { rate: 0.875 } },
  { ok: false, id: 'b', name: 'b.build', error: '不是合法 JSON' },
] as unknown as TranslateResult[]

const noop = {
  meters: new Map<string, MeterCell[]>(),
  onSelect: vi.fn(),
  onRemove: vi.fn(),
  onDownload: vi.fn(),
  onJump: vi.fn(),
}

describe('FileList', () => {
  it('两行式：首行文件名与覆盖率，次行下载与移除', () => {
    const { container } = render(
      <FileList sources={sources} results={results} selectedId="a" {...noop} />,
    )
    expect(screen.getByRole('button', { name: 'a.build' })).toBeDefined()
    expect(screen.getByText('88%')).toBeDefined()
    expect(container.querySelectorAll('.filelist__top')).toHaveLength(2)
    expect(container.querySelectorAll('.filelist__ops')).toHaveLength(2)
  })

  it('列表本身有可访问名，主区的其它 <ul> 不会跟它混', () => {
    render(<FileList sources={sources} results={results} selectedId="a" {...noop} />)
    expect(screen.getByRole('list', { name: '已导入文件' })).toBeDefined()
  })

  it('下载与移除靠显式 class 选中，不靠 aria-label 前缀', () => {
    const { container } = render(
      <FileList sources={sources} results={results} selectedId="a" {...noop} />,
    )
    const download = container.querySelector('.filelist__download')
    const remove = container.querySelector('.filelist__remove')
    expect(download?.getAttribute('aria-label')).toBe('下载 a.build')
    expect(remove?.getAttribute('aria-label')).toBe('移除 a.build')
    // 主 CTA 样式也靠 class：下载是 cta，移除不是
    expect(download?.className).toContain('cta')
    expect(remove?.className).not.toContain('cta')
  })

  it('解析失败的行：状态图标是警告、覆盖率位置写"解析失败"、下载禁用', () => {
    const { container } = render(
      <FileList sources={sources} results={results} selectedId="a" {...noop} />,
    )
    expect(screen.getByText('解析失败')).toBeDefined()
    expect(screen.getByText('不是合法 JSON')).toBeDefined()
    const buttons = container.querySelectorAll('.filelist__download')
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true)
    expect(container.querySelectorAll('.filelist__status--error')).toHaveLength(1)
    expect(container.querySelectorAll('.filelist__status--ok')).toHaveLength(1)
  })

  it('词典没就绪时按 sources 照常渲染，状态是 pending', () => {
    const { container } = render(
      <FileList sources={sources} results={[]} selectedId={null} {...noop} />,
    )
    expect(screen.getAllByText('待词典就绪')).toHaveLength(2)
    expect(container.querySelectorAll('.filelist__status--pending')).toHaveLength(2)
  })

  it('点击文件名选中、点击移除回调', () => {
    const onSelect = vi.fn()
    const onRemove = vi.fn()
    render(
      <FileList
        sources={sources}
        results={results}
        selectedId={null}
        meters={new Map()}
        onSelect={onSelect}
        onRemove={onRemove}
        onDownload={vi.fn()}
        onJump={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'a.build' }))
    expect(onSelect).toHaveBeenCalledWith('a')
    fireEvent.click(screen.getByLabelText('移除 b.build'))
    expect(onRemove).toHaveBeenCalledWith('b')
  })

  it('次行有迷你覆盖率轨，点缺口把文件 id 与目标行一起交回去', () => {
    const onJump = vi.fn()
    const meters = new Map<string, MeterCell[]>([
      [
        'a',
        [
          { domId: 'line-a-0', where: '主手 · 第 1 行', hit: true },
          { domId: 'line-a-1', where: '主手 · 第 2 行', hit: false },
        ],
      ],
    ])
    const { container } = render(
      <FileList
        sources={sources}
        results={results}
        selectedId="a"
        meters={meters}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onDownload={vi.fn()}
        onJump={onJump}
      />,
    )
    expect(container.querySelectorAll('.meter--sm')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '跳到未命中：主手 · 第 2 行' }))
    expect(onJump).toHaveBeenCalledWith('a', 'line-a-1')
  })
})
