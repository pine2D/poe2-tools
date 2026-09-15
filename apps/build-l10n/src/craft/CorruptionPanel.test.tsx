import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { CORRUPTION_SOURCE, type CraftCatalog } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(
  readFileSync(
    resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../data/craft/catalog.json'),
    'utf8',
  ),
)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('建筑师成功保留两组强化，取消不计费，应用后可比较、撤销和恢复', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{ "Architect's Orb": '建筑师宝珠' }}
      initialState={{
        baseId: 'Gold Ring',
        itemLevel: 86,
        rarity: 'normal',
        sourceText: null,
        affixes: [],
      }}
    />,
  )
  fireEvent.change(screen.getByLabelText('选择腐化强化'), {
    target: { value: 'CorruptionChaosResistance1' },
  })
  click('预演腐化：新增强化属性')
  click('应用腐化结果')
  fireEvent.change(screen.getByLabelText('选择建筑师强化'), {
    target: { value: 'CorruptionAllResistances1' },
  })
  fireEvent.change(screen.getByLabelText('建筑师强化 · 数值 1'), { target: { value: '10' } })
  click('预演建筑师：新增强化')
  click('取消建筑师结果')
  expect(screen.queryByText('建筑师宝珠 × 1')).toBeNull()
  click('预演建筑师：新增强化')
  click('应用建筑师强化结果')
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: '已二重腐化' }))
  expect(screen.getByRole('heading', { name: '已二重腐化' })).toBeDefined()
  expect(screen.getByLabelText('第二组腐化强化').textContent).toContain(
    '+10(5-10)% to all Elemental Resistances',
  )
  expect(screen.queryByRole('button', { name: '预演建筑师：摧毁物品' })).toBeNull()
  expect(screen.getByText('建筑师宝珠 × 1')).toBeDefined()
  click('展开前后变化')
  expect(screen.getByText('二重腐化状态：否 → 是')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.operations[1]).toEqual({
    kind: 'architect',
    outcome: 'enchant',
    modId: 'CorruptionAllResistances1',
    values: [10],
  })
  expect(saved.corruptionSourceHash).toBe(CORRUPTION_SOURCE.sha256)
  click('撤销')
  expect(screen.queryByLabelText('第二组腐化强化')).toBeNull()
  click('恢复本机演练')
  expect(screen.getByLabelText('第二组腐化强化')).toBeDefined()
})

it('建筑师摧毁预览可取消，应用后保留费用和项目恢复而停止装备操作', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{ 'Vaal Orb': '瓦尔石', "Architect's Orb": '建筑师宝珠' }}
      initialState={{
        baseId: 'Gold Ring',
        itemLevel: 86,
        rarity: 'normal',
        sourceText: null,
        affixes: [],
      }}
    />,
  )
  click('预演腐化：属性不变')
  click('应用腐化结果')
  click('预演建筑师：摧毁物品')
  expect(screen.getByRole('region', { name: '建筑师结果草稿' }).textContent).toContain('尚未消耗')
  click('取消建筑师结果')
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations).toHaveLength(1)
  click('预演建筑师：摧毁物品')
  click('应用建筑师摧毁结果')
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: '装备已摧毁' }))
  expect(screen.getByRole('region', { name: '已摧毁装备' })).toBeDefined()
  expect(screen.getByText('建筑师宝珠 × 1')).toBeDefined()
  expect(screen.queryByRole('button', { name: '蜕变石' })).toBeNull()
  expect(screen.queryByRole('button', { name: '下载装备文本' })).toBeNull()
  expect(screen.queryByRole('region', { name: '腐化状态' })).toBeNull()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.operations).toEqual([
    { kind: 'vaal', outcome: 'unchanged' },
    { kind: 'architect', outcome: 'destroy' },
  ])
  expect(saved.cursor).toBe(2)
  click('撤销')
  expect(screen.queryByRole('region', { name: '已摧毁装备' })).toBeNull()
  expect(screen.queryByText('建筑师宝珠 × 1')).toBeNull()
  click('恢复本机演练')
  expect(screen.getByRole('region', { name: '已摧毁装备' })).toBeDefined()
  click('撤销')
  click('保存演练到本机')
  click('重做')
  click('恢复本机演练')
  expect(screen.queryByRole('region', { name: '已摧毁装备' })).toBeNull()
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').cursor).toBe(1)
  click('重做')
  expect(screen.getByRole('region', { name: '已摧毁装备' })).toBeDefined()
})

it('按中间状态连续重选，取消不写历史，应用后仅一条瓦尔步骤并可恢复', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{ 'Vaal Orb': '瓦尔石' }}
      initialState={{
        baseId: 'Gold Ring',
        itemLevel: 86,
        rarity: 'normal',
        sourceText: null,
        affixes: [],
      }}
    />,
  )
  click('蜕变石')
  // 使用现有直接候选操作建立可完整恢复的搜索起点历史。
  fireEvent.change(screen.getByLabelText('搜索合法词缀'), { target: { value: 'IncreasedLife1' } })
  fireEvent.click(
    within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: /IncreasedLife1\b/ }),
  )
  click('应用本次结果')
  const select = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  const replace = (remove: string, add: string, value: string) => {
    select('腐化重选：移除词缀', remove)
    select('腐化重选：加入词缀', add)
    select('腐化重选 · 数值 1', value)
    click('确认本次替换')
  }
  replace('IncreasedLife1', 'IncreasedLife2', '25')
  replace('IncreasedLife2', 'IncreasedLife3', '35')
  expect(screen.getByRole('list', { name: '腐化替换顺序' }).children).toHaveLength(2)
  click('预演腐化：重选词缀')
  click('取消腐化结果')
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations).toHaveLength(1)
  click('预演腐化：重选词缀')
  click('应用腐化结果')
  expect(screen.getByRole('region', { name: '腐化状态' })).toBeDefined()
  expect(screen.getByText('瓦尔石 × 1')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.operations[1]).toEqual({
    kind: 'vaal',
    outcome: 'reroll',
    replacements: [
      { removeModId: 'IncreasedLife1', modId: 'IncreasedLife2', values: [25] },
      { removeModId: 'IncreasedLife2', modId: 'IncreasedLife3', values: [35] },
    ],
  })
  click('撤销')
  expect(screen.queryByRole('region', { name: '腐化状态' })).toBeNull()
  click('恢复本机演练')
  expect(screen.getByRole('region', { name: '腐化状态' })).toBeDefined()
  expect(screen.getByLabelText('演练历史').textContent).toContain('重选词缀（2 次替换）')
})

it('瓦尔加孔预览、取消、镶嵌、保存及撤销恢复腐化限制', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{ 'Vaal Orb': '瓦尔石' }}
      initialState={{
        baseId: 'Crude Bow',
        itemLevel: 86,
        rarity: 'normal',
        quality: 20,
        sourceText: null,
        affixes: [],
        sockets: [null, null, null],
      }}
    />,
  )
  click('预演腐化：增加一孔')
  expect(screen.getByRole('region', { name: '腐化结果草稿' })).toBeDefined()
  expect((screen.getByLabelText('选择镶嵌符文') as HTMLSelectElement).disabled).toBe(true)
  click('取消腐化结果')
  expect(screen.queryByRole('region', { name: '腐化状态' })).toBeNull()
  click('预演腐化：增加一孔')
  click('应用腐化结果')
  expect(screen.getByRole('region', { name: '腐化状态' })).toBeDefined()
  expect((screen.getByRole('button', { name: '蜕变石' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: '巧匠石：添加一个孔' })).toBeNull()
  fireEvent.change(screen.getByLabelText('目标孔位'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('选择镶嵌符文'), {
    target: { value: 'pob2:augment:["Soul Core of Quipolatl","weapon"]' },
  })
  click('应用镶嵌')
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.operations).toEqual([
    { kind: 'vaal', outcome: 'socket' },
    {
      kind: 'socket',
      socketIndex: 3,
      augmentId: 'pob2:augment:["Soul Core of Quipolatl","weapon"]',
    },
  ])
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v71')
  click('撤销')
  expect(screen.getByRole('region', { name: '腐化状态' })).toBeDefined()
  click('撤销')
  expect(screen.queryByRole('region', { name: '腐化状态' })).toBeNull()
  expect((screen.getByRole('button', { name: '蜕变石' }) as HTMLButtonElement).disabled).toBe(false)
  click('重做')
  expect(screen.getByRole('region', { name: '腐化状态' })).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByRole('heading', { name: /孔位 4 · Soul Core of Quipolatl/ })).toBeDefined()
})

it('指定腐化属性及掷值，预览取消不消耗；应用、撤销、保存恢复独立强化层', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{ 'Vaal Orb': '瓦尔石' }}
      initialState={{
        baseId: 'Crude Bow',
        itemLevel: 86,
        rarity: 'normal',
        quality: 20,
        sourceText: null,
        affixes: [],
        sockets: [],
      }}
    />,
  )
  fireEvent.change(screen.getByLabelText('选择腐化强化'), {
    target: { value: 'CorruptionLocalAddedChaosDamage1' },
  })
  fireEvent.change(screen.getByLabelText('腐化强化 · 数值 1'), { target: { value: '10' } })
  fireEvent.change(screen.getByLabelText('腐化强化 · 数值 2'), { target: { value: '16' } })
  click('预演腐化：新增强化属性')
  click('展开前后变化')
  expect(screen.getByRole('heading', { name: '腐化强化变化' })).toBeDefined()
  click('取消腐化结果')
  expect(screen.queryByRole('region', { name: '腐化状态' })).toBeNull()
  click('预演腐化：新增强化属性')
  click('应用腐化结果')
  expect(screen.getByRole('article', { name: '当前腐化强化' }).textContent).toContain(
    'Adds 10(7-11) to 16(12-18) Chaos damage',
  )
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.corruptionSourceHash).toBe(CORRUPTION_SOURCE.sha256)
  expect(saved.operations).toEqual([
    {
      kind: 'vaal',
      outcome: 'enchant',
      modId: 'CorruptionLocalAddedChaosDamage1',
      values: [10, 16],
    },
  ])
  click('撤销')
  expect(screen.queryByRole('article', { name: '当前腐化强化' })).toBeNull()
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').corruptionSourceHash).toBe(
    CORRUPTION_SOURCE.sha256,
  )
  click('恢复本机演练')
  click('重做')
  expect(screen.getByRole('article', { name: '当前腐化强化' })).toBeDefined()
})
