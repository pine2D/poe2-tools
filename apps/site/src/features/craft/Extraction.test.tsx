import {
  type CraftCatalog,
  type CraftState,
  createCatalogTranslator,
  importCraftState,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    excludedBases: [],
    sources: [
      { path: 'src/Data/ModRunes.lua', url: 'https://example.test/runes', sha256: 'b'.repeat(64) },
    ],
  },
  bases: [
    {
      id: 'Test Bow',
      name: 'Test Bow',
      type: 'Bow',
      tags: ['default', 'weapon', 'twohand'],
      requirements: {},
      properties: {},
      implicit: null,
      implicitTags: [],
      sourceQuality: 20,
      socketLimit: 3,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: [],
  augments: [
    {
      id: 'iron',
      name: 'Iron Rune',
      category: 'weapon',
      type: 'Rune',
      localMod: true,
      lines: ['16% increased Physical Damage'],
      statOrder: [1],
      tradeHashes: { '1': ['16% increased Physical Damage'] },
      levelReq: 15,
    },
    {
      id: 'fire',
      name: 'Desert Rune',
      category: 'weapon',
      type: 'Rune',
      localMod: true,
      lines: ['Adds 4 to 6 Fire Damage'],
      statOrder: [1],
      tradeHashes: {},
      levelReq: 15,
    },
  ],
}
const runeDictionary = {
  items: { bases: { 'Test Bow': '测试弓' }, uniques: {} },
  stats: {
    entries: [
      { id: 'physical', en: '#% increased Physical Damage', text: '物理伤害提高 #%' },
      { id: 'fire', en: 'Adds # to # Fire Damage', text: '附加 # 至 # 火焰伤害' },
    ],
  },
}
function importedState(sockets: (string | null)[]): CraftState {
  const iron = sockets.filter((id) => id === 'iron').length
  const fire = sockets.filter((id) => id === 'fire').length
  const lines = [
    ...(iron ? [`${iron * 16}% increased Physical Damage (rune)`] : []),
    ...(fire ? [`Adds ${fire * 4} to ${fire * 6} Fire Damage (rune)`] : []),
  ]
  const source = [
    'Item Class: Bows',
    'Rarity: Normal',
    'Test Bow',
    '--------',
    `Sockets: ${sockets.map(() => 'S').join(' ')}`,
    '--------',
    'Item Level: 86',
    '--------',
    ...lines,
  ].join('\n')
  const parsed = parseItem(source)
  if (!parsed.ok) throw new Error(parsed.error)
  const imported = importCraftState(
    catalog,
    'Test Bow',
    parsed.item,
    inspectItem(parsed.item, runeDictionary),
    sockets,
  )
  if (!imported.ok) throw new Error(imported.error)
  return imported.value
}
const initial = importedState(['iron', 'fire', 'iron'])
const translations = {
  'Iron Rune': '钢铁符文',
  'Desert Rune': '沙漠符文',
  'Orb of Extraction': '萃取石',
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const setup = (state = initial) =>
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={state}
      translations={translations}
      dictionary={runeDictionary}
      {...(state.sourceText !== null && state.sockets ? { importedSockets: state.sockets } : {})}
    />,
  )
const save = () => {
  click('保存演练到本机')
  return JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
}
afterEach(() => {
  cleanup()
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'locks')
})

it('萃取预览列出重复孔物，取消不消费且恢复焦点；应用摧毁并返还，计费不抵扣', () => {
  setup()
  const trigger = screen.getByRole('button', { name: '预览萃取石结果' })
  trigger.focus()
  fireEvent.click(trigger)
  const preview = screen.getByLabelText('萃取石待应用结果')
  expect(document.activeElement).toBe(preview)
  expect(preview.textContent).toContain('装备将被摧毁')
  expect(within(preview).getByText('钢铁符文 × 2')).toBeDefined()
  expect(within(preview).getByText('沙漠符文 × 1')).toBeDefined()
  expect(preview.textContent).toContain('孔位 1、3')
  expect(save().operations).toEqual([])
  click('取消萃取石结果')
  expect(document.activeElement?.textContent).toBe('萃取石制作')
  expect(screen.getByText('尚未消耗通货')).toBeDefined()
  fireEvent.change(screen.getByLabelText('搜索报价材料'), { target: { value: '萃取石' } })
  click('添加报价 萃取石')
  fireEvent.change(screen.getByLabelText('萃取石单价'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('起点成本'), { target: { value: '10' } })
  click('应用报价')
  click('预览萃取石结果')
  click('应用萃取石结果')
  expect(document.activeElement?.textContent).toBe('装备已摧毁')
  const terminal = screen.getByLabelText('已摧毁装备')
  expect(within(terminal).getByText('钢铁符文 × 2')).toBeDefined()
  expect(terminal.textContent).not.toContain('镶嵌物均不可继续使用')
  expect(screen.getByText('萃取石 × 1')).toBeDefined()
  expect(screen.getByLabelText('当前总成本').textContent).toContain('12')
  expect(screen.queryByRole('button', { name: '导出装备文本' })).toBeNull()
  const project = save()
  expect(project.rulesVersion).toBe('basic-2026-09-16-v77')
  expect(project.operations).toEqual([{ kind: 'extraction' }])
  const parsed = parseTargetCraftProject(JSON.stringify(project), catalog, runeDictionary)
  expect(parsed.ok).toBe(true)
  if (parsed.ok) {
    expect(parsed.value.states[1]?.destroyed).toBe(true)
    expect(parsed.value.states[1]?.sockets).toEqual(initial.sockets)
  }
  click('撤销')
  expect(screen.queryByLabelText('已摧毁装备')).toBeNull()
  const future = save()
  expect(future.cursor).toBe(0)
  expect(future.operations).toEqual(project.operations)
  click('恢复本机演练')
  click('重做')
  expect(within(screen.getByLabelText('已摧毁装备')).getByText('钢铁符文 × 2')).toBeDefined()
})

it.each([{ sockets: undefined }, { sockets: [] }, { sockets: [null, null] }])(
  '孔位未知或全空不允许萃取：%j',
  ({ sockets }) => {
    const { sockets: _sockets, runeSourceLines: _runeLines, sourceText: _source, ...rest } = initial
    const withoutSockets = { ...rest, sourceText: null }
    setup(sockets === undefined ? withoutSockets : { ...withoutSockets, sockets })
    expect(
      (screen.getByRole('button', { name: '预览萃取石结果' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(save().operations).toEqual([])
  },
)

it('条件指引使用同一萃取预览与返还终态', () => {
  setup()
  click('启用条件指引示例')
  fireEvent.change(screen.getByLabelText('规则 1 条件 1'), { target: { value: 'always' } })
  fireEvent.change(screen.getByLabelText('规则 1 动作'), { target: { value: 'extraction' } })
  expect(save().strategy.rules[0].action).toEqual({ kind: 'extraction' })
  click('开始指引步骤')
  expect(
    within(screen.getByLabelText('指引结果选择')).getByRole('button', { name: '预览萃取石结果' }),
  ).toBeDefined()
  click('预览萃取石结果')
  click('应用萃取石结果')
  expect(save().operations).toEqual([{ kind: 'extraction' }])
  expect(within(screen.getByLabelText('已摧毁装备')).getByText('沙漠符文 × 1')).toBeDefined()
  expect(screen.queryByRole('button', { name: '开始指引步骤' })).toBeNull()
})

it('v77 文件与收藏恢复完整未来，沿用规则不搬运萃取历史或返还', async () => {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, callback: () => unknown) => callback() },
  })
  const view = setup()
  click('启用条件指引示例')
  fireEvent.change(screen.getByLabelText('规则 1 条件 1'), { target: { value: 'always' } })
  fireEvent.change(screen.getByLabelText('规则 1 动作'), { target: { value: 'extraction' } })
  click('预览萃取石结果')
  click('应用萃取石结果')
  click('撤销')
  const golden = save()
  const file = new File([JSON.stringify(golden)], 'extraction.craft.json', {
    type: 'application/json',
  })
  await act(async () => {
    fireEvent.change(screen.getByLabelText('选择演练项目文件'), { target: { files: [file] } })
  })
  expect(save()).toEqual(golden)
  fireEvent.click(screen.getByText('演练收藏'))
  fireEvent.change(screen.getByLabelText('收藏名称'), { target: { value: '萃取未来' } })
  await act(async () => {
    click('收藏当前演练')
  })
  click('重做')
  // 终态使用独立渲染分支，重新展开实际收藏入口。
  fireEvent.click(screen.getByText('演练收藏'))
  click('恢复收藏 萃取未来')
  expect(save()).toEqual(golden)
  view.unmount()
  setup(importedState(['fire', null, null]))
  fireEvent.click(screen.getByText('演练收藏'))
  click('沿用收藏方案 萃取未来')
  click('应用收藏方案')
  const reused = save()
  expect(reused.operations).toEqual([])
  expect(reused.cursor).toBe(0)
  expect(reused.initialState.sockets).toEqual(['fire', null, null])
  expect(reused.strategy).toEqual(golden.strategy)
  expect(screen.queryByLabelText('已摧毁装备')).toBeNull()
  click('开始指引步骤')
  click('预览萃取石结果')
  click('应用萃取石结果')
  const terminal = screen.getByLabelText('已摧毁装备')
  expect(within(terminal).getByText('沙漠符文 × 1')).toBeDefined()
  expect(within(terminal).queryByText('钢铁符文 × 2')).toBeNull()
})

it('搜索起点打孔镶嵌后萃取保留原材料费用', () => {
  const base = catalog.bases[0]
  if (!base) throw new Error('缺少基底')
  render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={86}
      translations={translations}
      imported={undefined}
      translateLine={undefined}
      dictionary={undefined}
      onRestore={vi.fn()}
    />,
  )
  click('从空白基底开始')
  click('巧匠石：添加一个孔')
  click('应用打孔')
  fireEvent.change(screen.getByLabelText('选择镶嵌符文'), { target: { value: 'iron' } })
  click('应用镶嵌')
  click('预览萃取石结果')
  click('应用萃取石结果')
  expect(screen.getByText('巧匠石 × 1')).toBeDefined()
  expect(screen.getByText('萃取石 × 1')).toBeDefined()
  expect(within(screen.getByLabelText('已摧毁装备')).getByText('钢铁符文 × 1')).toBeDefined()
  const project = save()
  expect(project.operations.map((operation: { kind: string }) => operation.kind)).toEqual([
    'artificer',
    'socket',
    'extraction',
  ])
  expect(project.cursor).toBe(3)
})

it('中文导入逐孔核对后萃取两颗相同符文，项目保留原文与声明', () => {
  const base = catalog.bases[0]
  if (!base) throw new Error('缺少基底')
  const dictionary = {
    items: { bases: { 'Test Bow': '测试弓' }, uniques: {} },
    stats: {
      entries: [{ id: 'physical', en: '#% increased Physical Damage', text: '物理伤害提高 #%' }],
    },
  }
  const source =
    '物品类别: 弓\n稀有度: 普通\n测试弓\n--------\n品质: +0%\n--------\n插槽: S S\n--------\n物品等级: 86\n--------\n物理伤害提高 32% (rune)'
  const parsed = parseItem(source)
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, dictionary)
  render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={86}
      translations={translations}
      dictionary={dictionary}
      translateLine={createCatalogTranslator(dictionary.stats.entries)}
      imported={{
        baseId: base.id,
        item: parsed.item,
        mods: inspection.mods,
        runes: inspection.runes,
        comparisonOnly: inspection.comparisonOnly,
      }}
      onRestore={vi.fn()}
    />,
  )
  for (const index of [1, 2])
    fireEvent.change(screen.getByLabelText(`核对孔位 ${index}`), { target: { value: 'iron' } })
  click('按已核对孔位开始')
  click('预览萃取石结果')
  click('应用萃取石结果')
  expect(within(screen.getByLabelText('已摧毁装备')).getByText('钢铁符文 × 2')).toBeDefined()
  const project = save()
  expect(project.initialState.sourceText).toBe(source)
  expect(project.importedSockets).toEqual(['iron', 'iron'])
  expect(parseTargetCraftProject(JSON.stringify(project), catalog, dictionary).ok).toBe(true)
  click('恢复本机演练')
  expect(within(screen.getByLabelText('已摧毁装备')).getByText('钢铁符文 × 2')).toBeDefined()
})

it.each(['extraction', 'architect'] as const)('腐化后 %s 终态只按实际操作显示返还', (kind) => {
  setup()
  click('预演腐化：属性不变')
  click('应用腐化结果')
  if (kind === 'extraction') {
    click('预览萃取石结果')
    click('应用萃取石结果')
  } else {
    click('预演建筑师：摧毁物品')
    click('应用建筑师摧毁结果')
  }
  const terminal = screen.getByLabelText('已摧毁装备')
  if (kind === 'extraction') expect(within(terminal).getByText('钢铁符文 × 2')).toBeDefined()
  else {
    expect(within(terminal).queryByLabelText('萃取返还清单')).toBeNull()
    expect(terminal.textContent).toContain('装备与镶嵌物均不可继续使用')
  }
  const project = save()
  expect(project.operations).toEqual([
    { kind: 'vaal', outcome: 'unchanged' },
    kind === 'extraction' ? { kind } : { kind, outcome: 'destroy' },
  ])
  expect(parseTargetCraftProject(JSON.stringify(project), catalog, runeDictionary).ok).toBe(true)
})

it('未知孔位的未执行萃取指引保留镶嵌来源指纹，允许保存而继续阻止执行', () => {
  setup({ baseId: 'Test Bow', itemLevel: 86, rarity: 'normal', sourceText: null, affixes: [] })
  click('启用条件指引示例')
  fireEvent.change(screen.getByLabelText('规则 1 条件 1'), { target: { value: 'always' } })
  fireEvent.change(screen.getByLabelText('规则 1 动作'), { target: { value: 'extraction' } })
  const project = save()
  expect(project.operations).toEqual([])
  expect(project.rulesVersion).toBe('basic-2026-09-16-v77')
  expect(project.augmentSourceHash).toBe('b'.repeat(64))
  expect(project.strategy.rules[0].action).toEqual({ kind: 'extraction' })
  expect(parseTargetCraftProject(JSON.stringify(project), catalog, runeDictionary).ok).toBe(true)
  expect(screen.queryByRole('button', { name: '开始指引步骤' })).toBeNull()
})
