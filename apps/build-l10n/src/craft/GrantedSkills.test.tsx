import {
  type CatalogBase,
  type CraftCatalog,
  createCatalogTranslator,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
  TARGET_CRAFT_RULES_VERSION,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'

const base: CatalogBase = {
  id: 'Test Sceptre',
  name: 'Test Sceptre',
  type: 'Sceptre',
  tags: ['default', 'sceptre'],
  requirements: {},
  properties: {},
  implicit: 'Grants Skill: Level (1-20) Test Minion',
  implicitTags: [],
  sourceQuality: 20,
  socketLimit: 3,
  hidden: false,
  runeforged: false,
}
const catalog: CraftCatalog = {
  bases: [base],
  modifiers: [
    {
      id: 'Presence',
      name: 'Test presence',
      kind: 'prefix',
      group: 'Presence',
      lines: ['Allies in your Presence deal (20-30)% increased Damage'],
    },
    {
      id: 'Mixed',
      name: 'Test mixed',
      kind: 'suffix',
      group: 'Mana',
      lines: ['(10-20)% increased Mana Regeneration Rate', '15% increased Light Radius'],
    },
    {
      id: 'Added',
      name: 'Test added',
      kind: 'prefix',
      group: 'Fire',
      lines: ['(10-20)% increased Fire Damage'],
    },
  ].map((mod) => ({
    ...mod,
    kind: mod.kind as 'prefix' | 'suffix',
    level: 1,
    statOrder: mod.lines.map((_, i) => i + 1),
    tags: [],
    addsTags: [],
    eligibility: [{ tag: 'default', value: 1 }],
    tradeHashes: {},
  })),
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    excludedBases: [],
    sources: [],
  },
}
const dictionary = {
  items: { bases: { 'Test Sceptre': '测试权杖' }, uniques: {} },
  stats: {
    entries: [
      {
        id: 'skill.test',
        en: 'Grants Skill: Level # Test Minion',
        text: '获得技能: 等级 # 测试召唤物',
      },
      {
        id: 'explicit.presence',
        en: 'Allies in your Presence deal #% increased Damage',
        text: '在场的友军造成的伤害提高 #%',
      },
      { id: 'explicit.mana', en: '#% increased Mana Regeneration Rate', text: '魔力再生率提高 #%' },
      { id: 'explicit.light', en: '#% increased Light Radius', text: '照亮范围提高 #%' },
    ],
  },
}
const raw =
  '物品类别: 权杖\n稀有度: 稀有\n测试 圣咏\n测试权杖\n--------\n物品等级: 53\n--------\n获得技能: 等级 12 测试召唤物（最高等级 13）\n--------\n{ 前缀属性 "测试的" (等阶：6) }\n在场的友军造成的伤害提高 25(20-30)%\n{ 后缀属性 "测试之" (等阶：4) }\n魔力再生率提高 15(10-20)%\n照亮范围提高 15%'
function setup(source?: string, selectedBase: CatalogBase = base) {
  const parsed = source === undefined ? null : parseItem(source)
  if (parsed && !parsed.ok) throw new Error(parsed.error)
  const item = parsed?.ok ? parsed.item : undefined
  const inspection = item ? inspectItem(item, dictionary) : undefined
  render(
    <CraftEntry
      catalog={{ ...catalog, bases: [selectedBase] }}
      base={selectedBase}
      itemLevel={53}
      imported={
        item && inspection
          ? {
              baseId: base.id,
              item,
              mods: inspection.mods,
              skills: inspection.skills,
              comparisonOnly: inspection.comparisonOnly,
            }
          : undefined
      }
      translations={{}}
      translateLine={createCatalogTranslator(dictionary.stats.entries)}
      dictionary={dictionary}
      onRestore={vi.fn()}
    />,
  )
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
function save() {
  click('保存演练到本机')
  return JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
}
const implicit = () => within(screen.getByLabelText('当前固有属性'))
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('中文带最高等级的权杖保留混合词缀，崇高、撤销和恢复不改变授予技能', () => {
  setup(raw)
  click('从当前装备开始')
  expect(implicit().getByText(/Grants Skill: Level 12 Test Minion.*13/)).toBeDefined()
  expect(implicit().getByText('获得技能: 等级 12 测试召唤物（最高等级 13）')).toBeDefined()
  expect(screen.getByText(/角色.*加成.*未.*计算/)).toBeDefined()
  click('崇高石')
  fireEvent.click(screen.getByRole('button', { name: /Added · Test added/ }))
  click('应用本次结果')
  const saved = save()
  expect(saved.rulesVersion).toBe(TARGET_CRAFT_RULES_VERSION)
  expect(parseTargetCraftProject(JSON.stringify(saved), catalog, dictionary).ok).toBe(true)
  expect(saved.initialState.affixes).toHaveLength(2)
  expect(saved.initialState.affixes[1].lines).toHaveLength(2)
  expect(saved.initialState.implicitLines).toHaveLength(1)
  expect(saved.initialState.implicitLines[0]).toMatch(/Level 12 Test Minion.*13/)
  expect(saved.operations).toHaveLength(1)
  click('撤销')
  expect(implicit().getByText(/Grants Skill: Level 12 Test Minion.*13/)).toBeDefined()
  click('恢复本机演练')
  expect(implicit().getByText(/Grants Skill: Level 12 Test Minion.*13/)).toBeDefined()
  expect(screen.getByText('崇高石 × 1')).toBeDefined()
  click('神圣石')
  expect(screen.getByText('装备授予技能的等级范围是否参与神圣石重掷尚待真机验收。')).toBeDefined()
  expect(screen.queryByRole('button', { name: '应用本次结果' })).toBeNull()
  expect(implicit().getByText(/Grants Skill: Level 12 Test Minion.*13/)).toBeDefined()
})

it('搜索起点技能默认未知，声明等级仅在重新开始后生效且可保存恢复', () => {
  setup()
  const level = screen.getByLabelText('起点技能等级 1') as HTMLSelectElement
  expect(level.value).toBe('')
  click('从空白基底开始')
  expect(implicit().getByText('Grants Skill: Level (1-20) Test Minion')).toBeDefined()
  fireEvent.change(level, { target: { value: '12' } })
  expect(implicit().getByText('Grants Skill: Level (1-20) Test Minion')).toBeDefined()
  click('从空白基底开始')
  expect(implicit().getByText('Grants Skill: Level 12 Test Minion')).toBeDefined()
  expect(screen.getByText('尚未消耗通货')).toBeDefined()
  const saved = save()
  expect(saved.initialState.implicitLines).toEqual(['Grants Skill: Level 12 Test Minion'])
  fireEvent.change(level, { target: { value: '18' } })
  click('从空白基底开始')
  click('恢复本机演练')
  expect(implicit().getByText('Grants Skill: Level 12 Test Minion')).toBeDefined()
})

it('未知技能不能借助当前装备入口进入制作', () => {
  setup(raw.replace('测试召唤物（最高等级 13）', '未收录技能（最高等级 13）'))
  expect(screen.queryByRole('button', { name: '从当前装备开始' })).toBeNull()
})

it('无等级技能中文导入可制作、撤销、恢复，搜索起点没有等级输入', () => {
  const staticBase = { ...base, implicit: 'Grants Skill: Test Minion' }
  setup(raw.replace('等级 12 测试召唤物（最高等级 13）', '测试召唤物'), staticBase)
  expect(screen.queryByLabelText('起点技能等级 1')).toBeNull()
  click('从当前装备开始')
  expect(implicit().getByText('Grants Skill: Test Minion')).toBeDefined()
  expect(implicit().getByText('获得技能: 测试召唤物')).toBeDefined()
  expect(screen.getByText(/无等级时保留名称/)).toBeDefined()
  click('崇高石')
  fireEvent.click(screen.getByRole('button', { name: /Added · Test added/ }))
  click('应用本次结果')
  expect(save().initialState.implicitLines).toEqual(['Grants Skill: Test Minion'])
  click('撤销')
  expect(implicit().getByText('Grants Skill: Test Minion')).toBeDefined()
  click('重做')
  click('恢复本机演练')
  expect(implicit().getByText('Grants Skill: Test Minion')).toBeDefined()
  click('神圣石')
  expect(screen.queryByText('装备授予技能的等级范围是否参与神圣石重掷尚待真机验收。')).toBeNull()
})

it('未知中文静态技能拒绝，未收录英文搜索起点显示原文', () => {
  const staticBase = { ...base, implicit: 'Grants Skill: Spear Throw' }
  setup(raw.replace('等级 12 测试召唤物（最高等级 13）', '未收录技能'), staticBase)
  expect(screen.queryByRole('button', { name: '从当前装备开始' })).toBeNull()
  expect(screen.queryByLabelText('起点技能等级 1')).toBeNull()
  click('从空白基底开始')
  expect(implicit().getByText('Grants Skill: Spear Throw')).toBeDefined()
})
