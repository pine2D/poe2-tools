import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  type CraftState,
  createCraftItemDictionary,
  importCraftState,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CatalystPreviewPanel } from './CatalystPreviewPanel'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const dictionary = createCraftItemDictionary(catalog, {})
const translations = catalog.localizedNames?.['zh-CN'] ?? {}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const quality = () => screen.getByLabelText('当前催化品质').textContent
const panel = () => within(screen.getByLabelText('催化剂效果预览'))
function save() {
  click('保存演练到本机')
  return JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
}
function text(breach = false, unknown = false, amount = 40) {
  return `Item Class: Rings\nRarity: Rare\nRetained Ring\nGold Ring\n--------\n${unknown ? '品质（待核对类型）' : 'Quality (Life Modifiers)'}: +${amount}%\n--------\nItem Level: 86\n--------\n{ Implicit Modifier }\n10(6-15)% increased Rarity of Items found\n--------\n{ Prefix Modifier "Hale" — Life — ${amount}% Increased }\n+19(10-19) to maximum Life${breach ? '\n{ Prefix Modifier "Breachlord\'s" }\n+20% to Maximum Quality (crafted)' : ''}`
}
function setup(baseId = 'Gold Ring', raw?: string) {
  const base = catalog.bases.find((entry) => entry.id === baseId)
  if (!base) throw Error('缺少实际基底')
  const parsed = raw ? parseItem(raw) : null
  if (parsed && !parsed.ok) throw Error(parsed.error)
  const imported = parsed?.ok
    ? { baseId, item: parsed.item, ...inspectItem(parsed.item, dictionary) }
    : undefined
  return render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={86}
      imported={imported}
      translations={translations}
      translateLine={undefined}
      dictionary={dictionary}
      onRestore={() => {}}
    />,
  )
}
function imported(breach = false) {
  const view = setup('Gold Ring', text(breach))
  click('从当前装备开始')
  return view
}
function removeMaximum() {
  click('剥离石')
  const button = screen
    .getAllByRole('button', { name: /选择移除此组/ })
    .find((entry) => entry.getAttribute('aria-label')?.includes('Maximum Quality'))
  if (!button) throw Error('没有最大品质移除候选')
  fireEvent.click(button)
  click('应用本次结果')
}
function effectiveGoal() {
  change('搜索目标词缀', 'IncreasedLife1')
  click('加入目标 IncreasedLife1')
  click('设置数值条件 IncreasedLife1')
  change('IncreasedLife1 · 条件口径', 'effective')
  change('IncreasedLife1 · 数值 1 最小值', '26')
  click('保存数值条件 IncreasedLife1')
}
function consume() {
  change('本次搭配预兆', 'catalysing_exaltation')
  click('崇高石')
  change('搜索合法词缀', 'FireResist1')
  const button = document.querySelector('.rehearsal-candidates button')
  if (!button) throw Error('没有崇高候选')
  fireEvent.click(button)
  click('应用本次结果')
}
function future() {
  const view = imported()
  consume()
  click('撤销')
  return { view, golden: save() }
}
function enableLibrary() {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, callback: () => unknown) => callback() },
  })
}
async function collect() {
  fireEvent.click(screen.getByText('演练收藏'))
  change('收藏名称', '高催化品质')
  await act(async () => {
    click('收藏当前演练')
  })
}
afterEach(() => {
  cleanup()
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'locks')
})

it.each([
  ['Gold Ring', 40, 20],
  ['Amber Amulet', 40, 20],
  ['Breach Ring', 60, 40],
] as const)(
  '搜索%s可声明已有%s品质，来源与v79保存，起点声明不消费材料',
  (base, maximum, active) => {
    setup(base)
    change('起点催化品质类型', 'Flesh')
    expect((screen.getByLabelText('起点催化品质（%）') as HTMLInputElement).max).toBe(
      String(maximum + 10),
    )
    change('起点催化品质（%）', String(maximum + 11))
    expect(screen.queryByRole('button', { name: '从空白基底开始' })).toBeNull()
    change('起点催化品质（%）', String(maximum))
    click('从空白基底开始')
    expect(quality()).toContain(`生命 · ${maximum}%`)
    expect(panel().getByText(new RegExp(`当前可施加上限：${active}%`))).toBeDefined()
    expect(screen.getByRole('region', { name: '已消耗材料' }).textContent).not.toContain('催化剂 ×')
    const saved = save()
    expect(saved.rulesVersion).toBe('basic-2026-09-16-v79')
    expect(saved.initialState.catalyst).toEqual({ id: 'Flesh', quality: maximum, declared: true })
    expect(saved.operations).toEqual([])
    expect(saved.essenceSourceHash).toBe(
      catalog._meta.sources.find((s) => s.path === 'src/Data/Essence.lua')?.sha256,
    )
    expect(parseTargetCraftProject(JSON.stringify(saved), catalog, dictionary).ok).toBe(true)
  },
)

it('当前40高于施加20仍准确估算，其它超限假想值拒绝；目录变化清除比较', () => {
  const state: CraftState = {
    baseId: 'Gold Ring',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    affixes: [{ modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] }],
    catalyst: { id: 'Flesh', quality: 40 },
  }
  const view = render(
    <CatalystPreviewPanel catalog={catalog} state={state} translations={translations} />,
  )
  expect(panel().getByText('+26 to maximum Life')).toBeDefined()
  expect(panel().getByText(/已有品质保留/)).toBeDefined()
  expect((screen.getByLabelText('预览品质（%）') as HTMLInputElement).value).toBe('40')
  change('预览品质（%）', '39')
  expect(panel().getByRole('alert')).toBeDefined()
  click('按当前品质比较')
  change('催化剂类型', 'Neural')
  expect(panel().getByRole('alert')).toBeDefined()
  change('预览品质（%）', '10')
  view.rerender(
    <CatalystPreviewPanel
      catalog={structuredClone(catalog)}
      state={state}
      translations={translations}
    />,
  )
  expect((screen.getByLabelText('催化剂类型') as HTMLSelectElement).value).toBe('Flesh')
  expect((screen.getByLabelText('预览品质（%）') as HTMLInputElement).value).toBe('40')
  expect(panel().getByText('+26 to maximum Life')).toBeDefined()
  view.rerender(
    <CatalystPreviewPanel catalog={catalog} state={state} translations={translations} />,
  )
  expect((screen.getByLabelText('催化剂类型') as HTMLSelectElement).value).toBe('Flesh')
  expect((screen.getByLabelText('预览品质（%）') as HTMLInputElement).value).toBe('40')
})

it('未知中文40品质仍需主动核对类型与高级基础值，不能直接开始', () => {
  setup('Gold Ring', text(false, true))
  expect(screen.queryByRole('button', { name: '从当前装备开始' })).toBeNull()
  change('核对催化品质类型', 'Flesh')
  expect(screen.queryByRole('button', { name: '从当前装备开始' })).toBeNull()
  fireEvent.click(screen.getByLabelText('已核对类型，且原文数值为高级基础值'))
  click('从当前装备开始')
  expect(panel().getByText('+26 to maximum Life')).toBeDefined()
  expect(save().initialState.catalyst).toEqual({ id: 'Flesh', quality: 40, declared: true })
})

it('移除最大品质工艺保留40与有效目标，导出高级原文再次导入仍可制作', () => {
  imported(true)
  expect(panel().getByText(/当前可施加上限：40%/)).toBeDefined()
  effectiveGoal()
  removeMaximum()
  expect(quality()).toContain('40%')
  expect(panel().getByText(/当前可施加上限：20%/)).toBeDefined()
  expect(
    within(screen.getByRole('region', { name: '制作目标与下一步' })).getByText('已达成 1 / 1'),
  ).toBeDefined()
  const saved = save()
  expect(saved.operations[0].removeAffixId).toBe('a2')
  const restored = parseTargetCraftProject(JSON.stringify(saved), catalog, dictionary)
  if (!restored.ok) throw Error(restored.error)
  const current = restored.value.states[saved.cursor]
  if (!current) throw Error('缺少恢复状态')
  change('装备文本语言', 'en')
  click('导出装备文本')
  const raw = (screen.getByLabelText('演练装备英文文本') as HTMLTextAreaElement).value
  expect(raw).toContain('Quality (Life Modifiers): +40%')
  expect(raw).not.toContain('Maximum Quality')
  const parsed = parseItem(raw)
  if (!parsed.ok) throw Error(parsed.error)
  const next = importCraftState(
    catalog,
    'Gold Ring',
    parsed.item,
    inspectItem(parsed.item, dictionary),
  )
  expect(next.ok).toBe(true)
  if (next.ok) {
    expect(next.value.catalyst?.quality).toBe(40)
    expect(next.value.affixes[0]?.lines).toEqual(current.affixes[0]?.lines)
  }
})

it('催化崇高取消不消费，应用消费全部40，撤销重做恢复且有效目标失配', () => {
  imported()
  effectiveGoal()
  change('本次搭配预兆', 'catalysing_exaltation')
  click('崇高石')
  change('搜索合法词缀', 'FireResist1')
  fireEvent.click(document.querySelector('.rehearsal-candidates button') as HTMLButtonElement)
  click('取消本次结果')
  expect(quality()).toContain('40%')
  expect(save().operations).toEqual([])
  consume()
  expect(quality()).toContain('0%')
  expect(panel().getByText('+19 to maximum Life')).toBeDefined()
  expect(
    within(screen.getByRole('region', { name: '制作目标与下一步' })).getByText('已达成 0 / 1'),
  ).toBeDefined()
  const cost = within(screen.getByRole('region', { name: '已消耗材料' }))
  expect(cost.getByText('催化崇高预兆 × 1')).toBeDefined()
  expect(cost.getByText('崇高石 × 1')).toBeDefined()
  click('撤销')
  expect(quality()).toContain('40%')
  click('重做')
  expect(quality()).toContain('0%')
  expect(save().rulesVersion).toBe('basic-2026-09-16-v79')
})

it('文件恢复保留40品质起点、消费future与来源', async () => {
  const { golden } = future()
  expect(golden.cursor).toBe(0)
  expect(golden.operations).toHaveLength(1)
  await act(async () => {
    fireEvent.change(screen.getByLabelText('选择演练项目文件'), {
      target: {
        files: [
          new File([JSON.stringify(golden)], 'retained.craft.json', { type: 'application/json' }),
        ],
      },
    })
  })
  expect(save()).toEqual(golden)
  click('重做')
  expect(quality()).toContain('0%')
})

it('收藏恢复完整高品质future', async () => {
  enableLibrary()
  const { golden } = future()
  await collect()
  click('重做')
  click('恢复收藏 高催化品质')
  expect(save()).toEqual(golden)
  expect(quality()).toContain('40%')
})

it('沿用高品质项目不搬源品质和消费历史', async () => {
  enableLibrary()
  const { view } = future()
  change('搜索目标词缀', 'IncreasedLife1')
  click('加入目标 IncreasedLife1')
  await collect()
  view.unmount()
  setup()
  click('从空白基底开始')
  fireEvent.click(screen.getByText('演练收藏'))
  click('沿用收藏方案 高催化品质')
  click('应用收藏方案')
  const saved = save()
  expect(saved.initialState.catalyst).toBeUndefined()
  expect(saved.operations).toEqual([])
  expect(saved.targetDefinitions.targets).toEqual([{ targetId: 't1', modId: 'IncreasedLife1' }])
})

it('常规20起点应用裂隙精华再撤销，future共存仍要求v79和精华来源', () => {
  setup('Gold Ring', text(false, false, 20))
  click('从当前装备开始')
  const essence = catalog.essences?.find(
    (entry) => entry.id === 'Metadata/Items/Currency/CurrencyCorruptedEssenceBreach',
  )
  if (!essence) throw Error('缺少裂隙精华')
  const label = translations[essence.name] ?? essence.name
  click(`选择精华 ${label}`)
  fireEvent.click(within(screen.getByLabelText('精华保证结果')).getByRole('radio'))
  click('预览精华结果')
  click('应用精华结果')
  expect(quality()).toContain('20%')
  expect(panel().getByText(/当前可施加上限：40%/)).toBeDefined()
  click('撤销')
  const saved = save()
  expect(
    saved.initialState.affixes.some((a: { modId: string }) => a.modId === 'EssenceBreach'),
  ).toBe(false)
  expect(saved.cursor).toBe(0)
  expect(saved.operations).toHaveLength(1)
  expect(saved.rulesVersion).toBe('basic-2026-09-16-v79')
  expect(saved.essenceSourceHash).toMatch(/^[a-f0-9]{64}$/)
  expect(parseTargetCraftProject(JSON.stringify(saved), catalog, dictionary).ok).toBe(true)
})

it('70品质中文类型核对、催化消费与完整未来保存恢复使用v120', () => {
  const raw = text(false, true, 70)
    .replace('Gold Ring', 'Breach Ring')
    .replace('10(6-15)% increased Rarity of Items found', '+20% to Maximum Quality')
  setup('Breach Ring', raw)
  change('核对催化品质类型', 'Flesh')
  fireEvent.click(screen.getByLabelText('已核对类型，且原文数值为高级基础值'))
  click('从当前装备开始')
  expect(quality()).toContain('生命 · 70%')
  expect(panel().getByText('+32 to maximum Life')).toBeDefined()
  consume()
  expect(quality()).toContain('生命 · 0%')
  click('撤销')
  const saved = save()
  expect(saved.rulesVersion).toBe('basic-2026-09-18-v120')
  expect(saved.cursor).toBe(0)
  expect(saved.operations).toHaveLength(1)
  click('恢复本机演练')
  expect(quality()).toContain('生命 · 70%')
  click('重做')
  expect(quality()).toContain('生命 · 0%')
  expect(save().operations).toEqual(saved.operations)
})
it('搜索声明70品质不计费，超出71拒绝，保存恢复保留当前上限40', () => {
  setup('Breach Ring')
  change('起点催化品质类型', 'Flesh')
  change('起点催化品质（%）', '71')
  expect(screen.queryByRole('button', { name: '从空白基底开始' })).toBeNull()
  change('起点催化品质（%）', '70')
  click('从空白基底开始')
  const saved = save()
  expect(saved.rulesVersion).toBe('basic-2026-09-18-v120')
  expect(saved.operations).toEqual([])
  click('恢复本机演练')
  expect(quality()).toContain('生命 · 70%')
  expect(panel().getByText(/当前可施加上限：40%/)).toBeDefined()
})
