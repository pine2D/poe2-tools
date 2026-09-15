import { type DefinitionCraftStrategy, readDefinitionCraftStrategy } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { catalog, state } from '../../../../packages/item-core/src/partialTargetFixture'
import { CraftStrategyPanel } from './CraftStrategyPanel'
import { StrategyFlowCanvas } from './StrategyFlowCanvas'

afterEach(cleanup)
const definitions = {
  nextTargetId: 20,
  targets: [{ targetId: 't9', modId: 'p1' }],
  alternatives: [],
  values: [],
}
const selected = (targetId: string): DefinitionCraftStrategy => ({
  maxSteps: 20,
  rules: [
    {
      conditions: [{ kind: 'selected-targets', targetIds: [targetId], min: 1, value: true }],
      action: { kind: 'stop' },
    },
  ],
})

it('同类型新目标保持未选，旧引用显示原词缀且必须明确替换才解除阻塞', () => {
  let strategy: DefinitionCraftStrategy | undefined = selected('t2')
  const props = {
    catalog: catalog(),
    state: state('rare', ['p1']),
    goals: { definitions },
    orphanedTargets: [{ targetId: 't2', modId: 'p1' }],
    appliedSteps: 0,
    pending: false,
    omenLabel: (id: string) => id,
    onStart: vi.fn(),
    translateLine: (line: string) => line.replace('p1', '生命'),
  }
  const onChange = (next: DefinitionCraftStrategy | undefined) => {
    strategy = next
    view.rerender(<CraftStrategyPanel {...props} strategy={strategy} onChange={onChange} />)
  }
  const view = render(<CraftStrategyPanel {...props} strategy={strategy} onChange={onChange} />)
  expect(screen.getByText(/规则 1 无法开始：规则引用的目标已移除：t2/)).toBeDefined()
  const old = screen.getByLabelText('规则 1 条件 1 目标 t2') as HTMLInputElement
  const active = screen.getByLabelText('规则 1 条件 1 目标 t9') as HTMLInputElement
  expect(old.checked).toBe(true)
  expect(active.checked).toBe(false)
  expect(old.closest('label')?.textContent).toContain('p1')
  expect(old.closest('label')?.textContent).toContain('生命')
  expect(old.closest('label')?.textContent).toContain('已从目标区移除')
  fireEvent.click(active)
  expect(screen.getByText(/规则 1 无法开始/)).toBeDefined()
  fireEvent.click(screen.getByLabelText('规则 1 条件 1 目标 t2'))
  expect(strategy?.rules[0]?.conditions).toEqual([
    { kind: 'selected-targets', targetIds: ['t9'], min: 1, value: true },
  ])
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  expect(props.onStart).not.toHaveBeenCalled()
})

it('新增子集条件使用当前稳定目标ID，重排不改变已有选择', () => {
  let strategy: DefinitionCraftStrategy | undefined = {
    maxSteps: 20,
    rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
  }
  const props = {
    catalog: catalog(),
    state: state('normal'),
    goals: { definitions },
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
  fireEvent.change(screen.getByLabelText('规则 1 条件 1'), {
    target: { value: 'selected-targets' },
  })
  expect(strategy?.rules[0]?.conditions).toEqual([
    { kind: 'selected-targets', targetIds: ['t9'], min: 1, value: true },
  ])
  view.rerender(
    <CraftStrategyPanel
      {...props}
      goals={{
        definitions: {
          ...definitions,
          targets: [{ targetId: 't15', modId: 's1' }, ...definitions.targets],
        },
      }}
      strategy={strategy}
      onChange={onChange}
    />,
  )
  expect((screen.getByLabelText('规则 1 条件 1 目标 t9') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('规则 1 条件 1 目标 t15') as HTMLInputElement).checked).toBe(false)
})

it('画布以完整新策略校验改线，保留tN引用和真实通货动作', () => {
  let strategy: DefinitionCraftStrategy = {
    ...selected('t9'),
    flow: {
      entryStageId: 'a',
      stages: [
        { id: 'a', name: '起步' },
        { id: 'b', name: '完成' },
      ],
    },
    rules: [
      {
        stageId: 'a',
        conditions: [{ kind: 'selected-targets', targetIds: ['t9'], min: 1, value: false }],
        action: { kind: 'currency', currency: 'chaos' },
      },
    ],
  }
  const onChange = (next: DefinitionCraftStrategy) => {
    strategy = next
    view.rerender(
      <StrategyFlowCanvas
        strategy={strategy}
        stageId="a"
        decision={null}
        ruleLabels={['混沌石']}
        onChange={onChange}
        onEditRule={vi.fn()}
      />,
    )
  }
  const view = render(
    <StrategyFlowCanvas
      strategy={strategy}
      stageId="a"
      decision={null}
      ruleLabels={['混沌石']}
      onChange={onChange}
      onEditRule={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '连接规则 1 的应用后路线' }))
  fireEvent.click(screen.getByRole('button', { name: '画布阶段 b：完成' }))
  expect(strategy.rules[0]).toEqual({
    stageId: 'a',
    nextStageId: 'b',
    conditions: [{ kind: 'selected-targets', targetIds: ['t9'], min: 1, value: false }],
    action: { kind: 'currency', currency: 'chaos' },
  })
  expect(readDefinitionCraftStrategy(strategy).ok).toBe(true)
})

it('非当前阶段的反向嵌套引用也保留旧目标身份与元数据', () => {
  const strategy: DefinitionCraftStrategy = {
    maxSteps: 20,
    flow: {
      entryStageId: 'a',
      stages: [
        { id: 'a', name: '起步' },
        { id: 'b', name: '完成' },
      ],
    },
    rules: [
      { stageId: 'a', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
      {
        stageId: 'b',
        conditions: [
          {
            kind: 'not',
            condition: {
              kind: 'all',
              conditions: [{ kind: 'selected-targets', targetIds: ['t2'], min: 1, value: false }],
            },
          },
        ],
        action: { kind: 'stop' },
      },
    ],
  }
  render(
    <CraftStrategyPanel
      catalog={catalog()}
      state={state('rare', ['p1'])}
      goals={{ definitions }}
      orphanedTargets={[{ targetId: 't2', modId: 'p1' }]}
      strategy={strategy}
      stageId="a"
      appliedSteps={0}
      pending={false}
      omenLabel={(id) => id}
      onChange={vi.fn()}
      onStart={vi.fn()}
    />,
  )
  expect(screen.getByText(/规则引用的目标已移除：t2/)).toBeDefined()
  const old = screen.getByLabelText('规则 2 条件 1.1.1 目标 t2') as HTMLInputElement
  expect(old.checked).toBe(true)
  expect(old.closest('label')?.textContent).toContain('p1')
  expect(old.closest('label')?.textContent).toContain('已从目标区移除')
  expect((screen.getByLabelText('规则 2 条件 1.1.1 目标 t9') as HTMLInputElement).checked).toBe(
    false,
  )
})
