import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  type CraftState,
  createCraftItemDictionary,
  exportCraftItemText,
  importCraftState,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const dictionary = createCraftItemDictionary(catalog, {})
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const effects = () => within(screen.getByLabelText('当前镶嵌效果'))
function save() {
  click('保存演练到本机')
  const text = localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? ''
  const result = parseTargetCraftProject(text, catalog, dictionary)
  if (!result.ok) throw Error(result.error)
  return result
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('已有荆棘导入后增效、取消、覆盖、报价和撤销恢复，保存v80完整未来历史', () => {
  const sockets = [id('Tempered Rune'), id('Greater Rune of Tithing')]
  const state: CraftState = {
    baseId: 'Adherent Cuffs',
    itemLevel: 86,
    rarity: 'rare',
    quality: 20,
    sourceText: null,
    sockets,
    affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }],
  }
  const output = exportCraftItemText(catalog, state)
  if (!output.ok) throw Error(output.error)
  const parsed = parseItem(output.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const input = importCraftState(
    catalog,
    state.baseId,
    parsed.item,
    inspectItem(parsed.item, dictionary),
    state.sockets,
  )
  if (!input.ok) throw Error(input.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={input.value}
      importedSockets={sockets}
      translations={{ 'Essence of Horror': '恐惧精华' }}
    />,
  )
  expect(effects().getByText('14 to 21 Physical Thorns damage')).toBeDefined()
  click('选择精华 恐惧精华')
  fireEvent.click(screen.getByRole('radio', { name: /IncreasedLife1/ }))
  click('预览精华结果')
  click('应用精华结果')
  expect(effects().getByText('22 to 33 Physical Thorns damage')).toBeDefined()
  expect(effects().getByText('1 to 160 Lightning Thorns damage')).toBeDefined()
  change('选择镶嵌符文', id('Greater Rune of Leadership'))
  expect(
    within(screen.getByLabelText('镶嵌草稿')).getByText(
      'Minions take 16% of Physical Damage as Lightning Damage',
    ),
  ).toBeDefined()
  click('取消镶嵌')
  expect(save().value.project.operations).toHaveLength(1)
  change('选择镶嵌符文', id('Greater Rune of Leadership'))
  click('应用镶嵌')
  expect(
    effects().getByText('Minions take 16% of Physical Damage as Lightning Damage'),
  ).toBeDefined()
  click('撤销')
  const saved = save().value.project
  expect(saved.rulesVersion).toBe('basic-2026-09-16-v80')
  expect(saved.cursor).toBe(1)
  expect(saved.operations).toHaveLength(2)
  expect(saved.initialState.runeSourceLines).toEqual([
    '14 to 21 Physical Thorns damage',
    '1 to 100 Lightning Thorns damage',
  ])
  click('撤销')
  click('恢复本机演练')
  click('重做')
  expect(
    effects().getByText('Minions take 16% of Physical Damage as Lightning Damage'),
  ).toBeDefined()
  expect(
    within(screen.getByRole('region', { name: '已消耗材料' })).getByText(
      `${catalog.localizedNames?.['zh-CN']?.['Greater Rune of Leadership']} × 1`,
    ),
  ).toBeDefined()
})

it('空基底配置新符文指引即保存v80，按空孔执行并停止', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={{
        baseId: 'Rusted Greathelm',
        itemLevel: 86,
        rarity: 'normal',
        sourceText: null,
        affixes: [],
        sockets: [],
        quality: 0,
      }}
    />,
  )
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 1 条件 1', 'open-sockets')
  change('规则 1 动作', 'socket')
  change('规则 1 符文', id('Greater Rune of Alacrity'))
  change('规则 2 条件 1', 'socket-count')
  change('规则 2 条件 1 孔数下限', '1')
  change('规则 2 动作', 'stop')
  change('规则 3 条件 1', 'always')
  change('规则 3 动作', 'artificer')
  const pending = save().value.project
  expect(pending.rulesVersion).toBe('basic-2026-09-16-v80')
  expect(pending.operations).toEqual([])
  for (const apply of ['应用打孔', '应用镶嵌']) {
    click('开始指引步骤')
    click(apply)
  }
  expect(effects().getByText('Debuffs on you expire 8% faster')).toBeDefined()
  expect(screen.getByText('命中规则 2：停止。')).toBeDefined()
  const completed = save().value.project
  expect(completed.operations).toEqual([
    { kind: 'artificer' },
    { kind: 'socket', socketIndex: 0, augmentId: id('Greater Rune of Alacrity') },
  ])
  click('撤销')
  click('恢复本机演练')
  expect(screen.getByText('命中规则 2：停止。')).toBeDefined()
})
