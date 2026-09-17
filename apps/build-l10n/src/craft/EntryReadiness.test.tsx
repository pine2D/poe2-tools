import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  importIdentifiedCraftState,
  inspectItem,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CraftEntry } from './CraftEntry'

const catalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')) as CraftCatalog
afterEach(cleanup)

function setup(baseId: string, text: string) {
  const base = catalog.bases.find((entry) => entry.id === baseId)
  if (!base) throw new Error('缺少测试基底')
  const parsed = parseItem(text)
  if (!parsed.ok) throw new Error(parsed.error)
  return render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={86}
      imported={{ baseId, item: parsed.item, ...inspectItem(parsed.item, {}) }}
      translations={{}}
      translateLine={undefined}
      dictionary={undefined}
      onRestore={() => {}}
    />,
  )
}

it('催化声明定位已有控件，未确认不能被诊断入口解锁', () => {
  setup(
    'Gold Ring',
    'Item Class: Rings\nRarity: Rare\nTest Ring\nGold Ring\n--------\n品质（待核对类型）: +20%\n--------\nItem Level: 86\n--------\n{ Implicit Modifier }\n10(6-15)% increased Rarity of Items found\n--------\n{ Prefix Modifier "Hale" — Life — 20% Increased }\n+19(10-19) to maximum Life',
  )
  const summary = within(screen.getByRole('region', { name: '制作起点核对' }))
  fireEvent.click(summary.getByRole('button', { name: '定位催化品质类型' }))
  expect(document.activeElement).toBe(screen.getByLabelText('核对催化品质类型'))
  expect(screen.queryByRole('button', { name: '从当前装备开始' })).toBeNull()
  fireEvent.change(screen.getByLabelText('核对催化品质类型'), { target: { value: 'Flesh' } })
  expect(screen.queryByRole('button', { name: '从当前装备开始' })).toBeNull()
  fireEvent.click(screen.getByLabelText('已核对类型，且原文数值为高级基础值'))
  expect(summary.getByText('当前装备已通过起点校验，可开始演练。')).toBeDefined()
})

it('技能补充定位最高等级及辅助孔控件，不导航空白起点技能选择', () => {
  setup(
    'Absent Amulet',
    'Item Class: Amulets\nRarity: Normal\nAbsent Amulet\n--------\nItem Level: 86\n--------\n{ Implicit Modifier }\n-1 Prefix Modifier allowed\n{ Implicit Modifier }\n-1 Suffix Modifier allowed\n--------\nGrants Skill: Level 8 Cast on Critical',
  )
  const summary = within(screen.getByRole('region', { name: '制作起点核对' }))
  fireEvent.click(summary.getByRole('button', { name: '定位装备最高技能等级' }))
  expect(document.activeElement).toBe(screen.getByLabelText('起点装备最高技能等级'))
  fireEvent.click(summary.getByRole('button', { name: '定位技能辅助孔数' }))
  expect(document.activeElement).toBe(screen.getByLabelText('起点技能辅助孔数'))
  expect(summary.queryByText('空白起点授予技能')).toBeNull()
})

it('中文词条已识别也保留核心对不支持词缀身份的错误', () => {
  const base = catalog.bases.find((entry) => entry.id === 'Gold Ring')
  if (!base) throw new Error('缺少测试基底')
  const parsed = parseItem(
    '物品类别: 戒指\n稀有度: 魔法\n测试戒指\n金光戒指\n--------\n物品等级: 86\n--------\n{ Implicit Modifier }\n10(6-15)% increased Rarity of Items found\n--------\n{ 前缀词缀 "UnknownIdentity" }\n测试属性 +19(10-19)',
  )
  if (!parsed.ok) throw new Error(parsed.error)
  const dictionary = {
    items: { bases: { 'Gold Ring': '金光戒指' }, uniques: {} },
    stats: { entries: [{ id: 'life', en: '+# to Unsupported Attribute', text: '测试属性 +#' }] },
  }
  const inspection = inspectItem(parsed.item, dictionary)
  expect(inspection.mods.at(-1)?.stats[0]?.resolution.english).toBeTruthy()
  const checked = importIdentifiedCraftState(
    catalog,
    base.id,
    parsed.item,
    {
      ...inspection,
      base: { english: base.id, candidates: [] },
    },
    undefined,
    undefined,
    dictionary.stats.entries,
  )
  expect(checked.ok).toBe(false)
  if (checked.ok) throw new Error('测试起点不应受支持')
  render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={86}
      imported={{ ...inspection, baseId: base.id, item: parsed.item }}
      dictionary={dictionary}
      translations={{}}
      translateLine={undefined}
      onRestore={() => {}}
    />,
  )
  expect(
    within(screen.getByRole('region', { name: '制作起点核对' })).getByText(
      `核心校验：${checked.error}`,
    ),
  ).toBeDefined()
  expect(screen.queryByRole('button', { name: '从当前装备开始' })).toBeNull()
})
