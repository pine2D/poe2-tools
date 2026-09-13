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
  change('规则 1 条件 1', 'always')
  change('规则 1 动作', 'jump')
  change('规则 1 跳转阶段', 'stage-2')
  change('规则 2 所属阶段', 'stage-2')
  change('规则 3 所属阶段', 'stage-2')
  change('规则 3 动作', 'stop')
}
it('纯判断显示路径且不增加费用，取消/应用/撤销/恢复以实际操作为准', () => {
  setup()
  expect(screen.getByLabelText('本次判断路径').textContent).toContain('阶段 1 → 阶段 2')
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations).toHaveLength(0)
  click('开始指引步骤')
  click('取消本次结果')
  expect(screen.getByLabelText('本次判断路径')).toBeDefined()
  click('开始指引步骤')
  fireEvent.click(within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: /p1/ }))
  click('应用本次结果')
  expect(screen.getByText('当前阶段：阶段 2')).toBeDefined()
  expect(screen.getByText('命中规则 3：停止。')).toBeDefined()
  expect(screen.queryByLabelText('本次判断路径')).toBeNull()
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations).toHaveLength(1)
  click('撤销')
  expect(screen.getByLabelText('本次判断路径')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('命中规则 3：停止。')).toBeDefined()
})
it('循环显式阻止，修复目的恢复；含jump不能关闭flow，修改动作可关闭', () => {
  setup()
  change('规则 1 跳转阶段', 'stage-1')
  expect(screen.getByText(/检测到不消耗材料的阶段循环/)).toBeDefined()
  expect(screen.queryByRole('button', { name: '开始指引步骤' })).toBeNull()
  expect(
    (screen.getByRole('button', { name: '关闭分阶段流程' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  change('规则 1 跳转阶段', 'stage-2')
  expect(screen.getByRole('button', { name: '开始指引步骤' })).toBeDefined()
  change('规则 1 动作', 'stop')
  click('关闭分阶段流程')
  expect(screen.queryByLabelText('本次判断路径')).toBeNull()
  expect(
    (screen.getByLabelText('规则 1 动作') as HTMLSelectElement)
      .querySelector('option[value="jump"]')
      ?.hasAttribute('disabled'),
  ).toBe(true)
})
