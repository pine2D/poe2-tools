import { readFileSync } from 'node:fs'
import {
  addCraftAffix,
  type CraftCatalog,
  type CraftState,
  craftCandidates,
  loadTargetWorkbenchProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
afterEach(() => {
  cleanup()
  localStorage.clear()
})
function start() {
  const blank: CraftState = {
    baseId: 'Sapphire',
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
    nextAffixId: 1,
  }
  let state: CraftState = { ...blank, rarity: 'rare' }
  const ids: string[] = []
  for (const kind of ['prefix', 'prefix', 'suffix', 'suffix']) {
    const mod = craftCandidates(catalog, state).find((m) => m.kind === kind)
    if (!mod) throw Error('缺少合成候选')
    const next = addCraftAffix(catalog, state, mod.id)
    if (!next.ok) throw Error(next.error)
    state = next.value
    ids.push(mod.id)
  }
  const project = loadTargetWorkbenchProject(
    JSON.stringify({
      schemaVersion: 1,
      rulesVersion: 'basic-2026-09-18-v115',
      sourceCommit: catalog._meta.sourceCommit,
      jewelSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModJewel.lua')
        ?.sha256,
      initialState: blank,
      operations: ids.map((id, i) => ({
        currency: ['transmutation', 'regal', 'exalted', 'exalted'][i],
        modIds: [id],
      })),
      cursor: 4,
      targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
      orphanedTargets: [],
    }),
    catalog,
  )
  if (!project.ok) throw Error(project.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{ 'Vaal Orb': '瓦尔石' }}
      initialState={blank}
      initialProject={project.value}
    />,
  )
}
const save = () => {
  click('保存演练到本机')
  return JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
}
it('新增第五条预演取消不计费，应用后以v116保存完整未来并恢复重做', () => {
  start()
  const select = screen.getByLabelText('选择瓦尔新增词缀') as HTMLSelectElement
  const id = select.options[1]?.value
  if (!id) throw Error('缺少新增候选')
  fireEvent.change(select, { target: { value: id } })
  click('预演腐化：新增一条词缀')
  click('取消腐化结果')
  expect(screen.queryByText('瓦尔石 × 1')).toBeNull()
  click('预演腐化：新增一条词缀')
  click('应用腐化结果')
  expect(screen.getByText('瓦尔石 × 1')).toBeDefined()
  expect(save()).toMatchObject({ rulesVersion: 'basic-2026-09-18-v116', cursor: 5 })
  expect(save().liquidEmotionSourceHash).toBeUndefined()
  click('撤销')
  const stored = save()
  expect(stored.cursor).toBe(4)
  expect(stored.operations[4]).toMatchObject({ kind: 'vaal', outcome: 'add', modId: id })
  click('恢复本机演练')
  click('重做')
  expect(save().cursor).toBe(5)
})
it('移除结果保留实例选择，保存与步骤说明不误称属性不变', () => {
  start()
  const select = screen.getByLabelText('选择瓦尔移除词缀') as HTMLSelectElement
  fireEvent.change(select, { target: { value: select.options[1]?.value } })
  click('预演腐化：移除一条词缀')
  click('应用腐化结果')
  const stored = save()
  expect(stored.operations[4]).toMatchObject({
    kind: 'vaal',
    outcome: 'remove',
    removeAffixId: 'a1',
  })
  expect(screen.getAllByText(/瓦尔石：移除一条词缀/).length).toBeGreaterThan(0)
})
