import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Series } from '../stages/stages'
import type { SourceFile, TranslateResult } from '../translate/runTranslation'
import { FileList } from './FileList'
import { fileGroups } from './fileGroups'

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

// B4-15：左列按构筑分组、组内按看板阶段顺序列文件；单文件构筑也成组，解析失败的文件放在最后一组
describe('FileList 按构筑分组（B4-15）', () => {
  const src = (id: string, name = `${id}.build`): SourceFile => ({ id, name, text: '{}' })
  const okResult = (id: string, name: string | null) => ({
    ok: true,
    id,
    name: `${id}.build`,
    file: {
      id,
      name: `${id}.build`,
      input: { name },
      report: { modTranslated: 1, modCandidates: 1 },
    },
  })
  const groupSources = [src('s3'), src('x'), src('s1'), src('bad'), src('s2')]
  const groupResults = [
    okResult('s3', '终局 - Fire Witch'),
    okResult('x', 'Single Build'),
    okResult('s1', 'Act 1 - Fire Witch'),
    { ok: false, id: 'bad', name: 'bad.build', error: '不是合法 JSON' },
    okResult('s2', 'Act 3 - Fire Witch'),
  ] as unknown as TranslateResult[]
  const fakeSeries = (key: string, title: string, stages: [string, string][]): Series =>
    ({
      key,
      title,
      author: null,
      order: 'passives',
      separated: false,
      stages: stages.map(([id, label]) => ({ file: { id, name: `${id}.build` }, label })),
    }) as unknown as Series
  const seriesList = [
    fakeSeries('A', 'Fire Witch', [
      ['s1', 'Act 1'],
      ['s2', 'Act 3'],
      ['s3', '终局'],
    ]),
    fakeSeries('B', 'Single Build', [['x', 'Single Build']]),
  ]

  it('fileGroups：组序与组内顺序取看板的 seriesList，失败文件按导入顺序排在最后；词典未就绪时不分组', () => {
    const groups = fileGroups(groupSources, groupResults, seriesList)
    expect(
      groups?.map((group) => [group.kind, group.title, group.items.map((item) => item.source.id)]),
    ).toEqual([
      ['series', 'Fire Witch', ['s1', 's2', 's3']],
      ['series', 'Single Build', ['x']],
      ['failed', '无法解析', ['bad']],
    ])
    expect(groups?.[0]?.items.map((item) => item.stage)).toEqual(['Act 1', 'Act 3', '终局'])
    expect(fileGroups(groupSources, [], [])).toBeNull()
  })

  function renderGroups(props: {
    selectedId?: string | null
    stages?: boolean
    currentKey?: string
  }) {
    const groups = fileGroups(groupSources, groupResults, seriesList)
    render(
      <FileList
        sources={groupSources}
        results={groupResults}
        misses={new Map()}
        selectedId={props.selectedId ?? null}
        stages={props.stages}
        groups={groups}
        currentKey={props.currentKey}
        {...noop}
      />,
    )
  }

  it('组标题是构筑名（用户文本、无衬线标记），写明阶段数；组内显示阶段名与文件名', () => {
    renderGroups({ selectedId: 'x' })
    const all = screen.getByRole('list', { name: '已导入文件' })
    expect(all.className).toBe('app__groups')
    const fire = screen.getByRole('list', { name: 'Fire Witch 3 个阶段' })
    expect(
      within(fire)
        .getAllByRole('button')
        .filter((button) => button.className === 'pt-file__pick')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Act 1 - Fire Witch，s1.build',
      'Act 3 - Fire Witch，s2.build',
      '终局 - Fire Witch，s3.build',
    ])
    expect(within(fire).getByText('Act 1').className).toBe('pt-file__name')
    expect(screen.getByText('Fire Witch').hasAttribute('data-user-text')).toBe(true)
    expect(screen.getByText('Fire Witch').getAttribute('title')).toBe('Fire Witch')
    const single = screen.getByRole('list', { name: 'Single Build 1 个文件' })
    expect(
      within(single)
        .getByRole('button', { name: 'Single Build，x.build' })
        .getAttribute('aria-current'),
    ).toBe('true')
    const failed = screen.getByRole('list', { name: '无法解析 1 个文件 · 不导出' })
    expect(within(failed).getByText('解析失败')).toBeDefined()
    expect(within(failed).getByText('不是合法 JSON').className).toBe('app__file-error')
    expect(screen.getByText('无法解析').hasAttribute('data-user-text')).toBe(false)
    // WCAG 2.5.3：可访问名称包含可见文字
    for (const pick of document.querySelectorAll('.pt-file__pick')) {
      const visible = [...pick.querySelectorAll('span')].map((span) => span.textContent ?? '')
      for (const text of new Set(visible)) expect(pick.getAttribute('aria-label')).toContain(text)
    }
  })

  it('看板展示多个阶段时不标单份当前项，只给当前构筑组加标记；只有该组的文件提示进入逐项核对', () => {
    renderGroups({ selectedId: 's1', stages: true, currentKey: 'A' })
    const all = screen.getByRole('list', { name: '已导入文件' })
    expect(all.querySelector('[aria-current]')).toBeNull()
    const current = [...all.querySelectorAll('.app__group[data-current="true"]')]
    expect(current).toHaveLength(1)
    expect(current[0]?.textContent).toContain('Fire Witch')
    expect(screen.getByRole('button', { name: 'Act 1 - Fire Witch，s1.build' }).title).toMatch(
      /^逐项核对 /,
    )
    expect(screen.getByRole('button', { name: 'Single Build，x.build' }).title).not.toMatch(
      /^逐项核对 /,
    )
  })
})
