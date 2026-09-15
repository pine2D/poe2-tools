import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  type CraftCatalog,
  createCraftItemDictionary,
  exportCraftItemText,
  inspectModPool,
  inspectNumericLines,
  renderNumericLines,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
const dictionary = createCraftItemDictionary(catalog)

afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('未揭示期间补液态工艺可取消、应用、保存、撤销和恢复', () => {
  const base = catalog.bases.find((entry) => entry.id === 'Time-Lost Sapphire')
  if (!base) throw Error('缺少基底')
  const pool = inspectModPool(base, catalog.modifiers, 86).map((entry) => entry.mod)
  const mod = pool.find(
    (entry) =>
      entry.kind === 'prefix' && !entry.lines.some((line) => line.includes('Upgrades Radius')),
  )
  if (!mod) throw Error('缺少前缀')
  const numeric = inspectNumericLines(mod.lines)
  if (!numeric.ok) throw Error(numeric.error)
  const lines = renderNumericLines(
    mod.lines,
    numeric.value.map((range) => range.min),
  )
  if (!lines.ok) throw Error(lines.error)
  const state = {
    baseId: base.id,
    itemLevel: 86,
    rarity: 'rare' as const,
    sourceText: null,
    catalyst: { id: 'Neural', quality: 20, declared: true as const },
    affixes: [{ modId: mod.id, lines: lines.value }],
  }
  const exported = exportCraftItemText(catalog, state)
  if (!exported.ok) throw Error(exported.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      dictionary={dictionary}
      initialState={{ ...state, sourceText: exported.value.text }}
    />,
  )
  const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_cranium' } })
  fireEvent.click(screen.getByLabelText('占用前缀'))
  click('预览骨骼结果')
  click('应用骨骼步骤')
  expect(screen.getByText(/此处未列出全部随机结果/)).toBeDefined()
  click('选择液态情感 远古强效的液化悲哀')
  fireEvent.change(screen.getByLabelText('液态情感移除结果'), { target: { value: 'a1' } })
  click('预览液态情感结果')
  click('取消液态情感结果')
  expect(screen.getByText('未揭示亵渎前缀')).toBeDefined()
  click('选择液态情感 远古强效的液化悲哀')
  fireEvent.change(screen.getByLabelText('液态情感移除结果'), { target: { value: 'a1' } })
  click('预览液态情感结果')
  click('应用液态情感结果')
  expect(screen.getByText('未揭示亵渎前缀')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v73')
  expect(saved.operations.map((step: { kind: string }) => step.kind)).toEqual([
    'desecrate',
    'liquid-emotion',
  ])
  expect(saved.initialState.nextAffixId).toBe(2)
  expect(saved.initialState.affixes[0].affixId).toBe('a1')
  expect(saved.operations[1].removeAffixId).toBe('a1')
  expect(saved.initialState.catalyst.quality).toBe(20)
  click('撤销')
  expect(screen.getByText('未揭示亵渎前缀')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('未揭示亵渎前缀')).toBeDefined()
  expect(screen.getByText('演练项目已恢复。')).toBeDefined()
})
it('珠宝颅骨揭示、费用、撤销与本机恢复组成完整页面流程', () => {
  const state = {
    baseId: 'Time-Lost Sapphire',
    itemLevel: 86,
    rarity: 'rare' as const,
    affixes: [],
    sourceText: null,
  }
  const exported = exportCraftItemText(catalog, state)
  if (!exported.ok) throw Error(exported.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={{ ...state, sourceText: exported.value.text }}
      dictionary={dictionary}
    />,
  )
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_cranium' } })
  fireEvent.click(screen.getByLabelText('占用前缀'))
  fireEvent.click(screen.getByRole('button', { name: '预览骨骼结果' }))
  fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
  expect(screen.getByText('未揭示亵渎前缀')).toBeDefined()
  for (const id of [
    'AbyssModRadiusJewelPrefixPercentMaximumMana',
    'AbyssModRadiusJewelPrefixPercentMaximumLife',
    'AbyssModRadiusJewelPrefixGlobalDefences',
  ])
    fireEvent.click(screen.getByLabelText(`候选 ${id}`))
  fireEvent.click(screen.getByRole('button', { name: '预览三项候选' }))
  fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
  fireEvent.click(
    screen.getByRole('button', { name: '选择揭示 AbyssModRadiusJewelPrefixPercentMaximumMana' }),
  )
  fireEvent.click(screen.getByRole('button', { name: '预览揭示结果' }))
  fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
  expect(screen.getByText('亵渎词缀 1/1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v73')
  expect(saved.initialState.nextAffixId).toBe(1)
  expect(saved.operations).toHaveLength(3)
  expect(saved.desecrationSourceHash).toMatch(/^[a-f0-9]{64}$/)
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.getByText('未揭示亵渎前缀')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByText('亵渎词缀 1/1')).toBeDefined()
})
