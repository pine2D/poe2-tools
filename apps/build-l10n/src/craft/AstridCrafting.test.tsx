import { readFileSync } from 'node:fs'
import {
  applyCraftStep,
  type CraftCatalog,
  type CraftState,
  type CraftStep,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { alloyTestFixture } from '../../../../packages/item-core/src/alloyTestFixture'
import { buildCraftRehearsalReport } from './craftRehearsalReport'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', () => ({ requestTargetRoutes: () => () => {} }))
const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const astrid = `pob2:augment:${JSON.stringify(["Astrid's Creativity", 'armour'])}`
const initial = {
  baseId: 'Adherent Cuffs',
  itemLevel: 86,
  rarity: 'normal' as const,
  affixes: [],
  sourceText: null,
  sockets: [null, null],
  quality: 20,
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
function save() {
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

it('显示当前工艺占用、镶入后的容量和本件限量，取消不消耗材料', () => {
  render(<RehearsalPanel catalog={catalog} translations={{}} initialState={initial} />)
  expect(screen.getByLabelText('当前工艺容量').textContent).toContain('工艺占用 0 / 当前容量 1')
  change('选择镶嵌符文', astrid)
  expect(
    within(screen.getByLabelText('镶嵌草稿')).getByText(/其他装备与角色孔尚未核对/),
  ).toBeTruthy()
  click('取消镶嵌')
  expect(save().operations).toHaveLength(0)
  change('选择镶嵌符文', astrid)
  click('应用镶嵌')
  expect(screen.getByLabelText('当前工艺容量').textContent).toContain('工艺占用 0 / 当前容量 2')
  expect(screen.getByLabelText('镶嵌限量提示').textContent).toContain('本件 1 / 限量 1')
  expect(save().rulesVersion).toBe('basic-2026-09-16-v87')
  click('撤销')
  const future = save()
  expect(future.cursor).toBe(0)
  expect(future.operations).toHaveLength(1)
  expect(future.rulesVersion).toBe('basic-2026-09-16-v87')
  click('恢复本机演练')
  click('重做')
  expect(screen.getByLabelText('当前工艺容量').textContent).toContain('当前容量 2')
}, 15_000)

it('空白v87恢复后保留版本下限，未执行Astrid指引可以保存', () => {
  const input = {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-16-v87',
    initialState: { ...initial, nextAffixId: 1 },
    operations: [],
    cursor: 0,
    augmentSourceHash: catalog._meta.sources.find(
      (source) => source.path === 'src/Data/ModRunes.lua',
    )?.sha256,
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
  expect(save().rulesVersion).toBe(input.rulesVersion)
  click('启用条件指引示例')
  change('规则 1 条件 1', 'always')
  change('规则 1 动作', 'socket')
  change('规则 1 符文', astrid)
  const saved = save()
  expect(saved.rulesVersion).toBe(input.rulesVersion)
  expect(saved.augmentSourceHash).toBe(input.augmentSourceHash)
})

it('步骤清单显示容量变化并说明失去来源后的多工艺行为尚未核实', () => {
  const report = buildCraftRehearsalReport({
    catalog,
    initialState: initial,
    operations: [{ kind: 'socket', socketIndex: 0, augmentId: astrid }],
    cursor: 1,
    translations: {},
  })
  if (!report.ok) throw Error(report.error)
  expect(report.value).toContain('工艺占用 0 / 当前容量 1')
  expect(report.value).toContain('工艺占用 0 / 当前容量 2')
  expect(report.value).toContain('失去容量来源后的多工艺保留行为尚未核实')
})

it('已有双工艺的覆盖显示未核实，保留原词缀与历史', () => {
  const fixture = { ...catalog, alloys: alloyTestFixture() }
  let state: CraftState = {
    baseId: 'Volatile Wand',
    itemLevel: 86,
    rarity: 'magic',
    sourceText: null,
    sockets: [null, null],
    affixes: [{ modId: 'SpellDamageOnWeapon1', lines: ['30% increased Spell Damage'] }],
  }
  for (const operation of [
    {
      kind: 'socket',
      socketIndex: 0,
      augmentId: `pob2:augment:${JSON.stringify(["Astrid's Creativity", 'caster'])}`,
    },
    {
      kind: 'essence',
      essenceId: 'Metadata/Items/Currency/CurrencyGreaterEssenceCritical',
      values: [50],
    },
    {
      kind: 'alloy',
      alloyId: 'Metadata/Items/Currency/CurrencyVerisiumAlloy9',
      removeModId: 'SpellDamageOnWeapon1',
      values: [25],
    },
  ] satisfies CraftStep[]) {
    const result = applyCraftStep(fixture, state, operation)
    if (!result.ok) throw Error(result.error)
    state = result.value
  }
  render(<RehearsalPanel catalog={fixture} translations={{}} initialState={state} />)
  expect(screen.getByLabelText('当前工艺容量').textContent).toContain('工艺占用 2 / 当前容量 2')
  expect(within(screen.getByLabelText('精华制作')).getByText('工艺词缀 2/2')).toBeTruthy()
  change('选择镶嵌符文', 'pob2:augment:["Iron Rune","wand"]')
  expect(screen.getAllByText(/已有双工艺.*尚未核实/).length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: '应用镶嵌' }).hasAttribute('disabled')).toBe(true)
  click('取消镶嵌')
  expect(screen.getByLabelText('当前工艺容量').textContent).toContain('工艺占用 2 / 当前容量 2')
})

it('腐化装备新镶Astrid给出明确原因', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={{ ...initial, corrupted: true }}
    />,
  )
  change('选择镶嵌符文', astrid)
  expect(screen.getAllByText(/Astrid 不能新镶入腐化装备/).length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: '应用镶嵌' }).hasAttribute('disabled')).toBe(true)
})

it('仅Astrid材料报价也升级项目，并保留价格', () => {
  render(<RehearsalPanel catalog={catalog} translations={{}} initialState={initial} />)
  change('搜索报价材料', 'Astrid')
  fireEvent.click(screen.getByRole('button', { name: /添加报价.*创造/ }))
  fireEvent.change(screen.getByLabelText(/创造单价/), { target: { value: '3' } })
  click('应用报价')
  const saved = save()
  expect(saved.rulesVersion).toBe('basic-2026-09-16-v87')
  expect(saved.operations).toHaveLength(0)
  expect(saved.pricing?.prices["augment:Astrid's Creativity"]).toBe(3)
})
