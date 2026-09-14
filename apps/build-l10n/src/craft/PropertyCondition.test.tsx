import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import {
  catalog as makeCatalog,
  mod,
} from '../../../../packages/item-core/src/partialTargetFixture'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog = makeCatalog(
  [
    mod('LocalAddedPhysicalDamage1', 'prefix', {
      group: 'LocalPhysicalDamage',
      lines: ['Adds (1-2) to (4-5) Physical Damage'],
      eligibility: [{ tag: 'default', value: 1 }],
    }),
  ],
  {
    id: 'Crude Bow',
    name: 'Crude Bow',
    type: 'Bow',
    tags: ['default', 'weapon', 'twohand'],
    properties: { PhysicalMin: 6, PhysicalMax: 9, AttackRateBase: 1.2, CritChanceBase: 5 },
    sourceQuality: 20,
  },
)
catalog._meta.sources = [
  { path: 'src/Data/ModRunes.lua', url: 'https://example.test/runes', sha256: 'b'.repeat(64) },
]

afterEach(() => {
  cleanup()
  localStorage.clear()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
it('编辑面板范围先应用，制作后停止，撤销和项目恢复重新判断', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={{
        baseId: 'Crude Bow',
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        quality: 0,
        sockets: [],
        sourceText: null,
      }}
    />,
  )
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 1 条件 1', 'item-property')
  expect(screen.getByText('当前估算：9')).toBeDefined()
  change('规则 1 条件 1 面板下限', '10')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('应用规则 1 条件 1面板范围')
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  click('开始指引步骤')
  change('搜索合法词缀', 'LocalAddedPhysicalDamage1')
  fireEvent.click(screen.getByRole('button', { name: /LocalAddedPhysicalDamage1 ·/ }))
  click('应用本次结果')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v63')
  expect(saved.strategy.rules[0].conditions[0]).toEqual({
    kind: 'item-property',
    property: 'physicalDps',
    min: 10,
  })
  click('撤销')
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('添加条件到规则 1')
  const selector = screen.getByLabelText('规则 1 条件 2') as HTMLSelectElement
  expect(selector.querySelector<HTMLOptionElement>('option[value="item-property"]')?.disabled).toBe(
    false,
  )
  change('规则 1 条件 2', 'item-property')
  change('规则 1 条件 2 面板指标', 'attackSpeed')
  expect(screen.getByText('当前估算：1.2')).toBeDefined()
  click('保存演练到本机')
  const multiple = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(multiple.strategy.rules[0].conditions[1]).toEqual({
    kind: 'item-property',
    property: 'attackSpeed',
    min: 0,
  })
  change('规则 1 条件 1 面板下限', '20')
  click('恢复本机演练')
  expect((screen.getByLabelText('规则 1 条件 1 面板下限') as HTMLInputElement).value).toBe('10')
  change('规则 1 条件 1 面板上限', '5')
  expect(
    (screen.getByRole('button', { name: '应用规则 1 条件 1面板范围' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  expect(screen.getByRole('alert').textContent).toContain('范围')
})
