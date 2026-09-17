import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'

const source = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')) as CraftCatalog
function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('魔符测试目录缺失')
  return value
}
const base = required(source.bases.find((entry) => entry.id === 'Changeling Talisman'))
const mod = required(
  source.modifiers.find(
    (entry) => entry.group === 'LocalPhysicalDamagePercent' && entry.level === 1,
  ),
)
const catalog: CraftCatalog = { ...source, bases: [base], modifiers: [mod] }
const dictionary = { items: { bases: { 'Changeling Talisman': '易形魔符' }, uniques: {} } }
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const save = () => {
  click('保存演练到本机')
  return JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
}
function setup(raw?: string) {
  const parsed = raw ? parseItem(raw) : null
  if (parsed && !parsed.ok) throw Error(parsed.error)
  const item = parsed?.ok ? parsed.item : undefined
  const inspected = item ? inspectItem(item, dictionary) : undefined
  render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={86}
      imported={item && inspected ? { ...inspected, baseId: base.id, item } : undefined}
      dictionary={dictionary}
      translations={{}}
      translateLine={(line) => line}
      onRestore={vi.fn()}
    />,
  )
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
it('普通魔符串联品质、词缀目标、制作、撤销和v107未来恢复，面板明确形态边界', () => {
  setup()
  fireEvent.change(screen.getByLabelText('起点已有品质'), { target: { value: '20' } })
  click('从空白基底开始')
  const panel = () => within(screen.getByLabelText('武器面板估算'))
  expect(panel().getByText(/魔符形态与技能/)).toBeTruthy()
  expect(panel().getByText('总武器 DPS：18.125')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: mod.id } })
  click(`加入目标 ${mod.id}`)
  click('蜕变石')
  click(new RegExp(`^${mod.id} ·`))
  click('应用本次结果')
  expect(save().initialState.quality).toBe(20)
  click('撤销')
  const saved = save()
  expect(saved.rulesVersion).toBe('basic-2026-09-17-v107')
  expect(saved.cursor).toBe(0)
  expect(saved.operations).toHaveLength(1)
  expect(saved.targetDefinitions.targets[0].modId).toBe(mod.id)
  expect(parseTargetCraftProject(JSON.stringify(saved), catalog).ok).toBe(true)
  click('恢复本机演练')
  click('重做')
  expect(save().cursor).toBe(1)
  expect(screen.queryByLabelText('起点授予技能等级')).toBeNull()
})
it('简中高级魔符导入保留原始观察，明确零孔后从目录重算本件伤害', () => {
  const raw =
    '物品类别: 魔符\n稀有度: 普通\n易形魔符\n--------\n品质: +20% (augmented)\n物理伤害: 999-999 (augmented)\n暴击率: 99%\n每秒攻击次数: 9\n--------\n物品等级: 86'
  setup(raw)
  fireEvent.change(screen.getByLabelText('导入装备孔数'), { target: { value: '0' } })
  click('按已核对孔位开始')
  expect(within(screen.getByLabelText('武器面板估算')).getByText('总武器 DPS：18.125')).toBeTruthy()
  expect(save().initialState.sourceText).toBe(raw)
})
