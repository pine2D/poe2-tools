import {
  type DefinitionCraftStrategyCondition,
  readDefinitionCraftStrategy,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { catalog, state } from '../../../../packages/item-core/src/partialTargetFixture'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'
import { StrategyTargetCondition } from './StrategyTargetCondition'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const pick = (id: string) =>
  fireEvent.click(
    within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: new RegExp(id) }),
  )
function add(id: string) {
  change('搜索目标词缀', id)
  click(`加入目标 ${id}`)
}
function start() {
  render(<RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />)
  add('p1')
  add('s1')
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 1 条件 1', 'selected-targets')
}
it('指定一组可以提前停止，改为两组后继续制作并保存撤销恢复', () => {
  start()
  click('开始指引步骤')
  pick('p1')
  click('应用本次结果')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  fireEvent.click(screen.getByLabelText('规则 1 条件 1 目标 t2'))
  change('规则 1 条件 1 满足组数', '2')
  expect(screen.getByText('命中规则 3：富豪石')).toBeDefined()
  click('开始指引步骤')
  pick('s1')
  click('应用本次结果')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.rulesVersion).toBe('basic-2026-09-12-v74')
  expect(p.targetDefinitions.targets).toEqual([
    { targetId: 't1', modId: 'p1' },
    { targetId: 't2', modId: 's1' },
  ])
  expect(p.strategy.rules[0].conditions[0]).toEqual({
    kind: 'selected-targets',
    targetIds: ['t1', 't2'],
    min: 2,
    value: true,
  })
  click('撤销')
  expect(screen.getByText('命中规则 3：富豪石')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
})
it('删除引用的目标会阻塞并保存，同类型重加仍需明确修复旧引用', () => {
  start()
  change('规则 1 条件 1 目标组状态', 'false')
  click('移除目标 p1')
  expect(screen.getByText(/规则 1 无法开始：规则引用的目标已移除：t1/)).toBeDefined()
  expect(screen.queryByRole('button', { name: '开始指引步骤' })).toBeNull()
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.rulesVersion).toBe('basic-2026-09-12-v74')
  expect(p.targetDefinitions.targets).toEqual([{ targetId: 't2', modId: 's1' }])
  expect(p.orphanedTargets).toEqual([{ targetId: 't1', modId: 'p1' }])
  expect(p.strategy.rules[0].conditions[0].targetIds).toEqual(['t1'])
  add('p1')
  expect(screen.getByText(/规则 1 无法开始：规则引用的目标已移除：t1/)).toBeDefined()
  expect((screen.getByLabelText('规则 1 条件 1 目标 t3') as HTMLInputElement).checked).toBe(false)
  click('恢复本机演练')
  expect(screen.getByText(/规则 1 无法开始：规则引用的目标已移除：t1/)).toBeDefined()
  fireEvent.click(screen.getByLabelText('规则 1 条件 1 目标 t2'))
  fireEvent.click(screen.getByLabelText('规则 1 条件 1 目标 t1'))
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
})
it('改变子集条件取消旧草稿，未设置目标时不提供新建子集条件', () => {
  start()
  click('开始指引步骤')
  expect(screen.getByLabelText('本次指定结果')).toBeDefined()
  change('规则 1 条件 1 目标组状态', 'false')
  expect(screen.queryByLabelText('本次指定结果')).toBeNull()
  click('关闭条件指引')
  click('移除目标 p1')
  click('移除目标 s1')
  click('启用条件指引示例')
  const select = screen.getByLabelText('规则 1 条件 1') as HTMLSelectElement
  expect(select.querySelector('option[value="selected-targets"]')?.hasAttribute('disabled')).toBe(
    true,
  )
})

it('满六组且有残留引用时，先移除旧组再加入新组，配置始终可保存', () => {
  let condition: Extract<DefinitionCraftStrategyCondition, { kind: 'selected-targets' }> = {
    kind: 'selected-targets',
    targetIds: ['t1', 't2', 't3', 't4', 't5', 't6'],
    min: 2,
    value: true,
  }
  const props = {
    prefix: '测试条件',
    catalog: catalog(),
    targets: ['p2', 'p3', 'p4', 's1', 's2', 's3'].map((modId, index) => ({
      targetId: `t${index + 2}`,
      modId,
    })),
    orphanedTargets: [{ targetId: 't1', modId: 'p1' }],
  }
  const changeCondition = (next: typeof condition) => {
    condition = next
    view.rerender(
      <StrategyTargetCondition {...props} condition={condition} onChange={changeCondition} />,
    )
  }
  const view = render(
    <StrategyTargetCondition {...props} condition={condition} onChange={changeCondition} />,
  )
  expect((screen.getByLabelText('测试条件 目标 t7') as HTMLInputElement).disabled).toBe(true)
  fireEvent.click(screen.getByLabelText('测试条件 目标 t7'))
  expect(condition.targetIds).toHaveLength(6)
  fireEvent.click(screen.getByLabelText('测试条件 目标 t1'))
  expect((screen.getByLabelText('测试条件 目标 t7') as HTMLInputElement).disabled).toBe(false)
  fireEvent.click(screen.getByLabelText('测试条件 目标 t7'))
  expect(condition.targetIds).toEqual(['t2', 't3', 't4', 't5', 't6', 't7'])
  expect(
    readDefinitionCraftStrategy({
      maxSteps: 20,
      rules: [{ conditions: [condition], action: { kind: 'stop' } }],
    }).ok,
  ).toBe(true)
})
