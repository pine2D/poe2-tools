import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import {
  catalog as makeCatalog,
  mod,
} from '../../../../packages/item-core/src/partialTargetFixture'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
it('抗性面板预览、条件达标停止、撤销与恢复使用同一数值', () => {
  const catalog = makeCatalog(
    [
      mod('fire', 'suffix', {
        lines: ['+(10-20)% to Fire Resistance'],
        eligibility: [{ tag: 'default', value: 1 }],
      }),
    ],
    { id: 'Ring', name: 'Ring', type: 'Ring', tags: ['default', 'ring'] },
  )
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={{
        baseId: 'Ring',
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
      }}
    />,
  )
  const panel = () => within(screen.getByRole('region', { name: '装备抗性合计' }))
  expect(panel().getAllByText('0%')).toHaveLength(5)
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 1 条件 1', 'item-property')
  change('规则 1 条件 1 面板指标', 'elementalResistance')
  change('规则 1 条件 1 面板下限', '10')
  click('应用规则 1 条件 1面板范围')
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  click('开始指引步骤')
  fireEvent.click(screen.getByRole('button', { name: /fire ·/ }))
  expect(panel().getAllByText('应用后预计：0% → 10%')).toHaveLength(2)
  click('应用本次结果')
  expect(panel().getAllByText('10%')).toHaveLength(2)
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v56')
  expect(saved.strategy.rules[0].conditions[0].property).toBe('elementalResistance')
  click('撤销')
  expect(panel().getAllByText('0%')).toHaveLength(5)
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  click('恢复本机演练')
  expect(panel().getAllByText('10%')).toHaveLength(2)
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
})
