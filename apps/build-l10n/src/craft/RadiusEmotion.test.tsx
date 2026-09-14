import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  exportCraftItemText,
  LIQUID_EMOTION_SOURCE,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('远古材料预览不改当前半径，应用、撤销重做和恢复保留超大结果及费用', () => {
  const state = {
    baseId: 'Time-Lost Sapphire',
    itemLevel: 86,
    rarity: 'rare' as const,
    sourceText: null,
    affixes: [
      {
        modId: 'JewelRadiusCastSpeed',
        lines: ['Notable Passive Skills in Radius also grant 2% increased Cast Speed'],
      },
    ],
  }
  const source = exportCraftItemText(catalog, state)
  if (!source.ok) throw Error(source.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{ 'Ancient Potent Liquid Melancholy': '远古的强效液化忧郁' }}
      initialState={{ ...state, sourceText: source.value.text }}
    />,
  )
  const radius = () => within(screen.getByRole('region', { name: '珠宝半径' }))
  fireEvent.click(screen.getByRole('button', { name: '选择液态情感 远古的强效液化忧郁' }))
  fireEvent.change(screen.getByLabelText('液态情感移除结果'), {
    target: { value: 'JewelRadiusCastSpeed' },
  })
  fireEvent.click(screen.getByRole('button', { name: '预览液态情感结果' }))
  expect(radius().getByText('小')).toBeDefined()
  expect(radius().getByText(/应用后预计：小 → 超大/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '应用液态情感结果' }))
  expect(radius().getByText('超大')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(radius().getByText('小')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(radius().getByText('超大')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v68')
  expect(saved.liquidEmotionSourceHash).toBe(LIQUID_EMOTION_SOURCE.sha256)
  expect(saved.operations).toEqual([
    {
      kind: 'liquid-emotion',
      emotionId: 'Metadata/Items/Currency/EndgameDistilledEmotionTimeLost1',
      removeModId: 'JewelRadiusCastSpeed',
      values: [],
    },
  ])
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(radius().getByText('超大')).toBeDefined()
})
