import { readFileSync } from 'node:fs'
import {
  applyCraftStep,
  type CraftCatalog,
  type CraftResult,
  type CraftState,
  createCatalogTranslator,
  createCraftItemDictionary,
  exportCraftItemText,
  importIdentifiedCraftState,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', () => ({ requestTargetRoutes: () => () => {} }))
const source: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog: CraftCatalog = {
  ...source,
  modifiers: source.modifiers.filter((mod) =>
    ['IncreasedLife1', 'EssenceLocalRuneAndSoulCoreEffect1'].includes(mod.id),
  ),
}
const dictionary = createCraftItemDictionary(catalog, {
  items: JSON.parse(readFileSync('data/dict/zh-CN/items.json', 'utf8')),
  stats: JSON.parse(readFileSync('data/dict/zh-CN/stats.json', 'utf8')),
})
const id = (name: string, category: string) => `pob2:augment:${JSON.stringify([name, category])}`
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
const initial = (baseId: string): CraftState => ({
  baseId,
  itemLevel: 86,
  rarity: 'rare',
  affixes: [],
  sourceText: null,
  sockets: [null, null],
  quality: 20,
})
function save() {
  click('保存演练到本机')
  return must(
    parseTargetCraftProject(
      localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '',
      catalog,
      dictionary,
    ),
  ).project
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('头盔雕像展示条件说明，共享限量支持同孔替换并保存未执行未来', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={{ ...initial('Archon Crown'), rarity: 'normal' }}
    />,
  )
  change('选择镶嵌符文', id('Carved Mischief', 'helmet'))
  expect(screen.getByLabelText('镶嵌草稿').textContent).toContain('保留触发条件与作用对象')
  expect(screen.getByLabelText('镶嵌草稿').textContent).toContain('远古增幅物共用一枚限量')
  click('取消镶嵌')
  expect(save().operations).toHaveLength(0)
  change('选择镶嵌符文', id('Carved Mischief', 'helmet'))
  click('应用镶嵌')
  change('目标孔位', '1')
  change('选择镶嵌符文', id('Carved Tenacity', 'helmet'))
  expect(screen.getByRole('button', { name: '应用镶嵌' }).hasAttribute('disabled')).toBe(true)
  click('取消镶嵌')
  change('选择镶嵌符文', id('Desert Rune', 'armour'))
  click('应用镶嵌')
  change('目标孔位', '0')
  change('选择镶嵌符文', id('Carved Cunning', 'helmet'))
  click('应用镶嵌')
  click('撤销')
  const project = save()
  expect(project.rulesVersion).toBe('basic-2026-09-17-v111')
  expect(project.operations).toHaveLength(3)
  expect(project.cursor).toBe(2)
  click('恢复本机演练')
  click('重做')
  expect(screen.getByLabelText('当前镶嵌效果').textContent).toContain(
    'Enemies which are on Full Life cannot Evade your Hits',
  )
  expect(save().cursor).toBe(3)
})

it('鞋部恐惧增效的中文观察可恢复和覆盖，保留6秒猛攻与原始来源', () => {
  const sockets = [id('Carved Cunning', 'boots'), id('Desert Rune', 'armour')]
  const crafted = must(
    applyCraftStep(
      catalog,
      {
        ...initial('Adherent Leggings'),
        sockets,
        affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }],
      },
      {
        kind: 'essence',
        essenceId: 'Metadata/Items/Currency/CurrencyCorruptedEssenceHorror',
        removeModId: 'IncreasedLife1',
        values: [],
      },
    ),
  )
  const text = must(exportCraftItemText(catalog, crafted, { locale: 'zh-CN', dictionary })).text
  expect(text).toMatch(/6.*秒.*猛攻|猛攻.*6.*秒/)
  expect(text).not.toContain('Gain Onslaught for')
  const parsed = parseItem(text)
  if (!parsed.ok) throw Error(parsed.error)
  const imported = must(
    importIdentifiedCraftState(
      catalog,
      crafted.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      sockets,
      undefined,
      dictionary.stats?.entries,
    ),
  )
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={catalog.localizedNames?.['zh-CN'] ?? {}}
      dictionary={dictionary}
      translateLine={createCatalogTranslator(dictionary.stats?.entries ?? [])}
      initialState={imported}
      importedSockets={sockets}
    />,
  )
  expect(save().operations).toHaveLength(0)
  change('选择镶嵌符文', id('Carved Tenacity', 'boots'))
  expect(screen.getByLabelText('镶嵌草稿').textContent).toContain('保留触发条件与作用对象')
  click('应用镶嵌')
  click('撤销')
  expect(save().initialState.sourceText).toBe(text)
  click('恢复本机演练')
  click('重做')
  expect(screen.getByLabelText('当前镶嵌效果').textContent).toContain(
    'Your speed is Unaffected by Slows while Sprinting',
  )
  const project = save()
  expect(project.initialState.sourceText).toBe(text)
  expect(project.rulesVersion).toBe('basic-2026-09-17-v111')
  expect(project.cursor).toBe(1)
})
