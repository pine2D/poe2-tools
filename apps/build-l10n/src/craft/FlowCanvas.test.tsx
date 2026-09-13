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
const selectStage = (n: number) => click(`画布阶段 stage-${n}：阶段 ${n}`)
function setup() {
  render(<RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />)
  click('启用条件指引示例')
  click('启用分阶段流程')
  click('添加阶段')
  click('添加阶段')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 1 条件 1', 'always')
  change('规则 1 动作', 'regal')
  change('规则 2 所属阶段', 'stage-2')
  change('规则 3 所属阶段', 'stage-3')
  change('规则 3 条件 1', 'always')
  change('规则 3 动作', 'stop')
  selectStage(1)
  click('连接规则 1 的备用路线')
  selectStage(2)
  selectStage(1)
  click('连接规则 1 的应用后路线')
  selectStage(3)
  selectStage(2)
  click('连接规则 2 的应用后路线')
  selectStage(1)
}
function apply(id: string) {
  click('开始指引步骤')
  fireEvent.click(
    within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: new RegExp(id) }),
  )
  click('应用本次结果')
}
it('在画布连接备用与回连后可实际制作，撤销恢复共用阶段和真实费用', () => {
  setup()
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  expect(
    screen.getByRole('button', { name: '查看规则 1 的备用路线' }).getAttribute('data-active'),
  ).toBe('true')
  apply('p1')
  expect(screen.getByText('命中规则 1：富豪石')).toBeDefined()
  apply('s1')
  expect(screen.getByText('命中规则 3：停止。')).toBeDefined()
  expect(screen.getByRole('button', { name: '画布阶段 stage-3：阶段 3' }).textContent).toContain(
    '历史位置',
  )
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.strategy.rules[0]).toMatchObject({ nextStageId: 'stage-3', onBlockedStageId: 'stage-2' })
  expect(p.strategy.rules[1].nextStageId).toBe('stage-1')
  expect(p.operations.map((op: { currency: string }) => op.currency)).toEqual([
    'transmutation',
    'regal',
  ])
  expect(p.strategyStartStep).toBe(0)
  expect(p.strategy).not.toHaveProperty('layout')
  click('撤销')
  click('撤销')
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('命中规则 3：停止。')).toBeDefined()
})
it('选择缩放和取消连接保留制作草稿，真正改线取消草稿并保持合法规则', () => {
  setup()
  click('开始指引步骤')
  selectStage(1)
  click('缩小画布')
  click('连接规则 1 的应用后路线')
  expect(screen.getByLabelText('画布连接状态')).toBeDefined()
  fireEvent.keyDown(screen.getByLabelText('流程画布'), { key: 'Escape' })
  expect(screen.queryByLabelText('画布连接状态')).toBeNull()
  expect(screen.getByLabelText('本次指定结果')).toBeDefined()
  click('连接规则 1 的应用后路线')
  selectStage(1)
  expect(screen.queryByLabelText('本次指定结果')).toBeNull()
  expect(screen.getByRole('button', { name: '查看规则 1 的应用后路线' })).toBeDefined()
  click('清除规则 1 的应用后路线')
  click('清除规则 1 的备用路线')
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.operations).toEqual([])
  expect(p.strategy.rules[0].nextStageId).toBeUndefined()
  expect(p.strategy.rules[0].onBlockedStageId).toBeUndefined()
})
it('规则修改使连接草稿失效；纯跳转不能清空，停止规则无输出', () => {
  setup()
  selectStage(1)
  click('连接规则 1 的应用后路线')
  click('下移规则 1')
  expect(screen.queryByLabelText('画布连接状态')).toBeNull()
  selectStage(3)
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.strategy.rules[0].nextStageId).toBe('stage-1')
  change('规则 1 动作', 'jump')
  selectStage(2)
  expect(screen.getByRole('button', { name: '连接规则 1 的判断路线' })).toBeDefined()
  expect(screen.queryByRole('button', { name: '清除规则 1 的判断路线' })).toBeNull()
  selectStage(3)
  expect(screen.queryByRole('button', { name: '连接规则 3 的应用后路线' })).toBeNull()
})
it('从画布新增本阶段停止规则并定位原编辑器，节点入口设置沿用原字段', () => {
  setup()
  selectStage(3)
  click('设为入口阶段')
  click('在此阶段添加停止规则')
  expect(screen.getByLabelText('规则 5 所属阶段')).toBeDefined()
  expect(document.activeElement?.tagName).toBe('FIELDSET')
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.strategy.flow.entryStageId).toBe('stage-3')
  expect(p.strategy.rules[4]).toMatchObject({
    stageId: 'stage-3',
    action: { kind: 'stop' },
    conditions: [{ kind: 'always' }],
  })
})

it('恢复项目清除待连接索引，SVG路线可用键盘定位源阶段', () => {
  setup()
  click('保存演练到本机')
  selectStage(1)
  click('连接规则 1 的应用后路线')
  expect(document.activeElement).toBe(screen.getByLabelText('可滚动的阶段图'))
  click('恢复本机演练')
  expect(screen.queryByLabelText('画布连接状态')).toBeNull()
  selectStage(3)
  fireEvent.keyDown(screen.getByRole('button', { name: '查看规则 1 的备用路线' }), { key: 'Enter' })
  expect(screen.getByLabelText('画布阶段详情').textContent).toContain('规则 1')
  selectStage(3)
  fireEvent.keyDown(screen.getByRole('button', { name: '查看规则 2 的应用后路线' }), { key: ' ' })
  expect(screen.getByLabelText('画布阶段详情').textContent).toContain('规则 2')
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.strategy.rules[0].nextStageId).toBe('stage-3')
  expect(p.operations).toEqual([])
})
