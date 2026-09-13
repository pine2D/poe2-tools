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
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
function setup() {
  render(<RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />)
  click('启用条件指引示例')
  click('启用分阶段流程')
  click('添加阶段')
  click('添加阶段')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 1 条件 1', 'always')
  change('规则 1 动作', 'regal')
  change('规则 1 应用后阶段', 'stage-3')
  change('规则 1 无法执行时', 'stage-2')
  change('规则 2 所属阶段', 'stage-2')
  change('规则 2 应用后阶段', 'stage-1')
  change('规则 3 所属阶段', 'stage-3')
  change('规则 3 条件 1', 'always')
  change('规则 3 动作', 'stop')
}
function apply(id: string) {
  click('开始指引步骤')
  fireEvent.click(
    within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: new RegExp(id) }),
  )
  click('应用本次结果')
}
it('无法执行转向显示原因，准备后正常执行原动作，费用与恢复一致', () => {
  setup()
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  expect(screen.getByLabelText('本次判断路径').textContent).toContain('无法执行：')
  apply('p1')
  expect(screen.getByText('命中规则 1：富豪石')).toBeDefined()
  expect(screen.queryByLabelText('本次判断路径')).toBeNull()
  apply('s1')
  expect(screen.getByText('命中规则 3：停止。')).toBeDefined()
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.operations.map((op: { currency: string }) => op.currency)).toEqual([
    'transmutation',
    'regal',
  ])
  click('撤销')
  click('撤销')
  expect(screen.getByLabelText('本次判断路径')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('命中规则 3：停止。')).toBeDefined()
})
it('fallback引用保护删除，更换非工作动作及关闭flow清理字段', () => {
  setup()
  change('规则 2 所属阶段', 'stage-1')
  fireEvent.click(screen.getByText('阶段与路线（3 个阶段）'))
  expect(
    (screen.getByRole('button', { name: '删除阶段 stage-2' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  change('规则 1 动作', 'stop')
  click('保存演练到本机')
  let p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.strategy.rules[0].onBlockedStageId).toBeUndefined()
  click('删除阶段 stage-2')
  change('规则 1 动作', 'regal')
  change('规则 1 无法执行时', 'stage-3')
  click('关闭分阶段流程')
  click('保存演练到本机')
  p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(
    p.strategy.rules.every(
      (rule: { onBlockedStageId?: string }) => rule.onBlockedStageId === undefined,
    ),
  ).toBe(true)
  expect(p.strategy.flow).toBeUndefined()
})
