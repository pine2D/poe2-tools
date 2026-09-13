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
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 1 条件 1', 'rarity')
  change('规则 1 稀有度', 'rare')
  click('将规则 1 条件 1 包为任一满足')
  click('添加子条件到规则 1 条件 1')
  change('规则 1 条件 1.2 稀有度', 'magic')
  click('将规则 1 条件 1 取反')
  change('规则 1 动作', 'transmutation')
}
it('嵌套任一与取反可以准备普通起点，制作撤销保存恢复共用实时判断', () => {
  setup()
  expect(screen.getByText('命中规则 1：蜕变石')).toBeDefined()
  click('开始指引步骤')
  fireEvent.click(within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: /p1/ }))
  click('应用本次结果')
  expect(screen.getByText('命中规则 3：富豪石')).toBeDefined()
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.strategy.rules[0].conditions[0]).toEqual({
    kind: 'not',
    condition: {
      kind: 'any',
      conditions: [
        { kind: 'rarity', value: 'rare' },
        { kind: 'rarity', value: 'magic' },
      ],
    },
  })
  expect(p.operations).toHaveLength(1)
  click('撤销')
  expect(screen.getByText('命中规则 1：蜕变石')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('命中规则 3：富豪石')).toBeDefined()
})
it('编辑树取消未应用步骤，解包保留子条件，达到嵌套边界禁止继续包装', () => {
  setup()
  click('开始指引步骤')
  click('解包规则 1 条件 1')
  expect(screen.queryByLabelText('本次指定结果')).toBeNull()
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  click('删除规则 1 条件 1.2')
  click('解包规则 1 条件 1')
  expect((screen.getByLabelText('规则 1 稀有度') as HTMLSelectElement).value).toBe('rare')
  for (let i = 0; i < 4; i++) click('将规则 1 条件 1 取反')
  expect(
    (screen.getByRole('button', { name: '将规则 1 条件 1 取反' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.operations).toEqual([])
  expect(p.strategy.rules[0].conditions[0].condition.condition.condition.condition).toEqual({
    kind: 'rarity',
    value: 'rare',
  })
})

it('满32节点仍可恢复和解包，顶层添加禁用而非生成无效策略', () => {
  render(<RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />)
  click('启用条件指引示例')
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  const group = { kind: 'all', conditions: Array.from({ length: 4 }, () => ({ kind: 'always' })) }
  const sixteen = {
    kind: 'all',
    conditions: [
      group,
      group,
      { kind: 'any', conditions: Array.from({ length: 3 }, () => ({ kind: 'always' })) },
      { kind: 'always' },
    ],
  }
  p.strategy.rules[0].conditions = [sixteen, sixteen]
  localStorage.setItem(REHEARSAL_PROJECT_KEY, JSON.stringify(p))
  click('恢复本机演练')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  expect(
    (screen.getByRole('button', { name: '添加条件到规则 1' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  click('删除规则 1 条件 1.4')
  expect(
    (screen.getByRole('button', { name: '添加条件到规则 1' }) as HTMLButtonElement).disabled,
  ).toBe(false)
  click('添加条件到规则 1')
  click('保存演练到本机')
  expect(
    JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').strategy.rules[0].conditions,
  ).toHaveLength(3)
})
