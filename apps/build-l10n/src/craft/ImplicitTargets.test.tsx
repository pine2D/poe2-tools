import {
  type CraftCatalog,
  type CraftImplicitTargetValues,
  type CraftState,
  inspectItem,
  parseItem,
} from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  beltCatalog,
  beltSource,
  beltState,
  required,
} from '../../../../packages/item-core/src/beltTestFixture'
import { boneCatalog } from '../../../../packages/item-core/src/boneTestFixture'
import { CraftComparisonPanel } from './CraftComparisonPanel'
import { CraftEntry } from './CraftEntry'
import { CraftTargets } from './CraftTargets'
import { ImplicitTargetEditor } from './ImplicitTargetEditor'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'

const delayed = vi.hoisted(() => ({
  hold: false,
  calls: [] as { finish: () => void; cancel: ReturnType<typeof vi.fn> }[],
}))
vi.mock('./targetRoutesWorkerClient', async () => {
  const { planCraftTargetRoutes } = await import('@poe2-tools/item-core')
  return {
    requestTargetRoutes: (
      args: Parameters<typeof planCraftTargetRoutes>,
      callback: (value: ReturnType<typeof planCraftTargetRoutes>) => void,
    ) => {
      const finish = () => callback(planCraftTargetRoutes(...args))
      const cancel = vi.fn()
      if (delayed.hold) delayed.calls.push({ finish, cancel })
      else finish()
      return cancel
    },
  }
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  delayed.hold = false
  delayed.calls = []
})
function start() {
  const catalog = beltCatalog()
  render(
    <CraftEntry
      catalog={catalog}
      base={required(catalog.bases[0])}
      itemLevel={30}
      imported={undefined}
      translations={{}}
      translateLine={undefined}
      dictionary={undefined}
      onRestore={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
}
it('仅固有目标编辑、真实路线应用、费用及撤销恢复', () => {
  start()
  fireEvent.change(screen.getByLabelText('固有属性 1 · 数值 1 下限'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: '保存固有属性 1 条件' }))
  expect(screen.getByText('已达成 0 / 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  fireEvent.click(required(screen.getAllByRole('button', { name: '预览路线第一步' })[0]))
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(screen.getByText('咒符栏：2；可重掷范围：1–2。')).toBeDefined()
  expect(screen.getByText('已达成 1 / 1')).toBeDefined()
  expect(screen.getByText('神圣石 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const project = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(project.targetImplicitValues).toEqual([{ lineIndex: 0, bounds: [{ index: 0, min: 2 }] }])
  expect(project.operations).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.getByText('已达成 0 / 1')).toBeDefined()
  fireEvent.change(screen.getByLabelText('固有属性 1 · 数值 1 下限'), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect((screen.getByLabelText('固有属性 1 · 数值 1 下限') as HTMLInputElement).value).toBe('2')
  expect(screen.getByText('已达成 1 / 1')).toBeDefined()
})

function slotState(slot = '1(1-2)', level = 30): CraftState {
  const state = beltState(level)
  return {
    ...state,
    implicitLines: [`Has ${slot} Charm Slot`, '(10-20)% increased Flask Charges gained'],
  }
}
function Editor({
  catalog = beltCatalog(),
  state = slotState(),
}: {
  catalog?: CraftCatalog
  state?: CraftState
}) {
  const [values, setValues] = useState<CraftImplicitTargetValues[]>([])
  return (
    <>
      <ImplicitTargetEditor
        catalog={catalog}
        state={state}
        values={values}
        onChange={setValues}
        translateLine={(line) => (line === 'Has (1-3) Charm Slot' ? '具有 (1-3) 个咒符栏' : null)}
      />
      <output aria-label="已保存固有条件">{JSON.stringify(values)}</output>
    </>
  )
}
const changeMin = (value: string) =>
  fireEvent.change(screen.getByLabelText('固有属性 1 · 数值 1 下限'), { target: { value } })
const save = () => fireEvent.click(screen.getByRole('button', { name: '保存固有属性 1 条件' }))
it('目录1–3和当前1–2分别展示，目标3可保存但原因明确无交集', () => {
  render(<Editor />)
  expect(screen.getByText('具有 (1-3) 个咒符栏')).toBeDefined()
  expect(screen.getByText('数值 1 · 目录条件范围：1 至 3')).toBeDefined()
  expect(screen.getByText('当前咒符栏范围为1–2。')).toBeDefined()
  changeMin('3')
  save()
  expect(screen.getByText('固有目标未达成')).toBeDefined()
  expect(screen.getByText(/当前可重掷范围或显示网格不能达到该固有条件/)).toBeDefined()
})
it('未知范围保留实际值，固定1仅允许1，普通多范围与无候选', () => {
  const view = render(
    <Editor
      state={{
        ...slotState('2', 80),
        sourceText: beltSource('en', '2', 80).item.rawText,
        implicitLines: ['Has 2 Charm Slot', '15(10-20)% increased Flask Charges gained'],
      }}
    />,
  )
  changeMin('2')
  save()
  expect(screen.getByText('固有目标已达成')).toBeDefined()
  expect(screen.getAllByText(/当前不可重掷/).length).toBeGreaterThan(0)
  view.unmount()
  const fixed = beltCatalog(true)
  const fixedView = render(<Editor catalog={fixed} state={slotState('1', 80)} />)
  expect((screen.getByLabelText('固有属性 1 · 数值 1 下限') as HTMLInputElement).max).toBe('1')
  changeMin('1')
  save()
  expect(screen.getByText('固有目标已达成')).toBeDefined()
  changeMin('2')
  save()
  expect(screen.getByRole('alert')).toBeDefined()
  fixedView.unmount()
  const normal = boneCatalog('Ring')
  normal.bases[0] = {
    ...required(normal.bases[0]),
    type: 'Ring',
    implicit: 'Adds (1-4) to (8-12) damage',
  }
  const next = { ...beltState(), implicitLines: ['Adds 2(1-4) to 9(8-12) damage'] }
  const normalView = render(<Editor catalog={normal} state={next} />)
  expect(screen.getByLabelText('固有属性 1 · 数值 2 上限')).toBeDefined()
  fireEvent.change(screen.getByLabelText('固有属性 1 · 数值 2 下限'), { target: { value: '10' } })
  save()
  expect(screen.getByLabelText('已保存固有条件').textContent).toContain('"index":1,"min":10')
  normalView.unmount()
  normal.bases[0] = { ...required(normal.bases[0]), implicit: null }
  render(<Editor catalog={normal} state={{ ...next, implicitLines: [] }} />)
  expect(screen.queryByLabelText('固有属性目标')).toBeNull()
})
it('未完成数字不会清空已保存条件，越界报错，清空不留旧草稿', () => {
  render(<Editor />)
  changeMin('2')
  save()
  const input = screen.getByLabelText('固有属性 1 · 数值 1 下限') as HTMLInputElement
  fireEvent.change(input, { target: { value: '' } })
  Object.defineProperty(input, 'validity', { configurable: true, value: { badInput: true } })
  save()
  expect(screen.getByRole('alert').textContent).toContain('完整数字')
  expect(screen.getByLabelText('已保存固有条件').textContent).toContain('"min":2')
  Object.defineProperty(input, 'validity', { configurable: true, value: { badInput: false } })
  changeMin('4')
  save()
  expect(screen.getByRole('alert')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '清空固有属性 1 条件' }))
  expect(screen.getByLabelText('已保存固有条件').textContent).toBe('[]')
  expect((screen.getByLabelText('固有属性 1 · 数值 1 下限') as HTMLInputElement).value).toBe('')
})
it('显式和固有联合计数及前后达成/失去均使用目录身份', () => {
  const catalog = beltCatalog()
  const state = {
    ...slotState(),
    rarity: 'magic' as const,
    affixes: [
      {
        modId: 'prefix1',
        lines: required(catalog.modifiers.find((mod) => mod.id === 'prefix1')).lines.map((line) =>
          line.replace('(1-10)', '5(1-10)'),
        ),
      },
    ],
  }
  const goals = [{ lineIndex: 0, bounds: [{ index: 0, min: 2 }] }]
  render(
    <CraftTargets
      catalog={catalog}
      state={state}
      targetModIds={['prefix1']}
      targetValues={[]}
      targetImplicitValues={goals}
      onImplicitValuesChange={vi.fn()}
      onValuesChange={vi.fn()}
      onChange={vi.fn()}
      onStart={vi.fn()}
      onStartEssence={vi.fn()}
      onStartPreparation={vi.fn()}
      onPreviewRoute={vi.fn()}
      translations={{}}
      busy={false}
    />,
  )
  expect(screen.getByText('已达成 1 / 2')).toBeDefined()
  cleanup()
  const after = {
    ...state,
    implicitLines: ['Has 2(1-2) Charm Slot', '(10-20)% increased Flask Charges gained'],
  }
  const view = render(
    <CraftComparisonPanel
      catalog={catalog}
      before={state}
      after={after}
      targetImplicitValues={goals}
    />,
  )
  expect(screen.getByLabelText('固有目标前后变化').textContent).toContain(
    '未达成 → 已达成（达成固有目标）',
  )
  view.rerender(
    <CraftComparisonPanel
      catalog={catalog}
      before={after}
      after={state}
      targetImplicitValues={goals}
    />,
  )
  expect(screen.getByLabelText('固有目标前后变化').textContent).toContain(
    '已达成 → 未达成（失去固有目标）',
  )
})
it('中文旧cap2导入目标3不会生成完整路线', () => {
  const catalog = beltCatalog()
  const source = beltSource('zh-CN', '2(1-2)', 80)
  const parsed = parseItem(source.item.rawText)
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, source.dictionary)
  render(
    <CraftEntry
      catalog={catalog}
      base={required(catalog.bases[0])}
      itemLevel={80}
      imported={{ baseId: 'Synthetic Base', item: parsed.item, mods: inspection.mods }}
      translations={{}}
      translateLine={undefined}
      dictionary={source.dictionary}
      onRestore={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '从当前装备开始' }))
  changeMin('3')
  save()
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(screen.getByText(/本次有限搜索未找到完整路线/)).toBeDefined()
  expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
})

it('重新从搜索起点开始会清除条件及未保存草稿', () => {
  start()
  changeMin('2')
  save()
  changeMin('3')
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  expect((screen.getByLabelText('固有属性 1 · 数值 1 下限') as HTMLInputElement).value).toBe('')
  expect(screen.queryByText('已达成 0 / 1')).toBeNull()
  expect(
    (screen.getByRole('button', { name: '生成多步示例路线' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const project = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(project.targetImplicitValues).toBeUndefined()
  expect(project.operations).toEqual([])
})

it('恢复同一项目也取消正在计算的旧回调，不能重新出现路线', () => {
  start()
  changeMin('2')
  save()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  delayed.hold = true
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(delayed.calls).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(required(delayed.calls[0]).cancel).toHaveBeenCalled()
  act(() => required(delayed.calls[0]).finish())
  expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
  expect(screen.queryByText('正在计算有限示例路线…')).toBeNull()
})
