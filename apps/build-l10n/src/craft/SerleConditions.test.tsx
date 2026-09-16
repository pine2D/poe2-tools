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

it('在扩容前配置七组和第四后缀条件，保存恢复保留 v88 与条件值', () => {
  render(<RehearsalPanel catalog={catalog} initialState={initialState} translations={{}} />)
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 1 条件 1', 'affix-count')
  const count = screen.getByLabelText('规则 1 最少词缀组数') as HTMLSelectElement
  expect([...count.options].map((option) => option.value)).toContain('7')
  fireEvent.change(count, { target: { value: '7' } })
  change('规则 2 条件 1', 'open-suffix')
  const suffix = screen.getByLabelText('规则 2 条件 1 空位数量') as HTMLSelectElement
  expect([...suffix.options].map((option) => option.value)).toContain('4')
  fireEvent.change(suffix, { target: { value: '4' } })
  click('保存演练到本机')
  const project = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(project.rulesVersion).toBe('basic-2026-09-16-v88')
  expect(project.strategy.rules[0].conditions).toEqual([{ kind: 'affix-count', min: 7 }])
  expect(project.strategy.rules[1].conditions).toEqual([{ kind: 'open-suffix', min: 4 }])
  expect(project.augmentSourceHash).toBe(
    catalog._meta.sources.find((source) => source.path === 'src/Data/ModRunes.lua')?.sha256,
  )
  change('规则 1 最少词缀组数', '6')
  click('恢复本机演练')
  expect((screen.getByLabelText('规则 1 最少词缀组数') as HTMLSelectElement).value).toBe('7')
  expect((screen.getByLabelText('规则 2 条件 1 空位数量') as HTMLSelectElement).value).toBe('4')
  change('规则 2 条件 1', 'open-prefix')
  const prefix = screen.getByLabelText('规则 2 条件 1 空位数量') as HTMLSelectElement
  expect([...prefix.options].map((option) => option.value)).not.toContain('4')
})
