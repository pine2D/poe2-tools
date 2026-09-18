import { readFileSync } from 'node:fs'
import { type CraftCatalog, parseTargetCraftProject } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
const initialState = {
  baseId: 'Adherent Cuffs',
  itemLevel: 86,
  rarity: 'normal' as const,
  affixes: [],
  sourceText: null,
  quality: 0,
  sockets: [null],
  nextAffixId: 1,
}
function saved() {
  click('保存演练到本机')
  const result = parseTargetCraftProject(
    localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '',
    catalog,
  )
  if (!result.ok) throw Error(result.error)
  return result.value.project
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
it('费用指引缺价暂停，明确应用范围与报价后停止；撤销、改价、单位和完整未来恢复重算', () => {
  render(<RehearsalPanel catalog={catalog} translations={{}} initialState={initialState} />)
  change('选择镶嵌符文', 'pob2:augment:["Lesser Desert Rune","armour"]')
  click('应用镶嵌')
  click('启用条件指引示例')
  change('规则 1 条件 1', 'spent-cost')
  expect(screen.getByText(/请先应用制作报价/)).toBeTruthy()
  change('规则 1 条件 1 费用下限', '3')
  expect(saved().strategy?.rules[0]?.conditions).toEqual([
    { kind: 'spent-cost', unit: 'divine', min: 0 },
  ])
  click('应用规则 1 条件 1费用范围')
  change('次级沙漠符文单价', '3')
  change('起点成本', '100')
  click('应用报价')
  expect(screen.getByText('命中规则 1：停止。')).toBeTruthy()
  const complete = saved()
  expect(complete.rulesVersion).toBe('basic-2026-09-18-v122')
  click('撤销')
  expect(screen.getByText(/命中规则 2：蜕变石/)).toBeTruthy()
  const future = saved()
  expect(future.cursor).toBe(0)
  expect(future.operations).toEqual(complete.operations)
  click('恢复本机演练')
  click('重做')
  expect(screen.getByText('命中规则 1：停止。')).toBeTruthy()
  expect(saved()).toEqual(complete)
  change('次级沙漠符文单价', '1')
  click('应用报价')
  expect(screen.getByText(/命中规则 2：蜕变石/)).toBeTruthy()
  change('规则 1 条件 1 费用单位', 'chaos')
  expect(screen.getByText(/与当前报价单位不同/)).toBeTruthy()
  change('规则 1 条件 1', 'always')
  expect(saved().rulesVersion).toBe('basic-2026-09-18-v122')
}, 15000)
it('空v122项目不因缺少费用条件降版', () => {
  const restored = parseTargetCraftProject(
    JSON.stringify({
      schemaVersion: 1,
      rulesVersion: 'basic-2026-09-18-v122',
      sourceCommit: catalog._meta.sourceCommit,
      augmentSourceHash: catalog._meta.sources.find(
        (source) => source.path === 'src/Data/ModRunes.lua',
      )?.sha256,
      initialState,
      operations: [],
      cursor: 0,
      targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
      orphanedTargets: [],
    }),
    catalog,
  )
  if (!restored.ok) throw Error(restored.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={initialState}
      initialProject={restored.value}
    />,
  )
  expect(saved().rulesVersion).toBe('basic-2026-09-18-v122')
})
