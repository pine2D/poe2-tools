import {
  type CatalogBase,
  type CraftCatalog,
  createCatalogTranslator,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
  TARGET_CRAFT_RULES_VERSION,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'

const focus: CatalogBase = {
  id: 'Test Focus',
  name: 'Test Focus',
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
}
const catalog: CraftCatalog = {
  bases: [focus],
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
  modifiers: [
    {
      id: 'FlatES',
      name: 'Test',
      kind: 'prefix',
      group: 'LocalEnergyShield',
      level: 1,
      lines: ['+(20-30) to maximum Energy Shield'],
      statOrder: [1],
      tags: [],
      addsTags: [],
      eligibility: [{ tag: 'default', value: 1 }],
      tradeHashes: {},
    },
  ],
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
}
const dictionary = {
  items: { bases: { 'Test Focus': '测试法器' }, uniques: {} },
  stats: {
    entries: [
      {
        id: 'explicit.stat_1',
        en: '#% increased Physical Damage',
        text: '物理伤害提高 #%',
      },
      { id: 'explicit.stat_2', en: '+# to maximum Energy Shield', text: '+# 能量护盾上限' },
    ],
  },
}
function setup(base = focus, source?: string, sourceCatalog = catalog) {
  const parsed = source === undefined ? null : parseItem(source)
  if (parsed && !parsed.ok) throw new Error(parsed.error)
  const item = parsed?.ok ? parsed.item : undefined
  const inspection = item ? inspectItem(item, dictionary) : undefined
  render(
    <CraftEntry
      catalog={{ ...sourceCatalog, bases: [base] }}
      base={base}
      itemLevel={40}
      imported={
        item && inspection
          ? {
              baseId: base.id,
              item,
              mods: inspection.mods,
              runes: inspection.runes,
              comparisonOnly: inspection.comparisonOnly,
            }
          : undefined
      }
      translations={{ 'Iron Rune': '钢铁符文', 'Desert Rune': '沙漠符文' }}
      translateLine={createCatalogTranslator(dictionary.stats.entries)}
      dictionary={dictionary}
      onRestore={vi.fn()}
    />,
  )
}
const select = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
function save() {
  click('保存演练到本机')
  return JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('武器打孔及中文预览、取消零花费、覆盖、撤销与重载恢复', () => {
  setup()
  click('从空白基底开始')
  click('巧匠石：添加一个孔')
  click('取消打孔')
  expect(screen.getByText('尚未消耗通货')).toBeDefined()
  click('巧匠石：添加一个孔')
  click('应用打孔')
  select('选择镶嵌符文', 'iron')
  expect(screen.getByText('物理伤害提高 16%')).toBeDefined()
  expect(screen.queryByText(/钢铁符文与普通本地防御/)).toBeNull()
  click('取消镶嵌')
  expect(save().operations).toHaveLength(1)
  select('选择镶嵌符文', 'iron')
  click('应用镶嵌')
  select('选择镶嵌符文', 'fire')
  expect(screen.queryByText(/钢铁符文防御提高/)).toBeNull()
  click('应用镶嵌')
  const saved = save()
  expect(saved.rulesVersion).toBe(TARGET_CRAFT_RULES_VERSION)
  expect(parseTargetCraftProject(JSON.stringify(saved), catalog, dictionary).ok).toBe(true)
  expect(saved.operations).toHaveLength(3)
  expect(screen.getByText('巧匠石 × 1')).toBeDefined()
  click('撤销')
  expect(screen.getByText('物理伤害提高 16%')).toBeDefined()
  click('恢复本机演练')
  expect(save().operations).toHaveLength(3)
  expect(screen.getAllByText('Adds 4 to 6 Fire Damage').length).toBeGreaterThan(0)
})

it.each([
  ['Wand', ['default', 'onehand', 'wand'], 'wand', 1],
  ['Staff', ['default', 'twohand', 'staff'], 'staff', 2],
] as const)('%s 使用自身普通效果并按手数打孔', (type, tags, category, cap) => {
  setup({ ...focus, type, tags: [...tags] }, undefined, {
    ...catalog,
    augments: [
      ...(catalog.augments ?? []),
      {
        id: category,
        name: 'Iron Rune',
        type: 'Rune',
        levelReq: 15,
        statOrder: [],
        tradeHashes: {},
        category,
        localMod: false,
        lines: ['25% increased Spell Damage'],
      },
    ],
  })
  click('从空白基底开始')
  for (let index = 0; index < cap; index++) {
    click('巧匠石：添加一个孔')
    click('应用打孔')
  }
  expect(
    (screen.getByRole('button', { name: '巧匠石：添加一个孔' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  const options = Array.from(
    (screen.getByLabelText('选择镶嵌符文') as HTMLSelectElement).options,
  ).map((option) => option.value)
  expect(options).toContain(category)
  expect(options).not.toContain('iron')
  select('选择镶嵌符文', category)
  expect(screen.getByText('25% increased Spell Damage')).toBeDefined()
  click('应用镶嵌')
  click('保存演练到本机')
  click('恢复本机演练')
  expect(screen.getAllByText('25% increased Spell Damage').length).toBeGreaterThan(0)
})

it('中文武器已有孔核对总和，错误声明禁用，覆盖后保存恢复', () => {
  setup(
    focus,
    '物品类别: 弓\n稀有度: 普通\n测试法器\n--------\n品质: +0%\n--------\n插槽: S S\n--------\n物品等级: 40\n--------\n物理伤害提高 32% (rune)',
  )
  select('核对孔位 1', 'iron')
  select('核对孔位 2', 'fire')
  expect(
    (screen.getByRole('button', { name: '按已核对孔位开始' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  select('核对孔位 2', 'iron')
  click('按已核对孔位开始')
  expect(screen.getByText('尚未消耗通货')).toBeDefined()
  select('选择镶嵌符文', 'fire')
  click('应用镶嵌')
  const saved = save()
  expect(saved.importedSockets).toEqual(['iron', 'iron'])
  expect(saved.initialState.runeSourceLines).toEqual(['32% increased Physical Damage'])
  click('恢复本机演练')
  expect(screen.getAllByText('Adds 4 to 6 Fire Damage').length).toBeGreaterThan(0)
})
