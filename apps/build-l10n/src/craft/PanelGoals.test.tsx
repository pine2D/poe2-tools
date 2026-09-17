import {
  type CraftState,
  createCraftItemDictionary,
  exportCraftItemText,
  importCraftState,
  inspectItem,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import {
  catalog as makeCatalog,
  mod,
} from '../../../../packages/item-core/src/partialTargetFixture'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog = makeCatalog(
  [
    mod('LocalPhysicalDamage1', 'prefix', {
      group: 'LocalPhysicalDamagePercent',
      lines: ['(10-20)% increased Physical Damage'],
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

function setup(quality?: number, withAffix = false) {
  const affixes: CraftState['affixes'] = withAffix
    ? [{ modId: 'LocalPhysicalDamage1', lines: ['15(10-20)% increased Physical Damage'] }]
    : []
  let initialState: CraftState = {
    baseId: 'Crude Bow',
    itemLevel: 86,
    rarity: withAffix ? 'magic' : 'normal',
    affixes,
    sockets: [],
    sourceText: null,
    ...(quality === undefined ? {} : { quality }),
  }
  if (withAffix) {
    const text = exportCraftItemText(catalog, initialState)
    if (!text.ok) throw Error(text.error)
    const parsed = parseItem(text.value.text)
    if (!parsed.ok) throw Error(parsed.error)
    const imported = importCraftState(
      catalog,
      initialState.baseId,
      parsed.item,
      inspectItem(parsed.item, createCraftItemDictionary(catalog)),
    )
    if (!imported.ok) throw Error(imported.error)
    initialState = imported.value
  }
  render(<RehearsalPanel catalog={catalog} translations={{}} initialState={initialState} />)
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })

afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('纯面板目标可编辑阈值并开放路线入口，未应用输入不改变已保存条件', () => {
  setup(0)
  const region = screen.getByRole('region', { name: '面板目标' })
  click('添加面板目标')
  change('面板目标 1 面板指标', 'physicalDps')
  change('面板目标 1 面板下限', '10')
  expect(within(region).getByText(/编辑值尚未应用/)).toBeTruthy()
  click('应用面板目标 1面板范围')
  expect(within(region).getByText('尚未达成')).toBeTruthy()
  expect(
    (screen.getByRole('button', { name: '生成多步示例路线' }) as HTMLButtonElement).disabled,
  ).toBe(false)
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-18-v114')
  expect(saved.targetDefinitions.targets).toEqual([])
  expect(saved.targetDefinitions.panelGoals).toEqual([
    { kind: 'item-property', property: 'physicalDps', min: 10 },
  ])
  change('面板目标 1 面板下限', '20')
  click('恢复本机演练')
  expect((screen.getByLabelText('面板目标 1 面板下限') as HTMLInputElement).value).toBe('10')
  click('移除面板目标 1')
  expect(
    (screen.getByRole('button', { name: '生成多步示例路线' }) as HTMLButtonElement).disabled,
  ).toBe(true)
})

it('未知品质不会显示面板目标已达成或用零值代替', () => {
  setup()
  const region = screen.getByRole('region', { name: '面板目标' })
  click('添加面板目标')
  change('面板目标 1 面板指标', 'physicalDps')
  expect(within(region).getByText(/无法判断/)).toBeTruthy()
  expect(within(region).queryByText('已达成')).toBeNull()
})

it('指出已应用目标的范围冲突，草稿修改不提前消除警告', () => {
  setup(0)
  click('添加面板目标')
  change('面板目标 1 面板指标', 'physicalDps')
  change('面板目标 1 面板下限', '20')
  click('应用面板目标 1面板范围')
  click('添加面板目标')
  change('面板目标 2 面板指标', 'physicalDps')
  change('面板目标 2 面板上限', '10')
  click('应用面板目标 2面板范围')
  const region = screen.getByRole('region', { name: '面板目标' })
  expect(within(region).getByRole('alert').textContent).toMatch(/面板目标 1 与面板目标 2.*没有交集/)
  change('面板目标 2 面板上限', '30')
  expect(within(region).getByRole('alert')).toBeTruthy()
  click('应用面板目标 2面板范围')
  expect(within(region).queryByRole('alert')).toBeNull()
})

it('从装备提取显式目标保留已应用的面板条件', () => {
  setup(0, true)
  click('添加面板目标')
  change('面板目标 1 面板指标', 'physicalDps')
  change('面板目标 1 面板下限', '20')
  click('应用面板目标 1面板范围')
  click('从当前装备提取目标')
  click('用所选词缀替换显式目标')
  expect((screen.getByLabelText('面板目标 1 面板下限') as HTMLInputElement).value).toBe('20')
  click('保存演练到本机')
  expect(
    localStorage.getItem(REHEARSAL_PROJECT_KEY),
    screen
      .queryAllByRole('status')
      .map((element) => element.textContent)
      .join('\n'),
  ).not.toBeNull()
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.targetDefinitions.targets).toHaveLength(1)
  expect(saved.targetDefinitions.panelGoals).toEqual([
    { kind: 'item-property', property: 'physicalDps', min: 20 },
  ])
})

it('加权面板目标复用公式编辑与原子应用，保存后保持系数和区间', () => {
  setup(0)
  click('添加加权面板目标')
  change('面板目标 1 第 1 项指标', 'physicalDps')
  change('面板目标 1 第 1 项系数', '2')
  change('面板目标 1 合计下限', '20')
  click('应用面板目标 1加权条件')
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.targetDefinitions.panelGoals).toEqual([
    { kind: 'weighted-properties', terms: [{ property: 'physicalDps', weight: 2 }], min: 20 },
  ])
})
