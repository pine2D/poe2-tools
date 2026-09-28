import { readFileSync } from 'node:fs'
import {
  addCraftAffix,
  applyCraftStep,
  type CraftCatalog,
  type CraftState,
  craftCandidates,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EssenceCraftPanel } from './EssenceCraftPanel'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const essenceId = 'Metadata/Items/Currency/CurrencyPerfectEssenceAttribute'
const empty = { nextTargetId: 1, targets: [], alternatives: [], values: [] }
function fixture() {
  const start: CraftState = {
    baseId: 'Amber Amulet',
    rarity: 'rare',
    itemLevel: 86,
    affixes: [],
    sourceText: null,
  }
  const mod = craftCandidates(catalog, start).find((m) => m.kind === 'prefix')
  if (!mod) throw Error('缺少普通前缀')
  const added = addCraftAffix(catalog, start, mod.id)
  if (!added.ok) throw Error(added.error)
  return added.value
}
afterEach(cleanup)

it('三种结果分别选择，切换后必须重新选移除对象，预览保存真实结果ID', () => {
  const state = fixture()
  const before = structuredClone(state)
  const onPreview = vi.fn()
  render(
    <EssenceCraftPanel
      catalog={catalog}
      state={state}
      definitions={empty}
      translations={{ 'Perfect Essence of the Infinite': '完美无限精华' }}
      translateLine={(line) =>
        line
          .replace('Strength', '力量')
          .replace('Dexterity', '敏捷')
          .replace('Intelligence', '智慧')
      }
      disabled={false}
      onPreview={onPreview}
    />,
  )
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索可演练精华' }), {
    target: { value: '完美无限精华' },
  })
  const buttons = screen.getAllByRole('button', { name: /^选择精华 完美无限精华/ })
  expect(buttons).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: /选择精华 完美无限精华.*力量/ }))
  fireEvent.click(screen.getByRole('radio'))
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '预览精华结果' }).disabled).toBe(
    false,
  )
  fireEvent.click(screen.getByRole('button', { name: /选择精华 完美无限精华.*智慧/ }))
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '预览精华结果' }).disabled).toBe(
    true,
  )
  fireEvent.click(screen.getByRole('radio'))
  fireEvent.click(screen.getByRole('button', { name: '预览精华结果' }))
  expect(onPreview).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'essence',
      essenceId,
      resultModId: 'EssencePercentIntelligence1',
      values: [7],
    }),
  )
  const operation = onPreview.mock.calls[0]?.[0]
  const applied = applyCraftStep(catalog, state, operation)
  expect(applied).toMatchObject({
    ok: true,
    value: {
      affixes: [expect.objectContaining({ modId: 'EssencePercentIntelligence1', crafted: true })],
    },
  })
  expect(state).toEqual(before)
})
