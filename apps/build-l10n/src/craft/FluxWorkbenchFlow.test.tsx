import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  type CraftResult,
  type CraftState,
  createCraftItemDictionary,
  exportCraftItemText,
  FLUXES,
  fluxCatalogSignature,
  importCraftState,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', () => ({ requestTargetRoutes: () => () => {} }))
afterEach(() => {
  cleanup()
  localStorage.clear()
})
const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function imported() {
  const state: CraftState = {
    baseId: 'Gold Ring',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    affixes: [
      { modId: 'IncreasedLife1', lines: ['+19(10-19) to maximum Life'] },
      { modId: 'FireResist4', lines: ['+21(21-25)% to Fire Resistance'] },
      { modId: 'ColdResist4', lines: ['+22(21-25)% to Cold Resistance'] },
      { modId: 'LightningResist4', lines: ['+23(21-25)% to Lightning Resistance'] },
    ],
  }
  const parsed = parseItem(must(exportCraftItemText(catalog, state)).text)
  if (!parsed.ok) throw Error(parsed.error)
  return must(
    importCraftState(
      catalog,
      state.baseId,
      parsed.item,
      inspectItem(parsed.item, createCraftItemDictionary(catalog)),
    ),
  )
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const saved = () => JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')

it('多条溶剂取消不计费，完整应用后提取独立目标，撤销重做与v75保存恢复', () => {
  render(<RehearsalPanel catalog={catalog} initialState={imported()} translations={{}} />)
  const flux = FLUXES.find((f) => f.target === 'fire')
  if (!flux) throw Error('缺少火焰溶剂')
  const label = catalog.localizedNames?.['zh-CN']?.[flux.name] ?? flux.name
  click(`选择溶剂 ${label}`)
  click('预览溶剂结果')
  click('取消溶剂结果')
  expect(screen.queryByText(`${label} × 1`)).toBeNull()
  click(`选择溶剂 ${label}`)
  click('预览溶剂结果')
  click('应用溶剂结果')
  expect(screen.getByText(`${label} × 1`)).toBeTruthy()
  click('从当前装备提取目标')
  fireEvent.click(screen.getByRole('checkbox', { name: '复制基础数值为精确条件' }))
  click('用所选词缀替换显式目标')
  click('保存演练到本机')
  const applied = saved()
  expect(applied.rulesVersion).toBe('basic-2026-09-12-v75')
  expect(applied.fluxCatalogSignature).toBe(fluxCatalogSignature(catalog))
  expect(
    applied.targetDefinitions.targets.filter((t: { modId: string }) => t.modId === 'FireResist4'),
  ).toHaveLength(3)
  expect(applied.operations[0].rolls.map((r: { affixId: string }) => r.affixId)).toEqual([
    'a3',
    'a4',
  ])
  expect(parseTargetCraftProject(JSON.stringify(applied), catalog).ok).toBe(true)
  click('撤销')
  click('保存演练到本机')
  expect(saved().cursor).toBe(0)
  expect(saved().operations).toHaveLength(1)
  click('重做')
  expect(screen.getByText(`${label} × 1`)).toBeTruthy()
  click('恢复本机演练')
  expect(screen.getByText('演练项目已恢复。')).toBeTruthy()
  expect(screen.queryByText(`${label} × 1`)).toBeNull()
})
