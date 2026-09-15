import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import {
  catalog,
  conflictingCatalog,
  state,
} from '../../../../packages/item-core/src/partialTargetFixture'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
function add(id: string) {
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: id } })
  click(`加入目标 ${id}`)
}
it('网页一组达成即停止建议，保存、撤销和恢复保留数量条件', () => {
  render(<RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />)
  add('p1')
  add('s1')
  fireEvent.change(screen.getByLabelText('显式目标达成条件'), { target: { value: '1' } })
  click('蜕变石')
  fireEvent.click(within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: /p1/ }))
  click('应用本次结果')
  expect(screen.getByText('数量条件及必选目标均已达成，可停止当前路线。')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v74')
  expect(saved.targetDefinitions).toEqual({
    nextTargetId: 3,
    targets: [
      { targetId: 't1', modId: 'p1' },
      { targetId: 't2', modId: 's1' },
    ],
    alternatives: [],
    values: [],
    minimumTargetCount: 1,
  })
  click('撤销')
  expect(screen.queryByText('数量条件及必选目标均已达成，可停止当前路线。')).toBeNull()
  click('恢复本机演练')
  expect(screen.getByText('数量条件及必选目标均已达成，可停止当前路线。')).toBeDefined()
  expect((screen.getByLabelText('显式目标达成条件') as HTMLSelectElement).value).toBe('1')
})
it('备选四前缀时允许数值编辑，切回无法共存的全部模式须保留原条件', () => {
  render(<RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />)
  add('p1')
  add('p2')
  fireEvent.change(screen.getByLabelText('显式目标达成条件'), { target: { value: '2' } })
  add('p3')
  add('p4')
  click('设置数值条件 p1')
  fireEvent.change(screen.getByLabelText('p1 · 数值 1 最小值'), { target: { value: '8' } })
  click('保存数值条件 p1')
  fireEvent.change(screen.getByLabelText('显式目标达成条件'), { target: { value: 'all' } })
  expect((screen.getByLabelText('显式目标达成条件') as HTMLSelectElement).value).toBe('2')
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.targetDefinitions).toEqual({
    nextTargetId: 5,
    targets: [
      { targetId: 't1', modId: 'p1' },
      { targetId: 't2', modId: 'p2' },
      { targetId: 't3', modId: 'p3' },
      { targetId: 't4', modId: 'p4' },
    ],
    alternatives: [],
    values: [{ targetId: 't1', modId: 'p1', bounds: [{ index: 0, min: 8 }] }],
    minimumTargetCount: 2,
  })
})

it('移除使数量越界时收缩为剩余数量，并显示原因，重新添加保留数量条件', () => {
  render(<RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />)
  add('p1')
  add('s1')
  fireEvent.change(screen.getByLabelText('显式目标达成条件'), { target: { value: '2' } })
  click('移除目标 s1')
  expect((screen.getByLabelText('显式目标达成条件') as HTMLSelectElement).value).toBe('1')
  expect(screen.getByText('目标减少，达成数量已调整为剩余目标数。')).toBeDefined()
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').targetDefinitions).toEqual(
    {
      nextTargetId: 3,
      targets: [{ targetId: 't1', modId: 'p1' }],
      alternatives: [],
      values: [],
      minimumTargetCount: 1,
    },
  )
  add('s1')
  expect((screen.getByLabelText('显式目标达成条件') as HTMLSelectElement).value).toBe('1')
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').targetDefinitions).toEqual(
    {
      nextTargetId: 4,
      targets: [
        { targetId: 't1', modId: 'p1' },
        { targetId: 't3', modId: 's1' },
      ],
      alternatives: [],
      values: [],
      minimumTargetCount: 1,
    },
  )
})

it('开启破裂或增加数量不得造成必选组与所有合法组合互斥', () => {
  render(
    <RehearsalPanel
      catalog={conflictingCatalog()}
      initialState={state('normal')}
      translations={{}}
    />,
  )
  add('ess')
  fireEvent.change(screen.getByLabelText('显式目标达成条件'), { target: { value: '1' } })
  add('fire')
  add('cold')
  fireEvent.change(screen.getByLabelText('显式目标达成条件'), { target: { value: '2' } })
  fireEvent.click(screen.getByLabelText('要求破裂 ess'))
  expect((screen.getByLabelText('要求破裂 ess') as HTMLInputElement).checked).toBe(false)
  expect(screen.getByText('不存在包含必选破裂组、且满足要求数量的合法目标组合。')).toBeDefined()
  fireEvent.change(screen.getByLabelText('显式目标达成条件'), { target: { value: '1' } })
  fireEvent.click(screen.getByLabelText('要求破裂 ess'))
  fireEvent.change(screen.getByLabelText('显式目标达成条件'), { target: { value: '2' } })
  expect((screen.getByLabelText('显式目标达成条件') as HTMLSelectElement).value).toBe('1')
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').targetDefinitions).toEqual(
    {
      nextTargetId: 4,
      targets: [
        { targetId: 't1', modId: 'ess' },
        { targetId: 't2', modId: 'fire' },
        { targetId: 't3', modId: 'cold' },
      ],
      alternatives: [],
      values: [],
      minimumTargetCount: 1,
      fracturedTargetId: 't1',
    },
  )
})
