import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  type CraftCatalog,
  type CraftState,
  parseCraftProject,
  statScalabilitySourceHash,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { CatalystPreviewPanel } from './CatalystPreviewPanel'
import { JewelEffectPanel } from './JewelEffectPanel'
import { RehearsalPanel } from './RehearsalPanel'
import { TargetValueEditor } from './TargetValueEditor'

vi.mock('./targetRoutesWorkerClient', () => ({ requestTargetRoutes: () => () => {} }))

const catalog: CraftCatalog = JSON.parse(
  readFileSync(
    resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../data/craft/catalog.json'),
    'utf8',
  ),
)
const state: CraftState = {
  baseId: 'Ruby',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  catalyst: { id: "Xoph's", quality: 20 },
  affixes: [
    { modId: 'JewelFireDamage', lines: ['10(5-15)% increased Fire Damage'] },
    { modId: 'JewelArmour', lines: ['10(10-20)% increased Armour'] },
    {
      modId: 'CraftedJewelPrefixEffect',
      crafted: true,
      lines: ['50(40-60)% increased Effect of Prefixes'],
    },
  ],
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('预览把增效与品质相加，保留基础值并随下一步结果重算', () => {
  const snapshot = structuredClone(state)
  const { rerender } = render(<JewelEffectPanel catalog={catalog} state={state} preview={false} />)
  const panel = within(screen.getByLabelText('珠宝词缀增效'))
  expect(panel.getByText('17% increased Fire Damage')).toBeDefined()
  expect(panel.getByText('15% increased Armour')).toBeDefined()
  expect(panel.getByRole('heading', { name: '前缀 · 合计增效 70%' })).toBeDefined()
  const next = structuredClone(state)
  const effect = next.affixes[2]
  if (!effect) throw Error('缺少测试增效')
  effect.lines = ['60(40-60)% increased Effect of Prefixes']
  rerender(<JewelEffectPanel catalog={catalog} state={next} preview />)
  expect(screen.getByText('18% increased Fire Damage')).toBeDefined()
  expect(screen.getByText(/显示待应用结果/)).toBeDefined()
  expect(state).toEqual(snapshot)
})

it('移除工艺后隐藏面板，未知掷值显示原因', () => {
  const unknown = structuredClone(state)
  const effect = unknown.affixes[2]
  if (!effect) throw Error('缺少测试增效')
  effect.lines = ['(40-60)% increased Effect of Prefixes']
  const { rerender } = render(
    <JewelEffectPanel catalog={catalog} state={unknown} preview={false} />,
  )
  expect(screen.getByLabelText('珠宝词缀增效').textContent).toMatch(/未知/)
  expect(screen.queryByText('18% increased Fire Damage')).toBeNull()
  rerender(
    <JewelEffectPanel
      catalog={catalog}
      state={{ ...state, affixes: state.affixes.slice(0, 2) }}
      preview={false}
    />,
  )
  expect(screen.queryByLabelText('珠宝词缀增效')).toBeNull()
})

it('催化比较保留没有命中催化标签的增效属性', () => {
  render(<CatalystPreviewPanel catalog={catalog} state={state} translations={{}} />)
  expect(screen.getByText('17% increased Fire Damage')).toBeDefined()
  expect(screen.getByText('15% increased Armour')).toBeDefined()
  expect(screen.getAllByText('增效与品质合并估算').length).toBeGreaterThan(0)
  fireEvent.change(screen.getByLabelText('预览品质（%）'), { target: { value: '0' } })
  expect(screen.getByText('15% increased Fire Damage')).toBeDefined()
  expect(screen.getByText('15% increased Armour')).toBeDefined()
})

it('有效目标明确口径并使用合计增效范围', () => {
  const mod = catalog.modifiers.find((entry) => entry.id === 'JewelFireDamage')
  if (!mod) throw Error('缺少测试火焰伤害')
  render(
    <TargetValueEditor
      catalog={catalog}
      baseId={state.baseId}
      state={state}
      ids={[mod.id]}
      values={[]}
      mod={mod}
      onChange={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByLabelText(`设置数值条件 ${mod.id}`))
  expect(screen.getByRole('option', { name: '增效后有效值' })).toBeDefined()
  fireEvent.change(screen.getByLabelText(`${mod.id} · 条件口径`), {
    target: { value: 'effective' },
  })
  expect(screen.getByText('数值 1 · 8 至 25')).toBeDefined()
})

it('仅选择增效目标也保存缩放来源，未执行策略仍可恢复', () => {
  const initial: CraftState = {
    baseId: 'Ruby',
    itemLevel: 86,
    rarity: 'normal',
    sourceText: null,
    affixes: [],
  }
  render(<RehearsalPanel catalog={catalog} initialState={initial} translations={{}} />)
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), {
    target: { value: 'CraftedJewelPrefixEffect' },
  })
  fireEvent.click(screen.getByLabelText('加入目标 CraftedJewelPrefixEffect'))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(screen.getByLabelText('演练项目').textContent).toContain('演练项目已保存到本机')
  const read = () => JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(read().scalabilitySourceHash).toBe(statScalabilitySourceHash(catalog))
  expect(parseCraftProject(JSON.stringify(read()), catalog).ok).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '启用条件指引示例' }))
  fireEvent.change(screen.getByLabelText('规则 4 动作'), { target: { value: 'liquid-emotion' } })
  fireEvent.change(screen.getByLabelText('规则 4 液态情感'), {
    target: { value: 'Metadata/Items/Currency/EndgameDistilledEmotion2' },
  })
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(parseCraftProject(JSON.stringify(read()), catalog).ok).toBe(true)
})

it('无名称的增效工艺在神圣草稿中有独立数值标签', () => {
  render(<RehearsalPanel catalog={catalog} initialState={state} translations={{}} />)
  fireEvent.click(screen.getByRole('button', { name: '神圣石' }))
  expect(screen.getByLabelText('CraftedJewelPrefixEffect · 数值 1')).toBeDefined()
})
