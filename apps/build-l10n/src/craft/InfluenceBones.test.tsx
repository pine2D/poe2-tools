import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  type CraftState,
  loadTargetWorkbenchProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const rune = `pob2:augment:["Thrud's Might","weapon"]`
const target = 'DestructionInfluenceFireModifierEffect'
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
afterEach(() => {
  cleanup()
  localStorage.clear()
})
function save() {
  click('保存演练到本机')
  if (!localStorage.getItem(REHEARSAL_PROJECT_KEY))
    throw Error(screen.getByRole('region', { name: '演练项目' }).textContent ?? '无保存结果')
  const result = loadTargetWorkbenchProject(
    localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '',
    catalog,
  )
  if (!result.ok) throw Error(result.error)
  return result.value
}
it('毁灭符文普通骨骼三阶段与完整未来保存恢复共用 v95', () => {
  const initial: CraftState = {
    baseId: 'Crude Bow',
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
    sockets: [null],
    nextAffixId: 1,
  }
  render(<RehearsalPanel catalog={catalog} initialState={initial} translations={{}} />)
  change('选择镶嵌符文', rune)
  click('应用镶嵌')
  for (const [currency, id] of [
    ['蜕变石', 'LocalAddedFireDamage1'],
    ['富豪石', 'LocalAddedColdDamage1'],
  ] as const) {
    click(currency)
    change('搜索合法词缀', id)
    const candidate = screen
      .getAllByText(id)
      .map((node) => node.closest('button.rehearsal-candidate'))
      .find(Boolean)
    if (!candidate) throw Error('缺少普通候选')
    fireEvent.click(candidate)
    click('应用本次结果')
  }
  change('骨骼材料', 'preserved_jawbone')
  fireEvent.click(screen.getByLabelText('占用后缀'))
  click('预览骨骼结果')
  click('应用骨骼步骤')
  change('搜索揭示候选', 'DestructionInfluence')
  for (const id of [
    target,
    'DestructionInfluenceColdModifierEffect',
    'DestructionInfluenceChaosModifierEffect',
  ])
    fireEvent.click(screen.getByLabelText(`候选 ${id}`))
  click('预览三项候选')
  click('应用骨骼步骤')
  click(`选择揭示 ${target}`)
  change(`${target} · 数值 1`, '20')
  click('预览揭示结果')
  click('应用骨骼步骤')
  const current = save()
  expect(current.project.rulesVersion).toBe('basic-2026-09-17-v95')
  for (const [key, path] of [
    ['augmentSourceHash', 'ModRunes'],
    ['desecrationSourceHash', 'ModVeiled'],
    ['scalabilitySourceHash', 'ModScalability'],
  ] as const)
    expect(current.project[key]).toBe(
      catalog._meta.sources.find((s) => s.path === `src/Data/${path}.lua`)?.sha256,
    )
  expect(current.states[6]?.affixes[2]).toMatchObject({ modId: target, desecrated: true })
  click('回到起点')
  expect(save().project.cursor).toBe(0)
  click('恢复本机演练')
  for (let i = 0; i < 6; i++) click('重做')
  expect(save().states[6]?.affixes).toEqual(current.states[6]?.affixes)
})
