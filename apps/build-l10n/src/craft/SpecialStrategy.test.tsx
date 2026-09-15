import { collectCraftCosts } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import {
  essenceId,
  perfectEssenceId,
  specialCatalog,
} from '../../../../packages/item-core/src/specialStrategyFixture'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const pick = (id: string) =>
  fireEvent.click(
    within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: new RegExp(id) }),
  )
function start() {
  render(
    <RehearsalPanel
      catalog={specialCatalog()}
      initialState={{
        baseId: 'Synthetic Base',
        itemLevel: 64,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
      }}
      translations={{}}
    />,
  )
}
function enable() {
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
}
function add(id: string) {
  change('搜索目标词缀', id)
  click(`加入目标 ${id}`)
}
function ordinary(currency: string, id: string) {
  click(currency)
  pick(id)
  click('应用本次结果')
}
it('规则精华沿魔法升级、结果应用、目标停止和项目恢复贯通，固定材料独立于手工选择', () => {
  start()
  add('prefix4')
  enable()
  change('规则 3 动作', 'essence')
  change('规则 3 精华', essenceId)
  click('开始指引步骤')
  pick('suffix1')
  click('应用本次结果')
  expect(screen.getByText('命中规则 3：Lesser Essence of Life')).toBeDefined()
  click('开始指引步骤')
  expect(
    (within(screen.getByLabelText('指引结果选择')).getByLabelText('精华预兆') as HTMLSelectElement)
      .disabled,
  ).toBe(true)
  click('选择精华 Lesser Essence of Life')
  click('预览精华结果')
  click('应用精华结果')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.operations.at(-1)).toMatchObject({ kind: 'essence', essenceId })
  expect(p.essenceSourceHash).toBe('b'.repeat(64))
  click('撤销')
  expect(screen.getByText('命中规则 3：Lesser Essence of Life')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
})
it('骨骼施加到三项及最终揭示均由条件衔接，阶段和费用可保存恢复', () => {
  setupBoneRules()
  click('开始指引步骤')
  expect((screen.getByLabelText('骨骼材料') as HTMLSelectElement).disabled).toBe(true)
  fireEvent.click(screen.getByLabelText('占用后缀'))
  click('预览骨骼结果')
  click('应用骨骼步骤')
  expect(screen.getByText('命中规则 2：继续亵渎揭示')).toBeDefined()
  click('开始指引步骤')
  for (const id of ['exclusive1', 'exclusive2', 'exclusive3'])
    fireEvent.click(screen.getByLabelText(`候选 ${id}`))
  click('预览三项候选')
  click('应用骨骼步骤')
  click('保存演练到本机')
  expect(screen.getByText('命中规则 3：继续亵渎揭示')).toBeDefined()
  click('开始指引步骤')
  click('选择揭示 exclusive1')
  click('预览揭示结果')
  click('应用骨骼步骤')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('命中规则 3：继续亵渎揭示')).toBeDefined()
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.operations).toHaveLength(4)
  expect(p.operations[2]).toMatchObject({ kind: 'desecrate', directionOmen: 'dextral_necromancy' })
})
it('破裂规则选择现有实际组，应用后满足必选破裂目标', () => {
  start()
  ordinary('蜕变石', 'prefix1')
  ordinary('富豪石', 'suffix1')
  ordinary('崇高石', 'prefix2')
  ordinary('崇高石', 'suffix2')
  add('prefix1')
  fireEvent.click(screen.getByLabelText('要求破裂 prefix1'))
  enable()
  change('规则 4 动作', 'fracture')
  click('开始指引步骤')
  click('预览破裂 prefix1')
  click('应用破裂步骤')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations.at(-1)).toEqual(
    { kind: 'fracture', modId: 'prefix1', affixId: 'a1' },
  )
})
it('完美精华固定方向配置，取消或编辑规则清除待选结果且不消费', () => {
  start()
  ordinary('蜕变石', 'prefix1')
  ordinary('富豪石', 'suffix1')
  enable()
  change('规则 4 动作', 'essence')
  change('规则 4 精华', perfectEssenceId)
  change('规则 4 精华预兆', 'dextral_crystallisation')
  click('开始指引步骤')
  click('选择精华 Perfect Essence of Life')
  expect(
    (within(screen.getByLabelText('指引结果选择')).getByLabelText('精华预兆') as HTMLSelectElement)
      .value,
  ).toBe('dextral_crystallisation')
  click('取消指引结果选择')
  expect(screen.queryByLabelText('指引结果选择')).toBeNull()
  click('开始指引步骤')
  change('规则 4 动作', 'exalted')
  expect(screen.queryByLabelText('指引结果选择')).toBeNull()
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations).toHaveLength(2)
})

function setupBoneRules() {
  start()
  ordinary('蜕变石', 'prefix1')
  ordinary('富豪石', 'suffix1')
  add('exclusive1')
  enable()
  change('规则 2 条件 1', 'desecration-stage')
  change('规则 2 亵渎阶段', 'unrevealed')
  change('规则 2 动作', 'reveal')
  change('规则 3 条件 1', 'desecration-stage')
  change('规则 3 亵渎阶段', 'offered')
  change('规则 3 动作', 'reveal')
  change('规则 4 动作', 'desecrate')
  change('规则 4 骨骼', 'preserved_rib')
  change('规则 4 骨骼方向预兆', 'dextral_necromancy')
}

it('指引揭示可声明回响、固定第二组并选回首组，回响只计费一次', () => {
  setupBoneRules()
  click('开始指引步骤')
  fireEvent.click(screen.getByLabelText('占用后缀'))
  click('预览骨骼结果')
  click('应用骨骼步骤')
  click('开始指引步骤')
  fireEvent.click(screen.getByLabelText('首次揭示使用深渊回响'))
  for (const id of ['exclusive1', 'exclusive2', 'exclusive3'])
    fireEvent.click(screen.getByLabelText(`候选 ${id}`))
  click('预览三项候选')
  click('应用骨骼步骤')
  click('开始指引步骤')
  click('指定第二组三项')
  for (const id of ['exclusive1', 'suffix2', 'suffix3'])
    fireEvent.click(screen.getByLabelText(`第二组候选 ${id}`))
  click('预览第二组三项')
  click('应用骨骼步骤')
  expect(screen.getByText('命中规则 3：继续亵渎揭示')).toBeDefined()
  click('保存演练到本机')
  click('开始指引步骤')
  click('首组：选择揭示 exclusive1')
  click('预览揭示结果')
  click('应用骨骼步骤')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('命中规则 3：继续亵渎揭示')).toBeDefined()
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.operations.at(-1).kind).toBe('desecration-reroll')
  const costs = collectCraftCosts(specialCatalog(), p.operations)
  if (!costs.ok) throw Error(costs.error)
  expect(costs.value.find((entry) => entry.name === 'Omen of Abyssal Echoes')?.count).toBe(1)
  expect(costs.value.reduce((sum, entry) => sum + entry.count, 0)).toBe(5)
})
