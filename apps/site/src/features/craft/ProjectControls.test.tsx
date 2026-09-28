import {
  CRAFT_RULES_VERSION,
  type CraftCatalog,
  type CraftProject,
  PANEL_GOAL_RULES_VERSION,
  TARGET_CRAFT_RULES_VERSION,
} from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectControls, REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { addLibraryEntry, LIBRARY_PREFIX } from './projectLibrary'

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

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_name: string, callback: () => unknown) => callback(),
    },
  })
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'locks')
  vi.restoreAllMocks()
})

describe('ProjectControls', () => {
  it('保存并恢复本机项目，损坏内容不会调用恢复回调', () => {
    const onRestore = vi.fn()
    render(<ProjectControls catalog={catalog} project={project} onRestore={onRestore} />)
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
    expect(saved).toEqual({
      ...project,
      rulesVersion: TARGET_CRAFT_RULES_VERSION,
      initialState: { ...initialState, nextAffixId: 1 },
      targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
      orphanedTargets: [],
    })
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    expect(onRestore).toHaveBeenCalledTimes(1)
    expect(onRestore).toHaveBeenCalledWith({ project: saved, states: [saved.initialState] })

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

it('收藏多份完整项目并独立恢复，坏项目仍须经过校验', async () => {
  const onRestore = vi.fn()
  const { rerender } = render(
    <ProjectControls catalog={catalog} project={project} onRestore={onRestore} />,
  )
  fireEvent.click(screen.getByText('演练收藏'))
  fireEvent.change(screen.getByLabelText('收藏名称'), { target: { value: '甲' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '收藏当前演练' }))
  })
  rerender(
    <ProjectControls
      catalog={catalog}
      project={{ ...project, initialState: { ...initialState, itemLevel: 90 } }}
      onRestore={onRestore}
    />,
  )
  fireEvent.change(screen.getByLabelText('收藏名称'), { target: { value: '乙' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '收藏当前演练' }))
  })
  expect(localStorage.getItem(REHEARSAL_PROJECT_KEY)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '恢复收藏 甲' }))
  expect(onRestore.mock.calls[0]?.[0].states[0].itemLevel).toBe(80)
  fireEvent.click(screen.getByRole('button', { name: '恢复收藏 乙' }))
  expect(onRestore.mock.calls[1]?.[0].states[0].itemLevel).toBe(90)
  localStorage.setItem(
    `${LIBRARY_PREFIX}bad`,
    JSON.stringify({
      version: 1,
      name: '坏项目',
      savedAt: new Date().toISOString(),
      text: '{broken',
    }),
  )
  fireEvent(window, new StorageEvent('storage', { key: `${LIBRARY_PREFIX}bad` }))
  fireEvent.click(screen.getByRole('button', { name: '恢复收藏 坏项目' }))
  expect(onRestore).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('status').textContent).toMatch(/JSON|损坏/)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '移除收藏 甲' }))
  })
  expect(screen.queryByRole('button', { name: '恢复收藏 甲' })).toBeNull()
  expect(screen.getByRole('button', { name: '恢复收藏 乙' })).toBeDefined()
})

it('收藏恢复会使先前异步文件读取失效，且没有当前项目时仍能恢复', async () => {
  let resolveFile: ((text: string) => void) | undefined
  const delayed = new Promise<string>((resolve) => {
    resolveFile = resolve
  })
  const file = new File([''], 'old.craft.json')
  Object.defineProperty(file, 'text', { value: () => delayed })
  await addLibraryEntry(localStorage, '已确认', JSON.stringify(project))
  const onRestore = vi.fn()
  render(<ProjectControls catalog={catalog} onRestore={onRestore} />)
  fireEvent.change(screen.getByLabelText('选择演练项目文件'), { target: { files: [file] } })
  fireEvent.click(screen.getByText('演练收藏'))
  fireEvent.click(screen.getByRole('button', { name: '恢复收藏 已确认' }))
  expect(onRestore).toHaveBeenCalledTimes(1)
  resolveFile?.(JSON.stringify(project))
  await delayed
  await Promise.resolve()
  expect(onRestore).toHaveBeenCalledTimes(1)
})

it('沿用方案先预览再应用，保留当前起点和报价；取消或当前上下文变化清除预览', async () => {
  const plan: CraftProject = {
    ...project,
    initialState: { ...initialState, itemLevel: 90 },
    strategy: {
      maxSteps: 20,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
    pricing: { unit: 'divine', baseCost: 99, prices: {} },
  }
  await addLibraryEntry(localStorage, '收手方案', JSON.stringify(plan))
  const onRestore = vi.fn()
  const receiving = { ...project, pricing: { unit: 'divine' as const, baseCost: 2, prices: {} } }
  const { rerender } = render(
    <ProjectControls catalog={catalog} project={receiving} onRestore={onRestore} />,
  )
  fireEvent.click(screen.getByText('演练收藏'))
  fireEvent.click(screen.getByRole('button', { name: '沿用收藏方案 收手方案' }))
  expect(screen.getByRole('region', { name: '沿用方案预览' })).toBeDefined()
  expect(onRestore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '取消沿用' }))
  expect(screen.queryByRole('region', { name: '沿用方案预览' })).toBeNull()
  expect(onRestore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '沿用收藏方案 收手方案' }))
  fireEvent.click(screen.getByRole('button', { name: '应用收藏方案' }))
  expect(onRestore).toHaveBeenCalledTimes(1)
  expect(onRestore.mock.calls[0]?.[0].project.initialState.itemLevel).toBe(80)
  expect(onRestore.mock.calls[0]?.[0].project.pricing.baseCost).toBe(2)
  expect(onRestore.mock.calls[0]?.[0].project.strategy).toEqual(plan.strategy)
  fireEvent.click(screen.getByRole('button', { name: '沿用收藏方案 收手方案' }))
  rerender(
    <ProjectControls
      catalog={catalog}
      project={{ ...receiving, cursor: 0 }}
      onRestore={onRestore}
    />,
  )
  expect(screen.queryByRole('region', { name: '沿用方案预览' })).toBeNull()
})

it('方案预览使迟到文件失效，无目标收藏不能沿用，没有当前装备时不展示沿用入口', async () => {
  const plan: CraftProject = {
    ...project,
    strategy: {
      maxSteps: 20,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  await addLibraryEntry(localStorage, '可用', JSON.stringify(plan))
  await addLibraryEntry(localStorage, '空白', JSON.stringify(project))
  const onRestore = vi.fn()
  const { rerender } = render(
    <ProjectControls catalog={catalog} project={project} onRestore={onRestore} />,
  )
  let resolveFile: ((text: string) => void) | undefined
  const delayed = new Promise<string>((resolve) => {
    resolveFile = resolve
  })
  const file = new File([''], 'old.craft.json')
  Object.defineProperty(file, 'text', { value: () => delayed })
  fireEvent.change(screen.getByLabelText('选择演练项目文件'), { target: { files: [file] } })
  fireEvent.click(screen.getByText('演练收藏'))
  fireEvent.click(screen.getByRole('button', { name: '沿用收藏方案 可用' }))
  resolveFile?.(JSON.stringify(project))
  await act(async () => {
    await delayed
  })
  expect(onRestore).not.toHaveBeenCalled()
  expect(screen.getByRole('region', { name: '沿用方案预览' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '沿用收藏方案 空白' }))
  expect(screen.queryByRole('region', { name: '沿用方案预览' })).toBeNull()
  expect(screen.getByRole('status').textContent).toContain('没有制作目标或条件指引')
  rerender(<ProjectControls catalog={catalog} onRestore={onRestore} />)
  expect(screen.queryByRole('button', { name: '沿用收藏方案 可用' })).toBeNull()
})

it('纯面板目标收藏在沿用预览中显示数量，应用后完整保留条件', async () => {
  const panelGoals = [
    { kind: 'item-property', property: 'Armour', min: 100 },
    {
      kind: 'weighted-properties',
      terms: [
        { property: 'Armour', weight: 1 },
        { property: 'Evasion', weight: 2 },
      ],
      min: 300,
    },
  ]
  const plan = {
    ...project,
    rulesVersion: PANEL_GOAL_RULES_VERSION,
    initialState: { ...initialState, nextAffixId: 1 },
    orphanedTargets: [],
    targetDefinitions: {
      nextTargetId: 1,
      targets: [],
      alternatives: [],
      values: [],
      panelGoals,
    },
  }
  await addLibraryEntry(localStorage, '防御面板', JSON.stringify(plan))
  const onRestore = vi.fn()
  render(<ProjectControls catalog={catalog} project={project} onRestore={onRestore} />)
  fireEvent.click(screen.getByText('演练收藏'))
  fireEvent.click(screen.getByRole('button', { name: '沿用收藏方案 防御面板' }))
  const preview = screen.getByRole('region', { name: '沿用方案预览' })
  expect(preview.textContent).toContain('面板目标 2 项')
  expect(onRestore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '应用收藏方案' }))
  expect(onRestore.mock.calls[0]?.[0].project.targetDefinitions.panelGoals).toEqual(panelGoals)
})
