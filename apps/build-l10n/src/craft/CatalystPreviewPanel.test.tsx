import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  applyCraftStep,
  type CraftCatalog,
  type CraftState,
  createCraftItemDictionary,
  exportCraftItemText,
  importCraftState,
  inspectItem,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { CatalystPreviewPanel } from './CatalystPreviewPanel'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(
  readFileSync(
    resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../data/craft/catalog.json'),
    'utf8',
  ),
)
const initialState: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  affixes: [{ modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] }],
}
const translations = catalog.localizedNames?.['zh-CN'] ?? {}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('切换比较类型同时保留指定品质，返回当前时恢复真实类型和品质', () => {
  const state: CraftState = { ...initialState, catalyst: { id: 'Flesh', quality: 20 } }
  const { rerender } = render(
    <CatalystPreviewPanel catalog={catalog} state={state} translations={translations} />,
  )
  fireEvent.change(screen.getByLabelText('催化剂类型'), { target: { value: 'Neural' } })
  rerender(
    <CatalystPreviewPanel
      catalog={catalog}
      state={{ ...state, catalyst: { id: 'Flesh', quality: 0 } }}
      translations={translations}
    />,
  )
  expect((screen.getByLabelText('催化剂类型') as HTMLSelectElement).value).toBe('Neural')
  expect((screen.getByLabelText('预览品质（%）') as HTMLInputElement).value).toBe('20')
  fireEvent.click(screen.getByRole('button', { name: '按当前品质比较' }))
  expect((screen.getByLabelText('催化剂类型') as HTMLSelectElement).value).toBe('Flesh')
  expect((screen.getByLabelText('预览品质（%）') as HTMLInputElement).value).toBe('0')
})

it('失落珠宝已有品质可比较和保存，显示估算保留范围条件且不改变起点', () => {
  const state: CraftState = {
    baseId: 'Time-Lost Sapphire',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    catalyst: { id: 'Necrotic', quality: 20, declared: true },
    affixes: [
      {
        modId: 'JewelRadiusMinionCriticalMultiplier',
        lines: [
          'Notable Passive Skills in Radius also grant Minions have 12(6-12)% increased Critical Damage Bonus',
        ],
      },
    ],
  }
  const dictionary = createCraftItemDictionary(catalog)
  const text = exportCraftItemText(catalog, state, { locale: 'en', dictionary })
  if (!text.ok) throw Error(text.error)
  const item = parseItem(text.value.text)
  if (!item.ok) throw Error(item.error)
  const initial = importCraftState(
    catalog,
    state.baseId,
    item.item,
    inspectItem(item.item, dictionary),
    undefined,
    undefined,
    dictionary.stats?.entries,
  )
  if (!initial.ok) throw Error(initial.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initial.value}
      dictionary={dictionary}
      translations={translations}
    />,
  )
  const panel = within(screen.getByLabelText('催化剂效果预览'))
  expect(panel.getByText('当前催化品质：召唤生物 · 20%')).toBeDefined()
  expect(
    panel.getByRole('option', { name: `${translations['Refined Necrotic Catalyst']} · 召唤生物` }),
  ).toBeDefined()
  expect(
    panel.getByText(
      'Notable Passive Skills in Radius also grant Minions have 14% increased Critical Damage Bonus',
    ),
  ).toBeDefined()
  expect(panel.getByText(/未计算覆盖的天赋数量/)).toBeDefined()
  expect(panel.getByText('依据：目录显示精度，缩放资料缺失')).toBeDefined()
  fireEvent.change(panel.getByLabelText('预览品质（%）'), { target: { value: '10' } })
  expect(
    panel.getByText(
      'Notable Passive Skills in Radius also grant Minions have 13% increased Critical Damage Bonus',
    ),
  ).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.initialState.catalyst).toEqual({ id: 'Necrotic', quality: 20 })
  expect(saved.operations).toEqual([])
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v74')
  expect(saved.scalabilitySourceHash).toBeTruthy()
})

it('裂隙精华后预览上限跟随装备，移除后提示原有预览值超限', () => {
  const before: CraftState = {
    ...initialState,
    affixes: [...initialState.affixes, { modId: 'FireResist1', lines: ['+9% to Fire Resistance'] }],
  }
  const crafted = applyCraftStep(catalog, before, {
    kind: 'essence',
    essenceId: 'Metadata/Items/Currency/CurrencyCorruptedEssenceBreach',
    removeModId: 'FireResist1',
    values: [],
  })
  if (!crafted.ok) throw new Error(crafted.error)
  const { rerender } = render(
    <CatalystPreviewPanel catalog={catalog} state={before} translations={translations} />,
  )
  fireEvent.click(screen.getByText('比较催化剂效果'))
  expect(screen.getByText(/当前可施加上限：20%/)).toBeDefined()
  rerender(
    <CatalystPreviewPanel catalog={catalog} state={crafted.value} translations={translations} />,
  )
  expect(screen.getByText(/当前可施加上限：40%/)).toBeDefined()
  fireEvent.change(screen.getByLabelText('预览品质（%）'), { target: { value: '40' } })
  expect(screen.getByText('+26 to maximum Life')).toBeDefined()
  expect(screen.getByText(/未施加到装备/)).toBeDefined()
  const removed = applyCraftStep(catalog, crafted.value, {
    currency: 'annulment',
    modIds: [],
    removeModId: 'EssenceBreach',
  })
  if (!removed.ok) throw new Error(removed.error)
  rerender(
    <CatalystPreviewPanel catalog={catalog} state={removed.value} translations={translations} />,
  )
  expect(screen.getByRole('alert').textContent).toContain('0–20')
  expect(screen.queryByText('+26 to maximum Life')).toBeNull()
})

it('真实目录的缩放依据可见，内部数值不唯一时显示范围而非猜值', () => {
  render(
    <CatalystPreviewPanel
      catalog={catalog}
      state={{
        ...initialState,
        affixes: [
          { modId: 'LifeLeech2', lines: ['Leech 6.65% of Physical Attack Damage as Life'] },
          { modId: 'LifeRegeneration1', lines: ['1.4 Life Regeneration per second'] },
        ],
      }}
      translations={translations}
    />,
  )
  fireEvent.click(screen.getByText('比较催化剂效果'))
  expect(screen.getByText('Leech 7.98% of Physical Attack Damage as Life')).toBeDefined()
  expect(screen.getByText('依据：词缀缩放资料')).toBeDefined()
  expect(screen.getByText(/1.6–1.7/)).toBeDefined()
  expect(screen.queryByText('1.6 Life Regeneration per second')).toBeNull()
})

it('类型和品质即时比较，空值不转零，装备切换时重新核对上限', () => {
  const { rerender } = render(
    <CatalystPreviewPanel catalog={catalog} state={initialState} translations={translations} />,
  )
  fireEvent.click(screen.getByText('比较催化剂效果'))
  const panel = within(screen.getByLabelText('催化剂效果预览'))
  expect(panel.getByRole('option', { name: '血肉催化剂 · 生命' })).toBeDefined()
  expect(panel.getByText('+22 to maximum Life')).toBeDefined()
  fireEvent.change(panel.getByLabelText('预览品质（%）'), { target: { value: '' } })
  expect(panel.getByRole('alert').textContent).toContain('0–20')
  expect(panel.queryByText('+22 to maximum Life')).toBeNull()
  fireEvent.change(panel.getByLabelText('预览品质（%）'), { target: { value: '10' } })
  expect(panel.getByText('+20 to maximum Life')).toBeDefined()
  fireEvent.change(panel.getByLabelText('催化剂类型'), { target: { value: 'Neural' } })
  expect(panel.getByText('当前没有命中这类标签的属性。')).toBeDefined()
  rerender(
    <CatalystPreviewPanel
      catalog={catalog}
      state={{ ...initialState, baseId: 'Breach Ring' }}
      translations={translations}
    />,
  )
  fireEvent.change(panel.getByLabelText('催化剂类型'), { target: { value: 'Flesh' } })
  fireEvent.change(panel.getByLabelText('预览品质（%）'), { target: { value: '40' } })
  expect(panel.getByText('+26 to maximum Life')).toBeDefined()
  rerender(
    <CatalystPreviewPanel catalog={catalog} state={initialState} translations={translations} />,
  )
  expect(panel.getByRole('alert').textContent).toContain('0–20')
})

it('跟随真实神圣步骤与撤销恢复，预览不新增历史或催化剂费用', () => {
  const exported = exportCraftItemText(catalog, {
    ...initialState,
    implicitLines: ['10% increased Rarity of Items found'],
  })
  if (!exported.ok) throw new Error(exported.error)
  const parsed = parseItem(exported.value.text)
  if (!parsed.ok) throw new Error(parsed.error)
  const imported = importCraftState(
    catalog,
    initialState.baseId,
    parsed.item,
    inspectItem(parsed.item, createCraftItemDictionary(catalog, {})),
  )
  if (!imported.ok) throw new Error(imported.error)
  render(
    <RehearsalPanel catalog={catalog} initialState={imported.value} translations={translations} />,
  )
  fireEvent.click(screen.getByText('比较催化剂效果'))
  const panel = () => within(screen.getByLabelText('催化剂效果预览'))
  expect(panel().getByText('+22 to maximum Life')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '神圣石' }))
  fireEvent.change(screen.getByLabelText('Hale · 数值 1'), { target: { value: '10' } })
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(panel().getByText('+12 to maximum Life')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(screen.getByLabelText('演练项目').textContent).toContain('已保存')
  const project = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(project.operations).toHaveLength(1)
  expect(project.operations[0].currency).toBe('divine')
  expect(JSON.stringify(project)).not.toContain('catalyst')
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(panel().getByText('+22 to maximum Life')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(panel().getByText('+12 to maximum Life')).toBeDefined()
  expect(screen.getAllByText('神圣石 × 1').length).toBeGreaterThan(0)
  expect(panel().getByText(/不计材料费用/)).toBeDefined()
})

it('四类普通珠宝显示精炼名称，防具不出现催化面板', () => {
  const jewel: CraftState = {
    baseId: 'Ruby',
    itemLevel: 86,
    rarity: 'normal',
    sourceText: null,
    affixes: [],
  }
  const { rerender } = render(
    <CatalystPreviewPanel catalog={catalog} state={jewel} translations={translations} />,
  )
  fireEvent.click(screen.getByText('比较催化剂效果'))
  expect(screen.getByRole('option', { name: '精炼血肉催化剂 · 生命' })).toBeDefined()
  rerender(
    <CatalystPreviewPanel
      catalog={catalog}
      state={{ ...jewel, baseId: 'Adherent Cuffs' }}
      translations={translations}
    />,
  )
  expect(screen.queryByLabelText('催化剂效果预览')).toBeNull()
})
