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
const pick = (id: string) =>
  fireEvent.click(
    within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: new RegExp(id) }),
  )
function add(id: string) {
  change('搜索目标词缀', id)
  click(`加入目标 ${id}`)
}
it('按条件连续开始、应用并停止，保存撤销恢复使用当前游标', () => {
  render(<RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />)
  add('p1')
  add('s1')
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  click('开始指引步骤')
  pick('p1')
  click('应用本次结果')
  expect(screen.getByText('命中规则 3：富豪石')).toBeDefined()
  click('开始指引步骤')
  pick('s1')
  click('应用本次结果')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('保存演练到本机')
  expect(
    JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').strategy.rules,
  ).toHaveLength(4)
  click('撤销')
  expect(screen.getByText('命中规则 3：富豪石')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
})
it('条件、优先级和预算可编辑，修改使未应用草稿失效，历史已有步骤计入上限', () => {
  render(<RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />)
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  click('开始指引步骤')
  change('规则 2 动作', 'alchemy')
  expect(screen.queryByLabelText('本次指定结果')).toBeNull()
  expect(screen.getByText('命中规则 2：点金石')).toBeDefined()
  change('规则 2 动作', 'transmutation')
  click('开始指引步骤')
  pick('p1')
  click('应用本次结果')
  change('指引步骤上限', '1')
  click('更新步骤上限')
  expect(screen.getByText('已达步骤上限，条件指引停止。')).toBeDefined()
  click('撤销')
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  change('规则 1 条件 1', 'always')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('下移规则 1')
  expect(screen.getByText('命中规则 1：蜕变石')).toBeDefined()
})
it('规则无预兆不继承手工预兆，开始不消费，应用只计指定材料', () => {
  render(<RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />)
  click('蜕变石')
  pick('p1')
  click('应用本次结果')
  click('富豪石')
  pick('s1')
  click('应用本次结果')
  change('本次搭配预兆', 'sinistral_exaltation')
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 4 动作', 'exalted')
  click('开始指引步骤')
  pick('s2')
  click('应用本次结果')
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.operations).toHaveLength(3)
  expect(saved.operations.at(-1)).toMatchObject({ currency: 'exalted', modIds: ['s2'] })
  expect(saved.operations.at(-1)).not.toHaveProperty('omen')
  change('规则 4 预兆', 'sinistral_exaltation')
  click('开始指引步骤')
  pick('p2')
  click('应用本次结果')
  click('保存演练到本机')
  expect(
    JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations.at(-1),
  ).toMatchObject({ currency: 'exalted', omen: 'sinistral_exaltation', modIds: ['p2'] })
  expect(screen.queryByText(/命中规则 4.*无法/)).toBeNull()
})
it('删除、添加AND条件与不合法首条均在当前规则中生效', () => {
  render(
    <RehearsalPanel catalog={catalog()} initialState={state('magic', ['s1'])} translations={{}} />,
  )
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  click('添加条件到规则 3')
  change('规则 3 条件 2', 'open-prefix')
  change('规则 3 动作', 'augmentation')
  expect(screen.getByText('命中规则 3：增幅石')).toBeDefined()
  click('开始指引步骤')
  pick('p1')
  click('应用本次结果')
  expect(screen.getByText('没有规则匹配当前装备。')).toBeDefined()
  click('删除规则 3 条件 2')
  expect(screen.getByText(/规则 3 无法开始：魔法装备词缀已满/)).toBeDefined()
  click('删除规则 3')
  click('添加规则')
  expect(screen.getByText('命中规则 4：停止。')).toBeDefined()
})
