import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  CRAFT_RULES_VERSION,
  type CraftCatalog,
  createCraftItemDictionary,
  importCraftState,
  inspectItem,
  parseCraftProject,
  parseItem,
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
const dictionary = createCraftItemDictionary(catalog, {})
const raw =
  'Item Class: Rings\nRarity: Rare\nTest Ring\nGold Ring\n--------\nQuality (Life Modifiers): +20%\n--------\nItem Level: 86\n--------\n{ Implicit Modifier }\n10(6-15)% increased Rarity of Items found\n--------\n{ Prefix Modifier "Hale" — Life — 20% Increased }\n+19(10-19) to maximum Life'
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

function start() {
  const parsed = parseItem(raw)
  if (!parsed.ok) throw Error(parsed.error)
  const input = importCraftState(
    catalog,
    'Gold Ring',
    parsed.item,
    inspectItem(parsed.item, dictionary),
  )
  if (!input.ok) throw Error(input.error)
  const project = parseCraftProject(
    JSON.stringify({
      schemaVersion: 1,
      rulesVersion: CRAFT_RULES_VERSION,
      sourceCommit: catalog._meta.sourceCommit,
      scalabilitySourceHash: catalog._meta.sources.find(
        (s) => s.path === 'src/Data/ModScalability.lua',
      )?.sha256,
      initialState: input.value,
      operations: [],
      cursor: 0,
      targetModIds: ['FireResist1'],
      targetValues: [{ modId: 'FireResist1', bounds: [{ index: 0, min: 8 }] }],
      targetAlternatives: [{ targetModId: 'FireResist1', modIds: ['FireResist2'] }],
      minimumTargetCount: 1,
      targetFracturedModId: 'FireResist1',
      targetImplicitValues: [{ lineIndex: 0, bounds: [{ index: 0, min: 10 }] }],
    }),
    catalog,
    dictionary,
  )
  if (!project.ok) throw Error(project.error)
  return render(
    <RehearsalPanel
      catalog={catalog}
      dictionary={dictionary}
      translations={{}}
      initialState={input.value}
      initialProject={project.value}
    />,
  )
}
function save() {
  click('保存演练到本机')
  return JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
}
it('取消不改变目标；确认一次替换显式要求并保留固有目标、来源和零消费历史', () => {
  start()
  const before = save()
  expect(before.rulesVersion).toBe('basic-2026-09-12-v74')
  expect(before.targetDefinitions).toEqual({
    nextTargetId: 2,
    targets: [{ targetId: 't1', modId: 'FireResist1' }],
    alternatives: [{ targetId: 't1', modIds: ['FireResist2'] }],
    values: [{ targetId: 't1', modId: 'FireResist1', bounds: [{ index: 0, min: 8 }] }],
    minimumTargetCount: 1,
    fracturedTargetId: 't1',
  })
  expect(before.initialState).toMatchObject({
    nextAffixId: 2,
    affixes: [{ modId: 'IncreasedLife1', affixId: 'a1' }],
  })
  click('从当前装备提取目标')
  fireEvent.click(screen.getByLabelText('复制基础数值为精确条件'))
  click('取消提取')
  expect(save()).toEqual(before)
  click('从当前装备提取目标')
  fireEvent.click(screen.getByLabelText('提取词缀 IncreasedLife1 · a1'))
  expect(
    (screen.getByRole('button', { name: '用所选词缀替换显式目标' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.click(screen.getByLabelText('提取词缀 IncreasedLife1 · a1'))
  fireEvent.click(screen.getByLabelText('复制基础数值为精确条件'))
  click('用所选词缀替换显式目标')
  const after = save()
  expect(after.targetDefinitions).toEqual({
    nextTargetId: 3,
    targets: [{ targetId: 't2', modId: 'IncreasedLife1' }],
    values: [{ targetId: 't2', modId: 'IncreasedLife1', bounds: [{ index: 0, min: 19, max: 19 }] }],
    alternatives: [],
  })
  expect(after.orphanedTargets).toEqual([])
  expect(after.targetImplicitValues).toEqual(before.targetImplicitValues)
  expect(after.initialState).toEqual(before.initialState)
  expect(after.operations).toEqual([])
  expect(after.cursor).toBe(0)
  click('恢复本机演练')
  expect(save()).toEqual(after)
})
it('制作预览期间不提取草稿，历史变化使尚未应用的选择失效', () => {
  start()
  click('崇高石')
  change('搜索合法词缀', 'FireResist1')
  fireEvent.click(screen.getByRole('button', { name: /FireResist1 ·/ }))
  expect(
    (screen.getByRole('button', { name: '从当前装备提取目标' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  click('应用本次结果')
  click('从当前装备提取目标')
  expect(screen.getByLabelText('提取词缀 FireResist1 · a2')).toBeDefined()
  click('撤销')
  expect(screen.queryByLabelText('提取制作目标')).toBeNull()
  click('从当前装备提取目标')
  expect(screen.queryByLabelText('提取词缀 FireResist1 · a2')).toBeNull()
})
