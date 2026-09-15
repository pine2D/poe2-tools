import {
  CRAFT_RULES_VERSION,
  STAT_SCALABILITY_SOURCE,
  upgradeTargetCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { catalog as makeCatalog } from '../../../../packages/item-core/src/partialTargetFixture'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('真实制作后设置有效目标，撤销及分支截断仍可编辑并严格保存恢复', () => {
  const catalog = makeCatalog(undefined, { socketLimit: null })
  catalog._meta.sourceCommit = STAT_SCALABILITY_SOURCE.commit
  catalog._meta.sources.push(STAT_SCALABILITY_SOURCE)
  catalog.modifiers = catalog.modifiers.map((mod) =>
    mod.id === 'p1' ? { ...mod, lines: ['Value (1-10)', 'Value (1-5)'] } : mod,
  )
  const old = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: {
      baseId: 'Focus',
      itemLevel: 86,
      rarity: 'rare',
      affixes: [{ modId: 'p1', lines: ['Value 3', 'Value 4'] }],
      sourceText:
        'Item Class: Foci\nRarity: Rare\nTest\nFocus\n--------\nItem Level: 86\n--------\n{ Prefix Modifier "p1" }\nValue 3\nValue 4',
    },
    operations: [
      {
        currency: 'chaos',
        removeModId: 'p1',
        modIds: ['p1'],
        rolls: [{ modId: 'p1', values: [8, 4] }],
      },
    ],
    cursor: 1,
    scalabilitySourceHash: STAT_SCALABILITY_SOURCE.sha256,
  }
  const restored = upgradeTargetCraftProject(JSON.stringify(old), catalog)
  if (!restored.ok) throw Error(restored.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={restored.value.project.initialState}
      initialProject={restored.value}
      translations={{}}
    />,
  )
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'p1' } })
  fireEvent.click(screen.getByRole('button', { name: '加入目标 p1' }))
  fireEvent.click(screen.getByRole('button', { name: '设置数值条件 p1' }))
  fireEvent.change(screen.getByLabelText('p1 · 条件口径'), { target: { value: 'effective' } })
  fireEvent.change(screen.getByLabelText('p1 · 数值 1 最小值'), { target: { value: '7' } })
  fireEvent.click(screen.getByRole('button', { name: '保存数值条件 p1' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const configured = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? 'null')
  expect(configured.targetDefinitions.values).toEqual([
    { targetId: 't1', modId: 'p1', basis: 'effective', bounds: [{ index: 0, min: 7 }] },
  ])
  fireEvent.click(screen.getByRole('button', { name: '设置数值条件 p1' }))
  fireEvent.change(screen.getByLabelText('p1 · 数值 1 最小值'), { target: { value: '9' } })
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.getByRole('button', { name: '移除目标 p1' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '设置数值条件 p1' }))
  expect((screen.getByLabelText('p1 · 数值 1 最小值') as HTMLInputElement).value).toBe('7')
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const undone = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? 'null')
  expect(undone.cursor).toBe(0)
  expect(undone.operations).toEqual(configured.operations)
  expect(undone.targetDefinitions).toEqual(configured.targetDefinitions)
  fireEvent.click(screen.getByRole('button', { name: '剥离石' }))
  const removal = document.querySelector<HTMLButtonElement>('.rehearsal-removal-choice button')
  if (!removal) throw Error('缺少真实移除选择')
  fireEvent.click(removal)
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const branch = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? 'null')
  expect(branch.operations).toEqual([
    { currency: 'annulment', modIds: [], removeModId: 'p1', removeAffixId: 'a1' },
  ])
  expect(branch.targetDefinitions).toEqual(configured.targetDefinitions)
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? 'null')).toEqual(branch)
})
