import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  createCraftItemDictionary,
  exportCraftItemText,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const dictionary = createCraftItemDictionary(catalog, {})
const translations = { 'Vaal Orb': '瓦尔石', "Architect's Orb": '建筑师宝珠' }
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const select = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
function save() {
  click('保存演练到本机')
  return JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
}
function setup(imported = false) {
  const base = catalog.bases.find((base) => base.id === (imported ? 'Gold Ring' : 'Crude Bow'))
  if (!base) throw new Error('缺少基底')
  const output = imported
    ? exportCraftItemText(catalog, {
        baseId: base.id,
        itemLevel: 86,
        rarity: 'magic',
        sourceText: null,
        affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }],
      })
    : null
  if (output && !output.ok) throw new Error(output.error)
  const parsed = output?.ok ? parseItem(output.value.text) : null
  if (parsed && !parsed.ok) throw new Error(parsed.error)
  const inspection = parsed?.ok ? inspectItem(parsed.item, dictionary) : null
  const view = render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={86}
      translations={translations}
      dictionary={dictionary}
      translateLine={undefined}
      imported={
        parsed?.ok && inspection
          ? {
              baseId: base.id,
              item: parsed.item,
              mods: inspection.mods,
              skills: inspection.skills,
              runes: inspection.runes,
              comparisonOnly: inspection.comparisonOnly,
            }
          : undefined
      }
      onRestore={vi.fn()}
    />,
  )
  click(imported ? '从当前装备开始' : '从空白基底开始')
  return view
}
function configure() {
  click('启用条件指引示例')
  for (const [number, value, action] of [
    [1, 'twice', 'stop'],
    [2, 'none', 'vaal'],
    [3, 'once', 'architect'],
  ] as const) {
    select(`规则 ${number} 条件 1`, 'corruption-state')
    select(`规则 ${number} 腐化状态`, value)
    select(`规则 ${number} 动作`, action)
  }
}
function start() {
  const button = screen.getByRole('button', { name: '开始指引步骤' })
  button.focus()
  fireEvent.click(button)
  expect(document.activeElement).toBe(screen.getByLabelText('指引结果选择'))
}
function chooseEnchant(kind: 'vaal' | 'architect') {
  const control = screen.getByLabelText(
    kind === 'vaal' ? '选择腐化强化' : '选择建筑师强化',
  ) as HTMLSelectElement
  const id = [...control.options].find((option) => option.value !== '')?.value
  if (!id) throw new Error('缺少实际强化')
  fireEvent.change(control, { target: { value: id } })
  click(kind === 'vaal' ? '预演腐化：新增强化属性' : '预演建筑师：新增强化')
  return id
}
const costs = () => within(screen.getByRole('region', { name: '已消耗材料' }))
afterEach(() => {
  cleanup()
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'locks')
})

it.each(['unchanged', 'socket', 'enchant'] as const)(
  '搜索指引开放瓦尔 %s 与建筑师强化，取消零费用且二重后停止',
  (outcome) => {
    setup()
    configure()
    expect(save().rulesVersion).toBe('basic-2026-09-16-v78')
    start()
    expect(screen.getAllByLabelText('瓦尔结果预演')).toHaveLength(1)
    click('取消指引结果选择')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '开始指引步骤' }))
    start()
    let modId: string | undefined
    if (outcome === 'enchant') modId = chooseEnchant('vaal')
    else click(outcome === 'socket' ? '预演腐化：增加一孔' : '预演腐化：属性不变')
    expect(screen.queryByLabelText('指引结果选择')).toBeNull()
    expect(document.activeElement).toBe(screen.getByLabelText('腐化结果草稿'))
    expect(screen.getAllByLabelText('瓦尔结果预演')).toHaveLength(1)
    expect(save().operations).toEqual([])
    select('装备文本语言', 'en')
    click('导出装备文本')
    expect(screen.getByLabelText('演练装备英文文本')).toBeDefined()
    expect(screen.getByText('只导出当前已应用装备，待应用结果尚未计入。')).toBeDefined()
    click('导出装备文本')
    click('取消腐化结果')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '开始指引步骤' }))
    start()
    if (outcome === 'enchant') modId = chooseEnchant('vaal')
    else click(outcome === 'socket' ? '预演腐化：增加一孔' : '预演腐化：属性不变')
    click('应用腐化结果')
    expect(save().operations[0]).toMatchObject({
      kind: 'vaal',
      outcome,
      ...(modId ? { modId } : {}),
    })
    expect(costs().getByText('瓦尔石 × 1')).toBeDefined()
    start()
    expect(screen.getAllByLabelText('建筑师结果预演')).toHaveLength(1)
    const second = chooseEnchant('architect')
    expect(document.activeElement).toBe(screen.getByLabelText('建筑师结果草稿'))
    click('应用建筑师强化结果')
    expect(screen.getByRole('heading', { name: '已二重腐化' })).toBeDefined()
    expect(screen.queryByRole('button', { name: '开始指引步骤' })).toBeNull()
    expect(costs().getByText('建筑师宝珠 × 1')).toBeDefined()
    const project = save()
    expect(project.operations[1]).toMatchObject({
      kind: 'architect',
      outcome: 'enchant',
      modId: second,
    })
    expect(parseTargetCraftProject(JSON.stringify(project), catalog, dictionary).ok).toBe(true)
  },
)

it.each([1, 2, 3])('导入起点指引支持 %i 次顺序重选，按真实新实例回放', (count) => {
  setup(true)
  configure()
  start()
  for (let index = 0; index < count; index++) {
    select('腐化重选：移除词缀', `a${index + 1}`)
    select('腐化重选：加入词缀', `IncreasedLife${index + 2}`)
    click('确认本次替换')
  }
  expect(screen.getByLabelText('腐化替换顺序').children).toHaveLength(count)
  click('预演腐化：重选词缀')
  expect(save().operations).toEqual([])
  click('应用腐化结果')
  const project = save()
  expect(project.operations).toHaveLength(1)
  expect(project.operations[0]).toMatchObject({ kind: 'vaal', outcome: 'reroll' })
  expect(project.operations[0].replacements).toHaveLength(count)
  expect(
    project.operations[0].replacements.map(
      (entry: { removeAffixId: string }) => entry.removeAffixId,
    ),
  ).toEqual(Array.from({ length: count }, (_, index) => `a${index + 1}`))
  expect(parseTargetCraftProject(JSON.stringify(project), catalog, dictionary).ok).toBe(true)
  expect(costs().getByText('瓦尔石 × 1')).toBeDefined()
})

function stagedSetup() {
  const view = setup()
  click('启用条件指引示例')
  click('启用分阶段流程')
  click('添加阶段')
  click('添加阶段')
  // 首阶段请求建筑师，在未腐化装备上转到第二阶段瓦尔准备。
  select('规则 1 条件 1', 'always')
  select('规则 1 动作', 'architect')
  select('规则 1 无法执行时', 'stage-2')
  select('规则 1 应用后阶段', 'stage-3')
  select('规则 2 所属阶段', 'stage-2')
  select('规则 2 条件 1', 'always')
  select('规则 2 动作', 'vaal')
  select('规则 2 应用后阶段', 'stage-1')
  select('规则 3 所属阶段', 'stage-3')
  select('规则 3 条件 1', 'always')
  select('规则 3 动作', 'stop')
  return view
}

function applyVaalSocket() {
  start()
  click('预演腐化：增加一孔')
  click('应用腐化结果')
}

function stagedFuture() {
  const view = stagedSetup()
  applyVaalSocket()
  start()
  click('预演建筑师：摧毁物品')
  click('应用建筑师摧毁结果')
  click('撤销')
  const golden = save()
  expect(golden.cursor).toBe(1)
  expect(golden.operations).toHaveLength(2)
  return { view, golden }
}

function enableLibrary() {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, callback: () => unknown) => callback() },
  })
}

async function collectCurrent() {
  fireEvent.click(screen.getByText('演练收藏'))
  select('收藏名称', '腐化收尾')
  await act(async () => {
    click('收藏当前演练')
  })
}

it('分阶段建筑师不可用转到瓦尔，真实步骤才推进，取消返回焦点且摧毁保持全损终态', () => {
  stagedSetup()
  applyVaalSocket()
  start()
  click('预演建筑师：摧毁物品')
  click('取消建筑师结果')
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '开始指引步骤' }))
  start()
  click('预演建筑师：摧毁物品')
  click('应用建筑师摧毁结果')
  expect(screen.getByLabelText('已摧毁装备').textContent).toContain('镶嵌物均不可继续使用')
  expect(screen.queryByLabelText('萃取返还清单')).toBeNull()
  const project = save()
  expect(project.cursor).toBe(2)
  expect(project.operations.map((step: { kind: string }) => step.kind)).toEqual([
    'vaal',
    'architect',
  ])
  expect(parseTargetCraftProject(JSON.stringify(project), catalog, dictionary).ok).toBe(true)
})

it('文件恢复保留腐化阶段指引、cursor 与完整摧毁 future', async () => {
  const { golden } = stagedFuture()
  const file = new File([JSON.stringify(golden)], 'corruption-future.craft.json', {
    type: 'application/json',
  })
  await act(async () => {
    fireEvent.change(screen.getByLabelText('选择演练项目文件'), { target: { files: [file] } })
  })
  expect(save()).toEqual(golden)
})

it('收藏恢复保留腐化阶段指引及摧毁 future，不改变撤销位置', async () => {
  enableLibrary()
  const { golden } = stagedFuture()
  await collectCurrent()
  click('重做')
  fireEvent.click(screen.getByText('演练收藏'))
  click('恢复收藏 腐化收尾')
  expect(save()).toEqual(golden)
})

it('沿用腐化阶段指引保留新起点，失效材料跳转仍可开始实际步骤', async () => {
  enableLibrary()
  const { view, golden } = stagedFuture()
  await collectCurrent()
  view.unmount()
  setup()
  fireEvent.click(screen.getByText('演练收藏'))
  click('沿用收藏方案 腐化收尾')
  click('应用收藏方案')
  const reused = save()
  expect(reused.operations).toEqual([])
  expect(reused.initialState.corrupted).toBeUndefined()
  expect(reused.strategy).toEqual(golden.strategy)
  start()
  expect(screen.getByLabelText('瓦尔结果预演')).toBeDefined()
})

it('目录替换、规则编辑与历史切换清除指引的待应用腐化结果', () => {
  const initialState = {
    baseId: 'Crude Bow',
    itemLevel: 86,
    rarity: 'normal' as const,
    sourceText: null,
    affixes: [],
  }
  const props = { initialState, translations, dictionary }
  const view = render(<RehearsalPanel {...props} catalog={catalog} />)
  configure()
  start()
  chooseEnchant('vaal')
  const changed = structuredClone(catalog)
  view.rerender(<RehearsalPanel {...props} catalog={changed} />)
  expect(screen.queryByLabelText('腐化结果草稿')).toBeNull()
  expect(save().operations).toEqual([])
  start()
  click('预演腐化：属性不变')
  select('规则 2 腐化状态', 'once')
  expect(screen.queryByLabelText('腐化结果草稿')).toBeNull()
  expect(save().operations).toEqual([])
  select('规则 2 腐化状态', 'none')
  start()
  click('预演腐化：属性不变')
  click('应用腐化结果')
  start()
  click('预演建筑师：摧毁物品')
  click('撤销')
  expect(screen.queryByLabelText('建筑师结果草稿')).toBeNull()
  expect(save().cursor).toBe(0)
  expect(save().operations).toHaveLength(1)
})
