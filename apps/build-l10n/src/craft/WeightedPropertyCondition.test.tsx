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
it('加权合计草稿显式应用，制作后停止，完整未来随 v98 保存恢复', () => {
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
  change('规则 1 条件 1', 'weighted-properties')
  expect(screen.getByText('当前已应用合计：9')).toBeDefined()
  change('规则 1 条件 1 第 1 项系数', '2')
  change('规则 1 条件 1 合计下限', '20')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('应用规则 1 条件 1加权条件')
  expect(screen.getByText('当前已应用合计：18')).toBeDefined()
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  click('开始指引步骤')
  change('搜索合法词缀', 'LocalAddedPhysicalDamage1')
  fireEvent.click(screen.getByRole('button', { name: /LocalAddedPhysicalDamage1 ·/ }))
  click('应用本次结果')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('撤销')
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-17-v98')
  expect(saved.cursor).toBe(0)
  expect(saved.operations).toHaveLength(1)
  expect(saved.strategy.rules[0].conditions[0]).toEqual({
    kind: 'weighted-properties',
    terms: [{ property: 'physicalDps', weight: 2 }],
    min: 20,
  })
  change('规则 1 条件 1 第 1 项系数', '0')
  expect(
    (screen.getByRole('button', { name: '应用规则 1 条件 1加权条件' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  click('恢复本机演练')
  expect((screen.getByLabelText('规则 1 条件 1 第 1 项系数') as HTMLInputElement).value).toBe('2')
  click('重做')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
})

it('多指标增删、负系数与未知项不静默代零，非法草稿不覆盖条件', () => {
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
  change('规则 1 条件 1', 'weighted-properties')
  click('规则 1 条件 1 添加指标')
  change('规则 1 条件 1 第 2 项指标', 'attackSpeed')
  change('规则 1 条件 1 第 2 项系数', '-2')
  change('规则 1 条件 1 合计下限', '-10')
  click('应用规则 1 条件 1加权条件')
  expect(screen.getByText('当前已应用合计：6.6')).toBeDefined()
  change('规则 1 条件 1 第 2 项指标', 'EnergyShield')
  click('应用规则 1 条件 1加权条件')
  expect(screen.getByText(/当前合计无法判断：/)).toBeDefined()
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  change('规则 1 条件 1 合计上限', '-11')
  expect(
    (screen.getByRole('button', { name: '应用规则 1 条件 1加权条件' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  change('规则 1 条件 1 合计上限', '')
  click('规则 1 条件 1 删除第 2 项')
  click('应用规则 1 条件 1加权条件')
  expect(screen.getByText('当前已应用合计：9')).toBeDefined()
})
