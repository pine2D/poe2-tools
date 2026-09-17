import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  createCatalogTranslator,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'

const source = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')) as CraftCatalog
const catalog: CraftCatalog = {
  ...source,
  bases: source.bases.filter((base) =>
    ['Absent Amulet', 'Lament Amulet', 'Portent Amulet'].includes(base.id),
  ),
  modifiers: ['Life', 'Mana', 'Strength', 'Dexterity'].map((name, index) => ({
    id: name,
    name,
    group: name,
    kind: index < 2 ? 'prefix' : 'suffix',
    level: 1,
    lines: [`+(10-20) to ${index < 2 ? 'maximum ' : ''}${name}`],
    statOrder: [1],
    tags: [],
    addsTags: [],
    eligibility: [{ tag: 'default', value: 1 }],
    tradeHashes: {},
  })),
}
const dictionary = {
  items: {
    bases: { 'Absent Amulet': '测试失神项链', 'Lament Amulet': '测试悲叹项链' },
    uniques: {},
  },
  stats: {
    entries: [
      { id: 'implicit.prefix', en: '# Prefix Modifier allowed', text: '允许的前缀 #' },
      { id: 'implicit.suffix', en: '# Suffix Modifier allowed', text: '允许的后缀 #' },
      {
        id: 'skill.crit',
        en: 'Grants Skill: Level # Cast on Critical',
        text: '获得技能: 等级 # 暴击时施放',
      },
      {
        id: 'skill.ailment',
        en: 'Grants Skill: Level # Cast on Elemental Ailment',
        text: '获得技能: 等级 # 元素异常状态时施放',
      },
    ],
  },
}
const raw =
  '物品类别: 项链\n稀有度: 魔法\n测试失神项链\n--------\n物品等级: 80\n--------\n{ 基底属性 }\n允许的前缀 -1\n{ 基底属性 }\n允许的后缀 -1\n--------\n获得技能: 等级 8 暴击时施放（最高等级 12）'

function setup(sourceText?: string) {
  const base = catalog.bases.find((entry) => entry.id === 'Absent Amulet')
  if (!base) throw new Error('测试基底缺失')
  const parsed = sourceText ? parseItem(sourceText) : null
  if (parsed && !parsed.ok) throw new Error(parsed.error)
  const item = parsed?.ok ? parsed.item : null
  const inspected = item ? inspectItem(item, dictionary) : null
  render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={80}
      imported={
        item && inspected
          ? {
              baseId: base.id,
              item,
              mods: inspected.mods,
              skills: inspected.skills,
              comparisonOnly: false,
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
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('搜索起点显式选技能，零词缀蜕变和富豪完整未来随v102保存恢复', () => {
  setup()
  expect(screen.queryByRole('button', { name: '从空白基底开始' })).toBeNull()
  const selector = screen.getByLabelText('空白起点授予技能')
  expect((selector as HTMLSelectElement).value).toBe('')
  fireEvent.change(selector, { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('起点技能等级 1'), { target: { value: '8' } })
  click('从空白基底开始')
  const start = save()
  expect(start.rulesVersion).toBe('basic-2026-09-17-v102')
  expect(start.initialState.implicitLines).toEqual([
    '-1 Prefix Modifier allowed',
    '-1 Suffix Modifier allowed',
    'Grants Skill: Level 8 Cast on Elemental Ailment',
  ])
  fireEvent.change(selector, { target: { value: '2' } })
  expect(save().initialState).toEqual(start.initialState)
  click('蜕变石')
  click('应用本次结果')
  expect(save().operations).toEqual([{ currency: 'transmutation', modIds: [] }])
  click('富豪石')
  fireEvent.click(screen.getByRole('button', { name: /Life · Life/ }))
  click('应用本次结果')
  click('撤销')
  const saved = save()
  expect(saved.cursor).toBe(1)
  expect(saved.operations).toHaveLength(2)
  expect(parseTargetCraftProject(JSON.stringify(saved), catalog, dictionary).ok).toBe(true)
  click('恢复本机演练')
  click('重做')
  expect(save().cursor).toBe(2)
  expect(
    within(screen.getByLabelText('当前固有属性')).getByText(
      'Grants Skill: Level 8 Cast on Elemental Ailment',
    ),
  ).toBeTruthy()
})

it('中文导入由原文确定唯一技能，空白技能草稿不能覆盖它', () => {
  setup(raw)
  fireEvent.change(screen.getByLabelText('空白起点授予技能'), { target: { value: '1' } })
  click('从当前装备开始')
  const saved = save()
  expect(saved.rulesVersion).toBe('basic-2026-09-17-v102')
  expect(saved.initialState.sourceText).toBe(raw)
  expect(saved.initialState.implicitLines.at(-1)).toBe(
    'Grants Skill: Level 8 Cast on Critical (Max Level 12)',
  )
  expect(saved.operations).toEqual([])
  expect(parseTargetCraftProject(JSON.stringify(saved), catalog, dictionary).ok).toBe(true)
  expect(screen.queryByLabelText('起点装备最高技能等级')).toBeNull()
  expect(screen.getByLabelText('起点技能辅助孔数')).toBeTruthy()
})

it('选定技能后可搜索显式目标并保留目标配置，候选不会丢失起点技能', () => {
  setup()
  fireEvent.change(screen.getByLabelText('空白起点授予技能'), { target: { value: '2' } })
  click('从空白基底开始')
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'Life' } })
  click('加入目标 Life')
  const saved = save()
  expect(saved.targetDefinitions.targets).toEqual([{ targetId: 't1', modId: 'Life' }])
  expect(saved.initialState.implicitLines.at(-1)).toBe(
    'Grants Skill: Level (1-20) Cast on Critical',
  )
  expect(parseTargetCraftProject(JSON.stringify(saved), catalog, dictionary).ok).toBe(true)
  expect(screen.getByRole('button', { name: '生成多步示例路线' })).toBeTruthy()
})

it('项链辅助孔独立声明并沿目标建议制作，v103保存撤销后的未来', () => {
  setup()
  fireEvent.change(screen.getByLabelText('空白起点授予技能'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('起点技能辅助孔数'), { target: { value: '3' } })
  expect(screen.queryByLabelText('起点装备最高技能等级')).toBeNull()
  click('从空白基底开始')
  expect(save().rulesVersion).toBe('basic-2026-09-17-v103')
  expect(save().initialState.declaredSkillSockets).toBe(3)
  expect(save().operations).toEqual([])
  fireEvent.change(screen.getByLabelText('技能辅助孔 3 · 数值 1 下限'), {
    target: { value: '5' },
  })
  click('保存技能辅助孔 3 条件')
  click('预览建议：完美工匠石')
  click('取消辅助孔结果')
  expect(save().operations).toEqual([])
  click('预览建议：完美工匠石')
  click('应用辅助孔结果')
  expect(screen.getByText('已达成 1 / 1')).toBeTruthy()
  click('撤销')
  const saved = save()
  expect(saved.cursor).toBe(0)
  expect(saved.operations).toEqual([{ kind: 'skill-sockets', tier: 'perfect', previousSockets: 3 }])
  expect(saved.initialState.implicitLines.at(-1)).toBe(
    'Grants Skill: Level (1-20) Cast on Critical',
  )
  expect(parseTargetCraftProject(JSON.stringify(saved), catalog, dictionary).ok).toBe(true)
  click('恢复本机演练')
  click('重做')
  expect(screen.getByText('已达成 1 / 1')).toBeTruthy()
})

it('中文项链无需先选择空白技能即可声明已有辅助孔，原文仍独立保存', () => {
  setup(raw)
  expect((screen.getByLabelText('空白起点授予技能') as HTMLSelectElement).value).toBe('')
  fireEvent.change(screen.getByLabelText('起点技能辅助孔数'), { target: { value: '4' } })
  click('从当前装备开始')
  const saved = save()
  expect(saved.rulesVersion).toBe('basic-2026-09-17-v103')
  expect(saved.initialState.sourceText).toBe(raw)
  expect(saved.initialState.declaredSkillSockets).toBe(4)
  expect(saved.initialState.declaredSkillLevel).toBeUndefined()
  expect(saved.initialState.implicitLines.at(-1)).toBe(
    'Grants Skill: Level 8 Cast on Critical (Max Level 12)',
  )
  expect(parseTargetCraftProject(JSON.stringify(saved), catalog, dictionary).ok).toBe(true)
})
