import { CRAFT_RULES_VERSION, type CraftCatalog, type CraftProject } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectControls, REHEARSAL_PROJECT_KEY } from './ProjectControls'

const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '2026-09-12T00:00:00.000Z',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
  bases: [
    {
      id: 'Iron Helmet',
      name: 'Iron Helmet',
      type: 'Helmet',
      tags: ['default'],
      requirements: {},
      properties: {},
      implicit: null,
      implicitTags: [],
      sourceQuality: 20,
      socketLimit: 2,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: [],
}
const initialState = {
  baseId: 'Iron Helmet',
  itemLevel: 80,
  rarity: 'normal' as const,
  affixes: [],
  sourceText: null,
}
const project: CraftProject = {
  schemaVersion: 1,
  sourceCommit: catalog._meta.sourceCommit,
  rulesVersion: CRAFT_RULES_VERSION,
  initialState,
  operations: [],
  cursor: 0,
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ProjectControls', () => {
  it('保存并恢复本机项目，损坏内容不会调用恢复回调', () => {
    const onRestore = vi.fn()
    render(<ProjectControls catalog={catalog} project={project} onRestore={onRestore} />)
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    expect(localStorage.getItem(REHEARSAL_PROJECT_KEY)).toContain(CRAFT_RULES_VERSION)
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    expect(onRestore).toHaveBeenCalledTimes(1)

    localStorage.setItem(REHEARSAL_PROJECT_KEY, '{broken')
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    expect(onRestore).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toMatch(/损坏|JSON/)
  })

  it('没有当前项目时只提供恢复入口', () => {
    render(<ProjectControls catalog={catalog} onRestore={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '保存演练到本机' })).toBeNull()
    expect(screen.queryByRole('button', { name: '导出演练项目' })).toBeNull()
    expect(screen.getByRole('button', { name: '恢复本机演练' })).toBeDefined()
    expect(screen.getByRole('button', { name: '导入演练项目' })).toBeDefined()
  })

  it('拒绝保存超过步数限制的项目，并呈现导出异常', () => {
    const oversized: CraftProject = {
      ...project,
      operations: Array.from({ length: 1001 }, () => ({
        currency: 'transmutation' as const,
        modIds: [],
      })),
    }
    const { rerender } = render(
      <ProjectControls catalog={catalog} project={oversized} onRestore={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    expect(localStorage.getItem(REHEARSAL_PROJECT_KEY)).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/1000|过多/)

    rerender(<ProjectControls catalog={catalog} project={project} onRestore={vi.fn()} />)
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('blocked')
    })
    fireEvent.click(screen.getByRole('button', { name: '导出演练项目' }))
    expect(screen.getByRole('status').textContent).toContain('无法导出')
  })

  it('较早文件的异步读取迟到时不会覆盖较新的本机恢复', async () => {
    let resolveFile: ((text: string) => void) | undefined
    const delayed = new Promise<string>((resolve) => {
      resolveFile = resolve
    })
    const file = new File([''], 'old.craft.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: () => delayed })
    localStorage.setItem(REHEARSAL_PROJECT_KEY, JSON.stringify(project))
    const onRestore = vi.fn()
    render(<ProjectControls catalog={catalog} onRestore={onRestore} />)
    fireEvent.change(screen.getByLabelText('选择演练项目文件'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    expect(onRestore).toHaveBeenCalledTimes(1)
    resolveFile?.(JSON.stringify(project))
    await delayed
    await Promise.resolve()
    expect(onRestore).toHaveBeenCalledTimes(1)
  })
})
