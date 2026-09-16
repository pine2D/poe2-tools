import type { DefinitionCraftStrategy } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { catalog, state } from '../../../../packages/item-core/src/partialTargetFixture'
import { CraftStrategyPanel } from './CraftStrategyPanel'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

it('副本保留嵌套目标和阶段去向，插入原规则后并聚焦，编辑不改变原规则', () => {
  let strategy: DefinitionCraftStrategy | undefined = {
    maxSteps: 50,
    flow: {
      entryStageId: 'a',
      stages: [
        { id: 'a', name: '准备' },
        { id: 'b', name: '完成' },
      ],
    },
    rules: [
      {
        stageId: 'a',
        nextStageId: 'b',
        onBlockedStageId: 'b',
        conditions: [
          {
            kind: 'all',
            conditions: [
              { kind: 'selected-targets', targetIds: ['t9'], min: 1, value: false },
              { kind: 'rarity', value: 'normal' },
            ],
          },
        ],
        action: { kind: 'currency', currency: 'transmutation' },
      },
      { stageId: 'b', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
    ],
  }
  const original = structuredClone(strategy.rules[0])
  const props = {
    catalog: catalog(),
    state: state('normal'),
    stageId: 'a',
    goals: {
      definitions: {
        nextTargetId: 10,
        targets: [{ targetId: 't9', modId: 'p1' }],
        alternatives: [],
        values: [],
      },
    },
    orphanedTargets: [],
    appliedSteps: 0,
    pending: false,
    omenLabel: (id: string) => id,
    onStart: vi.fn(),
  }
  const onChange = (next: DefinitionCraftStrategy | undefined) => {
    strategy = next
    view.rerender(<CraftStrategyPanel {...props} strategy={strategy} onChange={onChange} />)
  }
  const view = render(<CraftStrategyPanel {...props} strategy={strategy} onChange={onChange} />)
  fireEvent.click(screen.getByText('编辑条件规则（2 条）'))
  click('复制规则 1')
  expect(strategy?.rules).toHaveLength(3)
  expect(strategy?.rules[1]).toEqual(original)
  expect(strategy?.rules[1]).not.toBe(strategy?.rules[0])
  expect(strategy?.rules[1]?.action).not.toBe(strategy?.rules[0]?.action)
  expect(strategy?.rules[1]?.conditions[0]).not.toBe(strategy?.rules[0]?.conditions[0])
  expect(strategy?.rules[2]?.stageId).toBe('b')
  expect(document.activeElement?.querySelector('legend')?.textContent).toBe('规则 2')
  change('规则 2 条件 1.2 稀有度', 'magic')
  expect(strategy?.rules[0]).toEqual(original)
  expect(strategy?.rules[1]).not.toEqual(original)
  expect(props.onStart).not.toHaveBeenCalled()
  expect(screen.getByText(/命中规则 1：/)).toBeDefined()
})

it('复制遵守十二条上限，删除后可继续复制', () => {
  render(<RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />)
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  for (let n = 4; n < 12; n++) click('复制规则 1')
  const copies = screen.getAllByRole('button', { name: /^复制规则 / }) as HTMLButtonElement[]
  expect(copies).toHaveLength(12)
  expect(copies.every((button) => button.disabled)).toBe(true)
  click('删除规则 2')
  expect((screen.getByRole('button', { name: '复制规则 1' }) as HTMLButtonElement).disabled).toBe(
    false,
  )
  click('复制规则 1')
  click('保存演练到本机')
  expect(
    JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').strategy.rules,
  ).toHaveLength(12)
})

it('复制后保存恢复保留完整未来历史，副本可独立改为下一阶段动作', () => {
  render(<RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />)
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  click('开始指引步骤')
  fireEvent.click(within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: /p1/ }))
  click('应用本次结果')
  click('撤销')
  click('保存演练到本机')
  const before = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  click('复制规则 2')
  change('规则 3 稀有度', 'magic')
  change('规则 3 动作', 'regal')
  click('保存演练到本机')
  const copied = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(copied.cursor).toBe(0)
  expect(copied.operations).toEqual(before.operations)
  expect(copied.strategy.rules[2]).toEqual({
    conditions: [{ kind: 'rarity', value: 'magic' }],
    action: { kind: 'currency', currency: 'regal' },
  })
  click('删除规则 3')
  click('恢复本机演练')
  click('重做')
  expect(screen.getByText(/命中规则 3：/)).toBeDefined()
  click('保存演练到本机')
  const restored = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(restored.strategy).toEqual(copied.strategy)
  expect(restored.operations).toEqual(before.operations)
  expect(restored.cursor).toBe(1)
})

it('在非入口阶段的未应用草稿中复制会清除草稿并从当前游标重启', () => {
  render(<RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />)
  click('启用条件指引示例')
  click('启用分阶段流程')
  click('添加阶段')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 2 应用后阶段', 'stage-2')
  change('规则 3 所属阶段', 'stage-2')
  click('开始指引步骤')
  fireEvent.click(within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: /p1/ }))
  click('应用本次结果')
  expect(screen.getByText('当前阶段：阶段 2')).toBeDefined()
  click('保存演练到本机')
  const before = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  click('开始指引步骤')
  expect(screen.getByLabelText('本次指定结果')).toBeDefined()
  click('复制规则 3')
  expect(screen.queryByLabelText('本次指定结果')).toBeNull()
  expect(screen.getByText('当前阶段：阶段 1')).toBeDefined()
  click('保存演练到本机')
  const after = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(after.strategyStartStep).toBe(1)
  expect(after.cursor).toBe(before.cursor)
  expect(after.operations).toEqual(before.operations)
  expect(after.strategy.rules[3]).toEqual(before.strategy.rules[2])
})
