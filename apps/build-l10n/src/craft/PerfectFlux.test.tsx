import {
  type CatalogBase,
  type CraftCatalog,
  type CraftState,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftItemTextPanel } from './CraftItemTextPanel'
import { PerfectFluxPanel } from './PerfectFluxPanel'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const base: CatalogBase = {
  id: 'Test Sceptre',
  name: 'Test Sceptre',
  type: 'Sceptre',
  tags: ['default', 'sceptre'],
  requirements: {},
  properties: {},
  implicit: 'Grants Skill: Level (1-20) Test Minion',
  implicitTags: [],
  sourceQuality: 20,
  socketLimit: 3,
  hidden: false,
  runeforged: false,
}
const catalog: CraftCatalog = {
  bases: [base],
  modifiers: [],
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    excludedBases: [],
    sources: [],
  },
}
const state = (line = 'Grants Skill: Level 12 Test Minion (Max Level 13)'): CraftState => ({
  baseId: base.id,
  itemLevel: 53,
  rarity: 'normal',
  affixes: [],
  implicitLines: [line],
  sourceText: null,
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const setup = (initialState = state()) =>
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initialState}
      translations={{ 'Perfect Flux': '完美溶剂' }}
    />,
  )
function save() {
  click('保存演练到本机')
  return JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
}
afterEach(() => {
  cleanup()
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'locks')
})

it('明确最高等级可预览取消不计费，应用仅升装备技能并保存未来、撤销和恢复', () => {
  setup()
  click('预览完美溶剂结果')
  expect(screen.getByLabelText('完美溶剂待应用结果').textContent).toContain('13 → 20')
  click('展开前后变化')
  expect(screen.getByLabelText('装备技能最高等级变化').textContent).toContain('13 → 20')
  expect(save().operations).toEqual([])
  click('取消完美溶剂结果')
  expect(screen.getByText('尚未消耗通货')).toBeDefined()
  fireEvent.change(screen.getByLabelText('搜索报价材料'), { target: { value: '完美溶剂' } })
  click('添加报价 完美溶剂')
  fireEvent.change(screen.getByLabelText('完美溶剂单价'), { target: { value: '2.5' } })
  fireEvent.change(screen.getByLabelText('起点成本'), { target: { value: '0' } })
  click('应用报价')
  click('预览完美溶剂结果')
  click('应用完美溶剂结果')
  expect(screen.getByLabelText('当前装备技能结果').textContent).toContain('20')
  expect(screen.getByText('角色当前使用等级未计算。')).toBeDefined()
  expect(within(screen.getByLabelText('当前固有属性')).getByText('导入／起点观察')).toBeDefined()
  expect(screen.getByText('完美溶剂 × 1')).toBeDefined()
  expect(screen.getByLabelText('当前总成本').textContent).toContain('2.5')
  const saved = save()
  expect(saved.rulesVersion).toBe('basic-2026-09-16-v76')
  expect(saved.pricing.prices['currency:perfect-flux']).toBe(2.5)
  expect(saved.operations).toEqual([{ kind: 'perfect-flux', previousMaxLevel: 13 }])
  expect(saved.initialState.grantedSkillLevel).toBeUndefined()
  const loaded = parseTargetCraftProject(JSON.stringify(saved), catalog)
  expect(loaded.ok).toBe(true)
  if (loaded.ok) expect(loaded.value.states[1]?.grantedSkillLevel).toBe(20)
  click('撤销')
  expect(screen.queryByLabelText('当前装备技能结果')).toBeNull()
  const future = save()
  expect(future.cursor).toBe(0)
  expect(future.operations).toEqual(saved.operations)
  click('恢复本机演练')
  click('重做')
  expect(screen.getByLabelText('当前装备技能结果').textContent).toContain('20')
  fireEvent.change(screen.getByLabelText('装备文本语言'), { target: { value: 'en' } })
  click('导出装备文本')
  expect(screen.queryByRole('textbox', { name: '演练装备英文文本' })).toBeNull()
  expect(within(screen.getByLabelText('演练装备文本导出')).getByRole('alert').textContent).toMatch(
    /项目/,
  )
})

it.each(['Grants Skill: Level 12 Test Minion', 'Grants Skill: Level (1-20) Test Minion'])(
  '无最高等级主动声明前不能预览：%s',
  (line) => {
    setup(state(line))
    const declaration = screen.getByLabelText('操作前装备技能最高等级') as HTMLInputElement
    expect(declaration.value).toBe('')
    expect(
      (screen.getByRole('button', { name: '预览完美溶剂结果' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.change(declaration, { target: { value: '13' } })
    click('预览完美溶剂结果')
    click('应用完美溶剂结果')
    expect(save().operations).toEqual([{ kind: 'perfect-flux', previousMaxLevel: 13 }])
    click('撤销')
    expect((screen.getByLabelText('操作前装备技能最高等级') as HTMLInputElement).value).toBe('')
  },
)

it('明确最高20不可消费；无新能力仍保存旧规则', () => {
  setup(state('Grants Skill: Level 20 Test Minion (Max Level 20)'))
  expect(screen.queryByRole('button', { name: '预览完美溶剂结果' })).toBeNull()
  expect(save().rulesVersion).toBe('basic-2026-09-12-v74')
})

it('条件指引可声明最高等级并预览应用，装备技能条件成为停止条件', () => {
  setup()
  click('启用条件指引示例')
  fireEvent.change(screen.getByLabelText('规则 1 条件 1'), {
    target: { value: 'granted-skill-level' },
  })
  fireEvent.change(screen.getByLabelText('规则 1 条件 1 技能等级下限'), { target: { value: '20' } })
  fireEvent.change(screen.getByLabelText('规则 1 条件 1 技能等级上限'), { target: { value: '20' } })
  fireEvent.change(screen.getByLabelText('规则 2 动作'), { target: { value: 'perfect-flux' } })
  expect(save().strategy.rules[1].action).toEqual({ kind: 'perfect-flux', previousMaxLevel: 13 })
  click('开始指引步骤')
  expect(screen.getByLabelText('指引结果选择').textContent).toContain('指引声明')
  click('预览完美溶剂结果')
  click('取消完美溶剂结果')
  expect(save().operations).toEqual([])
  click('开始指引步骤')
  click('预览完美溶剂结果')
  click('应用完美溶剂结果')
  expect(save().operations).toEqual([{ kind: 'perfect-flux', previousMaxLevel: 13 }])
  expect(screen.queryByRole('button', { name: '开始指引步骤' })).toBeNull()
})

it('未知最高等级的指引动作不默认声明，输入后才写入规则', () => {
  setup(state('Grants Skill: Level 12 Test Minion'))
  click('启用条件指引示例')
  fireEvent.change(screen.getByLabelText('规则 2 动作'), { target: { value: 'perfect-flux' } })
  const declaration = screen.getByLabelText('规则 2 操作前装备技能最高等级') as HTMLInputElement
  expect(declaration.value).toBe('')
  expect(save().strategy.rules[1].action.kind).toBe('currency')
  fireEvent.change(declaration, { target: { value: '11' } })
  expect(save().strategy.rules[1].action.kind).toBe('currency')
  fireEvent.change(declaration, { target: { value: '13' } })
  expect(save().strategy.rules[1].action).toEqual({ kind: 'perfect-flux', previousMaxLevel: 13 })
})

it('声明必须在观察等级至19内；装备变更清空草稿，受控配置不得绕过最高级核对', () => {
  const onPreview = vi.fn()
  const props = { catalog, disabled: false, onPreview }
  const view = render(
    <PerfectFluxPanel {...props} state={state('Grants Skill: Level 12 Test Minion')} />,
  )
  const declaration = screen.getByLabelText('操作前装备技能最高等级')
  for (const value of ['11', '20', '12.5']) {
    fireEvent.change(declaration, { target: { value } })
    expect(
      (screen.getByRole('button', { name: '预览完美溶剂结果' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  }
  fireEvent.change(declaration, { target: { value: '13' } })
  click('预览完美溶剂结果')
  expect(onPreview).toHaveBeenCalledExactlyOnceWith({ kind: 'perfect-flux', previousMaxLevel: 13 })
  view.rerender(<PerfectFluxPanel {...props} state={state('Grants Skill: Level 14 Test Minion')} />)
  expect((screen.getByLabelText('操作前装备技能最高等级') as HTMLInputElement).value).toBe('')
  view.rerender(
    <PerfectFluxPanel {...props} state={state()} configuration={{ previousMaxLevel: 14 }} />,
  )
  expect(
    (screen.getByRole('button', { name: '预览完美溶剂结果' }) as HTMLButtonElement).disabled,
  ).toBe(true)
})

it('升级后所有文本语言直接解释项目出口，不为无法导出的格式请求词典', () => {
  const fetchImpl = vi.fn(async () => {
    throw new Error('不应请求词典')
  })
  render(
    <CraftItemTextPanel
      catalog={catalog}
      state={{ ...state(), grantedSkillLevel: 20 }}
      pending={false}
      fetchImpl={fetchImpl}
    />,
  )
  click('导出装备文本')
  for (const locale of ['zh-CN', 'zh-TW', 'en']) {
    fireEvent.change(screen.getByLabelText('装备文本语言'), { target: { value: locale } })
    expect(screen.getByRole('alert').textContent).toMatch(/项目/)
    expect(screen.queryByRole('textbox')).toBeNull()
  }
  expect(fetchImpl).not.toHaveBeenCalled()
})

it('v76 文件与收藏恢复保留未来，沿用指引到新起点不带入技能结果或消费', async () => {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, callback: () => unknown) => callback() },
  })
  const view = setup()
  click('启用条件指引示例')
  fireEvent.change(screen.getByLabelText('规则 2 动作'), { target: { value: 'perfect-flux' } })
  click('预览完美溶剂结果')
  click('应用完美溶剂结果')
  click('撤销')
  const golden = save()
  expect(golden.cursor).toBe(0)
  expect(golden.operations).toHaveLength(1)
  const file = new File([JSON.stringify(golden)], 'perfect-flux.craft.json', {
    type: 'application/json',
  })
  await act(async () => {
    fireEvent.change(screen.getByLabelText('选择演练项目文件'), { target: { files: [file] } })
  })
  expect(save()).toEqual(golden)
  fireEvent.click(screen.getByText('演练收藏'))
  fireEvent.change(screen.getByLabelText('收藏名称'), { target: { value: '完美溶剂未来' } })
  await act(async () => {
    click('收藏当前演练')
  })
  click('重做')
  expect(screen.getByLabelText('当前装备技能结果')).toBeDefined()
  click('恢复收藏 完美溶剂未来')
  expect(save()).toEqual(golden)
  view.unmount()
  setup()
  fireEvent.click(screen.getByText('演练收藏'))
  click('沿用收藏方案 完美溶剂未来')
  click('应用收藏方案')
  const reused = save()
  expect(reused.rulesVersion).toBe('basic-2026-09-16-v76')
  expect(reused.operations).toEqual([])
  expect(reused.cursor).toBe(0)
  expect(reused.initialState.grantedSkillLevel).toBeUndefined()
  expect(reused.strategy).toEqual(golden.strategy)
  expect(screen.queryByLabelText('当前装备技能结果')).toBeNull()
  click('开始指引步骤')
  click('预览完美溶剂结果')
  click('应用完美溶剂结果')
  expect(save().operations).toEqual([{ kind: 'perfect-flux', previousMaxLevel: 13 }])
})
