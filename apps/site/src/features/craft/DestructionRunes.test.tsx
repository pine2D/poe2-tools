import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  type CraftResult,
  type CraftState,
  createCraftItemDictionary,
  exportCraftItemText,
  type ItemDictionary,
  inspectItem,
  loadTargetWorkbenchProject,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const augmentId = `pob2:augment:["Thrud's Might","weapon"]`
const modId = 'DestructionInfluenceSpeedModifierEffect'
const initial: CraftState = {
  baseId: 'Crude Bow',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
  sockets: [null],
  nextAffixId: 1,
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
function present<T>(value: T | null | undefined): T {
  if (value == null) throw Error('缺少测试数据')
  return value
}
function must<T>(r: CraftResult<T>): T {
  if (!r.ok) throw Error(r.error)
  return r.value
}
function saved(dictionary?: ItemDictionary) {
  click('保存演练到本机')
  return must(
    loadTargetWorkbenchProject(
      localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '',
      catalog,
      dictionary,
    ),
  ).project
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('搜索起点镶入绑定符文后可搜索目标；撤销、保存与恢复仍保留未来来源', () => {
  render(<RehearsalPanel catalog={catalog} initialState={initial} translations={{}} />)
  change('搜索目标词缀', modId)
  expect(screen.queryByRole('button', { name: `加入目标 ${modId}` })).toBeNull()
  change('选择镶嵌符文', augmentId)
  expect(screen.getByLabelText('镶嵌草稿').textContent).toContain('开放专属词缀池')
  click('应用镶嵌')
  click(`加入目标 ${modId}`)
  const project = saved()
  expect(project.rulesVersion).toBe('basic-2026-09-17-v94')
  expect(project.augmentSourceHash).toBe(
    catalog._meta.sources.find((source) => source.path === 'src/Data/ModRunes.lua')?.sha256,
  )
  expect(project.scalabilitySourceHash).toBe(
    catalog._meta.sources.find((source) => source.path === 'src/Data/ModScalability.lua')?.sha256,
  )
  expect(project.targetDefinitions.targets).toEqual([{ targetId: 't1', modId }])
  click('撤销')
  const future = saved()
  expect(future.cursor).toBe(0)
  expect(future.operations).toEqual([{ kind: 'socket', socketIndex: 0, augmentId }])
  click('恢复本机演练')
  click('重做')
  expect(saved().targetDefinitions).toEqual(project.targetDefinitions)
})

it('未镶嵌的符文指引也保存新版与来源，不执行不能改变装备', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={{ ...initial, sockets: [] }}
      translations={{}}
    />,
  )
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 1 条件 1', 'open-sockets')
  change('规则 1 动作', 'socket')
  change('规则 1 符文', augmentId)
  const project = saved()
  expect(project.rulesVersion).toBe('basic-2026-09-17-v94')
  expect(project.augmentSourceHash).toBe(
    catalog._meta.sources.find((source) => source.path === 'src/Data/ModRunes.lua')?.sha256,
  )
  expect(project.scalabilitySourceHash).toBe(
    catalog._meta.sources.find((source) => source.path === 'src/Data/ModScalability.lua')?.sha256,
  )
  expect(project.operations).toEqual([])
  expect(project.initialState.sockets).toEqual([])
  expect(project.augmentSourceHash).toBe(
    catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')?.sha256,
  )
  click('恢复本机演练')
  expect((screen.getByLabelText('规则 1 符文') as HTMLSelectElement).value).toBe(augmentId)
})

it.each([true, false])(
  '简中高级基础值核对增效来源；不反解变量显示值（基础值：%s）',
  (baseValues) => {
    const dictionary = createCraftItemDictionary(catalog, {
      items: JSON.parse(readFileSync('data/dict/zh-CN/items.json', 'utf8')),
      stats: JSON.parse(readFileSync('data/dict/zh-CN/stats.json', 'utf8')),
    })
    const state: CraftState = {
      ...initial,
      rarity: 'rare',
      sockets: [augmentId],
      affixes: [
        { affixId: 'a1', modId: 'LocalAddedFireDamage1', lines: ['Adds 2 to 5 Fire Damage'] },
        {
          affixId: 'a2',
          modId: 'DestructionInfluenceFireModifierEffect',
          lines: ['20% increased Explicit Fire Modifier magnitudes'],
        },
        {
          affixId: 'a3',
          modId: 'DestructionInfluenceElementalModifierEffect',
          lines: ['20% increased Explicit Elemental Damage Modifier magnitudes'],
        },
      ],
      nextAffixId: 4,
    }
    const exported = must(exportCraftItemText(catalog, state, { locale: 'zh-CN', dictionary })).text
    expect(exported).toContain('40% Increased')
    expect(exported).toContain('5(3-5)')
    // 变量显示值即使声明总增效也不能唯一反解基础掷值，应保留对比而拒绝开始。
    const text = baseValues ? exported : exported.replace('5(3-5)', '7(3-5)')
    const parsed = parseItem(text)
    if (!parsed.ok) throw Error(parsed.error)
    const inspection = inspectItem(parsed.item, dictionary)
    render(
      <CraftEntry
        catalog={catalog}
        base={present(catalog.bases.find((b) => b.id === state.baseId))}
        itemLevel={86}
        imported={{
          baseId: state.baseId,
          item: parsed.item,
          mods: inspection.mods,
          runes: inspection.runes,
          skills: inspection.skills,
        }}
        translations={{}}
        translateLine={undefined}
        dictionary={dictionary}
        onRestore={vi.fn()}
      />,
    )
    change('核对孔位 1', augmentId)
    const start = screen.getByRole('button', { name: '按已核对孔位开始' }) as HTMLButtonElement
    expect(start.disabled).toBe(!baseValues)
    if (!baseValues) return
    fireEvent.click(start)
    const project = saved(dictionary)
    expect(project.initialState.affixes.map((affix) => affix.modId)).toEqual(
      state.affixes.map((affix) => affix.modId),
    )
    expect(project.initialState.affixes[0]?.lines[0]).toMatch(/2.*5/)
    expect(project.initialState.affixes[0]?.lines[0]).not.toContain('7')
    expect(project.rulesVersion).toBe('basic-2026-09-17-v94')
    expect(project.importedSockets).toEqual([augmentId])
    expect(project.operations).toEqual([])
  },
)
