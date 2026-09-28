import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  createCraftItemDictionary,
  exportCraftItemText,
  importIdentifiedCraftState,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', () => ({ requestTargetRoutes: () => () => {} }))
const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
const protection = id('Warding Rune of Protection')
const nourishment = id('Warding Rune of Nourishment')
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
const initial = {
  baseId: 'Adherent Cuffs',
  itemLevel: 86,
  rarity: 'normal' as const,
  affixes: [],
  sourceText: null,
  sockets: [null, null],
  quality: 20,
}
function save() {
  click('保存演练到本机')
  const result = parseTargetCraftProject(
    localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '',
    catalog,
  )
  if (!result.ok)
    throw Error(
      result.error +
        ' ' +
        screen
          .queryAllByRole('status')
          .map((node) => node.textContent)
          .join(' '),
    )
  return result.value.project
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('限量说明、取消、应用、v86全未来与指引共享镶嵌', () => {
  render(<RehearsalPanel catalog={catalog} translations={{}} initialState={initial} />)
  change('选择镶嵌符文', protection)
  expect(
    within(screen.getByLabelText('镶嵌草稿')).getByText(/其他装备与角色孔尚未核对/),
  ).toBeTruthy()
  click('取消镶嵌')
  expect(save().operations).toHaveLength(0)
  change('选择镶嵌符文', protection)
  click('应用镶嵌')
  expect(screen.getByLabelText('镶嵌限量提示').textContent).toContain('本件 1 / 限量 1')
  const before = save()
  expect(before.rulesVersion).toBe('basic-2026-09-16-v86')
  change('目标孔位', '1')
  change('选择镶嵌符文', protection)
  expect(screen.getAllByText(/重复镶入行为尚未核实/).length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: '应用镶嵌' }).hasAttribute('disabled')).toBe(true)
  click('取消镶嵌')
  change('选择镶嵌符文', nourishment)
  click('应用镶嵌')
  click('撤销')
  const future = save()
  expect(future.cursor).toBe(1)
  expect(future.operations).toHaveLength(2)
  click('重做')
  click('恢复本机演练')
  expect(save()).toEqual(future)
  click('重做')
  expect(save().operations).toHaveLength(2)
}, 15_000)

it('已有超限孔位显示风险并能替换修复，外部未知不冒充可穿戴', () => {
  const dictionary = createCraftItemDictionary(catalog, {})
  const sockets = [protection, protection]
  const text = exportCraftItemText(catalog, { ...initial, sockets }, { locale: 'en', dictionary })
  if (!text.ok) throw Error(text.error)
  const parsed = parseItem(text.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const imported = importIdentifiedCraftState(
    catalog,
    initial.baseId,
    parsed.item,
    inspectItem(parsed.item, dictionary),
    sockets,
    undefined,
    dictionary.stats?.entries,
  )
  if (!imported.ok) throw Error(imported.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      dictionary={dictionary}
      translations={{}}
      initialState={imported.value}
      importedSockets={sockets}
    />,
  )
  expect(screen.getByLabelText('镶嵌限量提示').textContent).toContain('本件已超限')
  expect(save().initialState.sockets).toEqual([protection, protection])
  change('选择镶嵌符文', nourishment)
  click('应用镶嵌')
  expect(screen.getByLabelText('镶嵌限量提示').textContent).not.toContain('本件已超限')
  expect(screen.getByLabelText('镶嵌限量提示').textContent).toContain('其他装备与角色孔尚未核对')
})

it('空白v86项目恢复后保存不降级，未执行指引仍保留来源', () => {
  const input = {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-16-v86',
    initialState: { ...initial, nextAffixId: 1 },
    operations: [],
    cursor: 0,
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
  const loaded = parseTargetCraftProject(JSON.stringify(input), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={initial}
      initialProject={loaded.value}
    />,
  )
  expect(save().rulesVersion).toBe('basic-2026-09-16-v86')
  click('启用条件指引示例')
  change('规则 1 条件 1', 'always')
  change('规则 1 动作', 'socket')
  change('规则 1 符文', protection)
  expect(save().augmentSourceHash).toBe(input.augmentSourceHash)
})

import { buildCraftRehearsalReport } from './craftRehearsalReport'

it('步骤清单保留起点超限与修复后的外部未知，不隐去效果周期', () => {
  const result = buildCraftRehearsalReport({
    catalog,
    initialState: { ...initial, sockets: [protection, protection] },
    operations: [{ kind: 'socket', socketIndex: 1, augmentId: nourishment }],
    cursor: 1,
    translations: {},
  })
  if (!result.ok) throw Error(result.error)
  expect(result.value).toContain('本件已超限')
  expect(result.value).toContain('其他装备与角色孔尚未核对')
  expect(result.value).toContain(
    'Every 4 seconds, gain Guard equal to 20% of maximum Runic Ward for 2 seconds',
  )
})
