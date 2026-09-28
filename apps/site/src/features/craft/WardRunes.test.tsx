import { readFileSync } from 'node:fs'
import { type CraftCatalog, type CraftState, parseTargetCraftProject } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', () => ({ requestTargetRoutes: () => () => {} }))
const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  runeforging: JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8')),
}
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
const start: CraftState = {
  baseId: 'Adherent Cuffs',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
  quality: 20,
  sockets: [null],
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
function save() {
  click('保存演练到本机')
  const text = localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? ''
  const parsed = parseTargetCraftProject(text, catalog)
  if (!parsed.ok) throw Error(parsed.error)
  return parsed.value.project
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('普通防具镶入结界符文预览新增面板，覆盖为再生后移除结界，完整未来可恢复', () => {
  render(<RehearsalPanel catalog={catalog} initialState={start} translations={{}} />)
  change('选择镶嵌符文', id('Perfect Ward Rune'))
  expect(screen.queryByText(/钢铁符文与普通本地防御提高相加/)).toBeNull()
  expect(screen.getByText(/结界符文提供本地平值/)).toBeTruthy()
  expect(
    within(screen.getByLabelText('镶嵌草稿')).getByText('+30 to maximum Runic Ward'),
  ).toBeTruthy()
  expect(within(screen.getByLabelText('防御面板估算')).getByText('0 → 36（+36）')).toBeTruthy()
  click('取消镶嵌')
  expect(save().operations).toEqual([])
  change('选择镶嵌符文', id('Perfect Ward Rune'))
  click('应用镶嵌')
  expect(save().rulesVersion).toBe('basic-2026-09-16-v83')
  change('选择镶嵌符文', id('Lesser Charging Rune'))
  expect(screen.queryByText(/失去这个孔的钢铁符文/)).toBeNull()
  expect(screen.getByText(/失去这个孔的结界符文平值/)).toBeTruthy()
  expect(within(screen.getByLabelText('防御面板估算')).getByText('36 → 0（-36）')).toBeTruthy()
  click('应用镶嵌')
  expect(
    within(screen.getByLabelText('当前镶嵌效果')).getByText(
      '8% increased Runic Ward Regeneration Rate',
    ),
  ).toBeTruthy()
  click('撤销')
  const future = save()
  expect(future.cursor).toBe(1)
  expect(future.operations).toHaveLength(2)
  click('重做')
  click('恢复本机演练')
  expect(save()).toEqual(future)
  click('重做')
  expect(
    within(screen.getByLabelText('当前镶嵌效果')).getByText(
      '8% increased Runic Ward Regeneration Rate',
    ),
  ).toBeTruthy()
})

it('未执行结界符文条件指引用v83保存，锻造共存保留关系签名', () => {
  render(<RehearsalPanel catalog={catalog} initialState={start} translations={{}} />)
  click('启用条件指引示例')
  change('规则 1 条件 1', 'open-sockets')
  change('规则 1 动作', 'socket')
  change('规则 1 符文', id('Perfect Ward Rune'))
  const pending = save()
  expect(pending.rulesVersion).toBe('basic-2026-09-16-v83')
  expect(pending.operations).toEqual([])
  expect(pending.runeforgingCatalogSignature).toBeUndefined()
  click('开始指引步骤')
  click('应用镶嵌')
  click('预览锻造结果')
  click('应用锻造结果')
  const forged = save()
  expect(forged.rulesVersion).toBe('basic-2026-09-16-v83')
  expect(forged.runeforgingCatalogSignature).toBeTruthy()
  expect(forged.operations).toHaveLength(2)
  click('恢复本机演练')
  expect(save()).toEqual(forged)
})
