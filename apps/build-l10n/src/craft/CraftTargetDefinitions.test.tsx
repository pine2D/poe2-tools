import {
  applyCraftStep,
  type CraftState,
  type CraftTargetDefinitionEdit,
  type CraftTargetDefinitions,
  createTargetDefinitions,
  editTargetDefinitions,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { CraftTargets } from './CraftTargets'

vi.mock('./TargetRoutesPanel', () => ({ TargetRoutesPanel: () => null }))
afterEach(cleanup)
const catalog = boneCatalog()
const state = boneState(['prefix1'])
const initial: CraftTargetDefinitions = {
  nextTargetId: 9,
  targets: [
    { targetId: 't7', modId: 'prefix1' },
    { targetId: 't8', modId: 'suffix1' },
  ],
  alternatives: [],
  values: [],
}
const callbacks = {
  onStart: vi.fn(),
  onStartEssence: vi.fn(),
  onStartPreparation: vi.fn(),
  onPreviewRoute: vi.fn(),
  translations: {},
  busy: false,
}
function Harness({
  item = state,
  definitions = initial,
  data = catalog,
  edits = [],
}: {
  item?: CraftState
  definitions?: CraftTargetDefinitions
  data?: typeof catalog
  edits?: CraftTargetDefinitionEdit[]
}) {
  const [goals, setGoals] = useState(definitions)
  return (
    <>
      <output aria-label="目标定义">{JSON.stringify(goals)}</output>
      <CraftTargets
        {...callbacks}
        catalog={data}
        state={item}
        definitions={goals}
        onEdit={(edit) => {
          edits.push(edit)
          const next = editTargetDefinitions(data, item, goals, edit)
          if (!next.ok) throw Error(next.error)
          setGoals(next.value)
        }}
        onExtract={(definitions) => {
          const next = editTargetDefinitions(data, item, goals, {
            kind: 'replace-definitions',
            definitions,
          })
          if (!next.ok) throw Error(next.error)
          setGoals(next.value)
        }}
      />
    </>
  )
}
function goals() {
  return JSON.parse(screen.getByLabelText('目标定义').textContent ?? '') as CraftTargetDefinitions
}
it('删除再添加分配新目标，重排只移动原身份，未保存数值草稿不会重绑定', () => {
  const edits: CraftTargetDefinitionEdit[] = []
  render(<Harness edits={edits} />)
  fireEvent.click(screen.getByRole('button', { name: '设置数值条件 prefix1' }))
  fireEvent.change(screen.getByLabelText('prefix1 · 数值 1 最小值'), { target: { value: '8' } })
  fireEvent.click(screen.getByRole('button', { name: '下移目标 prefix1' }))
  expect(goals().targets.map((t) => t.targetId)).toEqual(['t8', 't7'])
  fireEvent.click(screen.getByRole('button', { name: '移除目标 prefix1' }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'prefix1' } })
  fireEvent.click(screen.getByRole('button', { name: '加入目标 prefix1' }))
  expect(goals().targets).toEqual([
    { targetId: 't8', modId: 'suffix1' },
    { targetId: 't9', modId: 'prefix1' },
  ])
  expect(goals().nextTargetId).toBe(10)
  fireEvent.click(screen.getByRole('button', { name: '设置数值条件 prefix1' }))
  expect((screen.getByLabelText('prefix1 · 数值 1 最小值') as HTMLInputElement).value).toBe('')
  expect(edits.slice(0, 3)).toEqual([
    { kind: 'reorder', targetIds: ['t8', 't7'] },
    { kind: 'remove', targetId: 't7' },
    { kind: 'add', modId: 'prefix1' },
  ])
})
it('真实混沌后的有效目标撤销到歧义状态仍显示保存值，允许编辑和删除', () => {
  const data = boneCatalog()
  const mod = data.modifiers[0]
  if (!mod) throw Error('缺少测试词缀')
  mod.lines = ['Value (1-10)', 'Value (1-5)']
  const item = { ...boneState(), affixes: [{ modId: 'prefix1', lines: ['Value 3', 'Value 4'] }] }
  const after = applyCraftStep(data, item, {
    currency: 'chaos',
    removeModId: 'prefix1',
    modIds: ['prefix1'],
    rolls: [{ modId: 'prefix1', values: [8, 4] }],
  })
  if (!after.ok) throw Error(after.error)
  const created = createTargetDefinitions(data, after.value, {
    targetModIds: ['prefix1'],
    targetValues: [{ modId: 'prefix1', basis: 'effective', bounds: [{ index: 0, min: 7 }] }],
  })
  if (!created.ok) throw Error(created.error)
  render(<Harness data={data} item={item} definitions={created.value} />)
  fireEvent.click(screen.getByRole('button', { name: '设置数值条件 prefix1' }))
  expect((screen.getByLabelText('prefix1 · 数值 1 最小值') as HTMLInputElement).value).toBe('7')
  fireEvent.change(screen.getByLabelText('prefix1 · 数值 1 最小值'), { target: { value: '6' } })
  fireEvent.click(screen.getByRole('button', { name: '保存数值条件 prefix1' }))
  expect(goals().values).toEqual([
    { targetId: 't1', modId: 'prefix1', basis: 'effective', bounds: [{ index: 0, min: 6 }] },
  ])
  fireEvent.click(screen.getByRole('button', { name: '移除目标 prefix1' }))
  expect(goals().targets).toEqual([])
})
it('取消提取不分配身份，确认替换才由外层分配新身份', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: '从当前装备提取目标' }))
  fireEvent.click(screen.getByRole('button', { name: '取消提取' }))
  expect(goals()).toEqual(initial)
  fireEvent.click(screen.getByRole('button', { name: '从当前装备提取目标' }))
  fireEvent.click(screen.getByRole('button', { name: '用所选词缀替换显式目标' }))
  expect(goals().targets).toEqual([{ targetId: 't9', modId: 'prefix1' }])
  expect(goals().nextTargetId).toBe(10)
})
it('删除使数量条件超出目标数时收缩为剩余数量并解释调整', () => {
  render(<Harness definitions={{ ...initial, minimumTargetCount: 2 }} />)
  fireEvent.click(screen.getByRole('button', { name: '移除目标 prefix1' }))
  expect(goals()).toEqual({
    ...initial,
    minimumTargetCount: 1,
    targets: [{ targetId: 't8', modId: 'suffix1' }],
  })
  expect(screen.getByText('目标减少，达成数量已调整为剩余目标数。')).toBeDefined()
})
