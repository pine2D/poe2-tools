import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { catalog, state } from '../../../../packages/item-core/src/partialTargetFixture'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
function setup() {
  render(<RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />)
  click('启用条件指引示例')
  click('启用分阶段流程')
  click('添加阶段')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 2 应用后阶段', 'stage-2')
  change('规则 3 所属阶段', 'stage-2')
  change('规则 3 应用后阶段', 'stage-1')
  change('规则 4 动作', 'stop')
}
function apply(id: string) {
  click('开始指引步骤')
  fireEvent.click(
    within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: new RegExp(id) }),
  )
  click('应用本次结果')
}
it('按阶段执行、回连，保存/撤销/重做/恢复精确重算且只有通货计费', () => {
  setup()
  expect(screen.getByText('当前阶段：阶段 1')).toBeDefined()
  apply('p1')
  expect(screen.getByText('当前阶段：阶段 2')).toBeDefined()
  apply('s1')
  expect(screen.getByText('当前阶段：阶段 1')).toBeDefined()
  expect(screen.getByText('命中规则 4：停止。')).toBeDefined()
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.strategyStartStep).toBe(0)
  expect(p.operations).toHaveLength(2)
  expect(p.strategy.flow.stages).toHaveLength(2)
  click('撤销')
  expect(screen.getByText('当前阶段：阶段 2')).toBeDefined()
  click('重做')
  expect(screen.getByText('当前阶段：阶段 1')).toBeDefined()
  click('撤销')
  click('恢复本机演练')
  expect(screen.getByText('命中规则 4：停止。')).toBeDefined()
})
it('修改流程和目标从当前历史重启，撤销后另走分支缩短起点', () => {
  setup()
  apply('p1')
  click('从当前装备重启流程')
  expect(screen.getByText('当前阶段：阶段 1')).toBeDefined()
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').strategyStartStep).toBe(1)
  click('撤销')
  apply('p1')
  expect(screen.getByText('当前阶段：阶段 2')).toBeDefined()
  change('搜索目标词缀', 's1')
  click('加入目标 s1')
  expect(screen.getByText('当前阶段：阶段 1')).toBeDefined()
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').strategyStartStep).toBe(1)
})
it('引用中的阶段不能删除；关闭流程去掉阶段配置和起点', () => {
  setup()
  expect(
    (screen.getByRole('button', { name: '删除阶段 stage-2' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  click('添加阶段')
  click('删除阶段 stage-3')
  click('关闭分阶段流程')
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.strategy.flow).toBeUndefined()
  expect(p.strategyStartStep).toBeUndefined()
  expect(p.strategy.rules.every((rule: { stageId?: string }) => rule.stageId === undefined)).toBe(
    true,
  )
})

it('取消草稿不推进，匹配的手动操作推进，不同手动操作留在当前阶段', () => {
  setup()
  click('开始指引步骤')
  click('取消本次结果')
  expect(screen.getByText('当前阶段：阶段 1')).toBeDefined()
  click('蜕变石')
  fireEvent.click(within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: /p1/ }))
  click('应用本次结果')
  expect(screen.getByText('当前阶段：阶段 2')).toBeDefined()
  click('增幅石')
  fireEvent.click(within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: /s1/ }))
  click('应用本次结果')
  expect(screen.getByText('当前阶段：阶段 2')).toBeDefined()
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations).toHaveLength(2)
})
