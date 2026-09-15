import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  type CraftCatalog,
  createCraftItemDictionary,
  exportCraftItemText,
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
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v71')
  expect(saved.operations).toHaveLength(3)
  expect(saved.desecrationSourceHash).toMatch(/^[a-f0-9]{64}$/)
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.getByText('未揭示亵渎前缀')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByText('亵渎词缀 1/1')).toBeDefined()
})
