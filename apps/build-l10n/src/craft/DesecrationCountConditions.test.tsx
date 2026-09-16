import { readFileSync } from 'node:fs'
import type { CraftCatalog, CraftState } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const initialState: CraftState = {
  baseId: 'Twig Focus',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('未开始亵渎也可编辑数量范围并保存恢复，删除条件后仍保留 v92', () => {
  render(<RehearsalPanel catalog={catalog} initialState={initialState} translations={{}} />)
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 1 条件 1', 'desecrated-count')
  change('规则 1 亵渎计数来源', 'unrevealed')
  change('规则 1 亵渎数量上限', '6')
  change('规则 1 亵渎数量下限', '2')
  click('保存演练到本机')
  const project = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(project.rulesVersion).toBe('basic-2026-09-17-v92')
  expect(project.strategy.rules[0].conditions).toEqual([
    { kind: 'desecrated-count', source: 'unrevealed', min: 2, max: 6 },
  ])
  change('规则 1 亵渎计数来源', 'revealed')
  click('恢复本机演练')
  expect((screen.getByLabelText('规则 1 亵渎计数来源') as HTMLSelectElement).value).toBe(
    'unrevealed',
  )
  expect((screen.getByLabelText('规则 1 亵渎数量下限') as HTMLInputElement).value).toBe('2')
  change('规则 1 条件 1', 'always')
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').rulesVersion).toBe(
    'basic-2026-09-17-v92',
  )
})
