import {
  CRAFT_RULES_VERSION,
  LIQUID_EMOTION_SOURCE,
  parseCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { jewelFixture } from '../../../../packages/item-core/src/jewelTestFixture'
import { CraftStrategyActionEditor } from './CraftStrategyActionEditor'
import { LiquidEmotionCraftPanel } from './LiquidEmotionCraftPanel'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', () => ({ requestTargetRoutes: () => () => {} }))
afterEach(() => {
  cleanup()
  localStorage.clear()
})
const emotionId = 'Metadata/Items/Currency/DistilledEmotion1'
function fixture(fixed = false) {
  const { catalog, state } = jewelFixture()
  catalog._meta.sources.push(LIQUID_EMOTION_SOURCE)
  if (fixed) {
    const mod = catalog.modifiers.find((entry) => entry.id === 'prefix2')
    if (!mod) throw Error('缺少固定效果测试属性')
    mod.lines = [
      'Inflict Elemental Exposure on Hit while you have a Ruby and an Emerald socketed in your tree',
    ]
    mod.craftedOnly = true
    mod.eligibility = [{ tag: 'jewel', value: 0 }]
  }
  catalog.liquidEmotions = [
    {
      id: fixed ? 'Metadata/Items/Currency/EndgameDistilledEmotion1' : emotionId,
      name: fixed ? 'Potent Liquid Melancholy' : 'Diluted Liquid Ire',
      radiusJewel: false,
      tierLevel: 77,
      mods: { Ruby: {}, Sapphire: { prefix: 'prefix2' }, Emerald: {}, Diamond: {} },
    },
  ]
  const project = {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: CRAFT_RULES_VERSION,
    jewelSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModJewel.lua')?.sha256,
    initialState: { ...state, rarity: 'normal' },
    operations: [
      {
        currency: 'alchemy',
        modIds: ['prefix1', 'prefix3', 'suffix1', 'suffix2'],
        rolls: ['prefix1', 'prefix3', 'suffix1', 'suffix2'].map((modId) => ({
          modId,
          values: [5],
        })),
      },
    ],
    cursor: 1,
  }
  const restored = parseCraftProject(JSON.stringify(project), catalog)
  if (!restored.ok) throw Error(restored.error)
  const craftedState = restored.value.states[1]
  if (!craftedState) throw Error('缺少点金后的测试状态')
  return { catalog, state: craftedState, restored: restored.value }
}
const click = (name: string) => {
  const button = screen.getByRole('button', { name })
  button.focus()
  fireEvent.click(button)
}
const translations = { 'Diluted Liquid Ire': '稀释的液化愤怒' }

const contemptId = 'Metadata/Items/Currency/EndgameDistilledEmotion3'
function capacityFixture() {
  const result = fixture()
  const template = result.catalog.modifiers.find((mod) => mod.id === 'prefix2')
  if (!template) throw Error('缺少测试属性')
  result.catalog.modifiers.push(
    {
      ...template,
      id: 'CraftedJewelAdditionalSuffixAllowed',
      name: '',
      kind: 'prefix',
      group: 'PrefixSuffixAllowed',
      craftedOnly: true,
      lines: ['+1 Suffix Modifier allowed'],
      eligibility: [{ tag: 'jewel', value: 0 }],
    },
    {
      ...template,
      id: 'CraftedJewelAdditionalPrefixAllowed',
      name: '',
      kind: 'suffix',
      group: 'PrefixSuffixAllowed',
      craftedOnly: true,
      lines: ['+1 Prefix Modifier allowed'],
      eligibility: [{ tag: 'jewel', value: 0 }],
    },
  )
  result.catalog.liquidEmotions?.push({
    id: contemptId,
    name: 'Potent Liquid Contempt',
    radiusJewel: false,
    tierLevel: 77,
    mods: {
      Ruby: {},
      Sapphire: {
        prefix: 'CraftedJewelAdditionalSuffixAllowed',
        suffix: 'CraftedJewelAdditionalPrefixAllowed',
      },
      Emerald: {},
      Diamond: {},
    },
  })
  return result
}

it('双侧液态材料先明确可能结果，切换侧别会清除移除选择', () => {
  const { catalog, state } = capacityFixture()
  const preview = vi.fn()
  render(
    <LiquidEmotionCraftPanel
      catalog={catalog}
      state={state}
      translations={{ 'Potent Liquid Contempt': '强效的液化轻蔑' }}
      disabled={false}
      onPreview={preview}
    />,
  )
  click('选择液态情感 强效的液化轻蔑')
  expect((screen.getByLabelText('液态情感保证结果') as HTMLSelectElement).value).toBe('')
  expect(screen.queryByLabelText('液态情感移除结果')).toBeNull()
  fireEvent.change(screen.getByLabelText('液态情感保证结果'), { target: { value: 'prefix' } })
  fireEvent.change(screen.getByLabelText('液态情感移除结果'), { target: { value: 'prefix1' } })
  click('预览液态情感结果')
  expect(preview).toHaveBeenLastCalledWith({
    kind: 'liquid-emotion',
    emotionId: contemptId,
    resultKind: 'prefix',
    removeModId: 'prefix1',
    values: [],
  })
  fireEvent.change(screen.getByLabelText('液态情感保证结果'), { target: { value: 'suffix' } })
  expect((screen.getByLabelText('液态情感移除结果') as HTMLSelectElement).value).toBe('')
  expect(
    (screen.getByRole('button', { name: '预览液态情感结果' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.change(screen.getByLabelText('液态情感移除结果'), { target: { value: 'suffix1' } })
  click('预览液态情感结果')
  expect(preview).toHaveBeenLastCalledWith({
    kind: 'liquid-emotion',
    emotionId: contemptId,
    resultKind: 'suffix',
    removeModId: 'suffix1',
    values: [],
  })
})

it('增容沿条件指引预览应用并更新空位，项目保存与撤销恢复保留结果侧别', () => {
  const { catalog, state, restored } = capacityFixture()
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={state}
      initialProject={restored}
      translations={{ 'Potent Liquid Contempt': '强效的液化轻蔑' }}
    />,
  )
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), {
    target: { value: 'CraftedJewelAdditionalSuffixAllowed' },
  })
  click('加入目标 CraftedJewelAdditionalSuffixAllowed')
  click('启用条件指引示例')
  fireEvent.change(screen.getByLabelText('规则 4 动作'), { target: { value: 'liquid-emotion' } })
  fireEvent.change(screen.getByLabelText('规则 4 液态情感'), { target: { value: contemptId } })
  click('开始指引步骤')
  click('选择液态情感 强效的液化轻蔑')
  fireEvent.change(screen.getByLabelText('液态情感保证结果'), { target: { value: 'prefix' } })
  fireEvent.change(screen.getByLabelText('液态情感移除结果'), { target: { value: 'prefix1' } })
  click('预览液态情感结果')
  click('应用液态情感结果')
  expect(screen.getByRole('heading', { name: '后缀 2/3' })).toBeDefined()
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  expect(screen.getByText('强效的液化轻蔑 × 1')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(saved.operations.at(-1).resultKind).toBe('prefix')
  expect(saved.liquidEmotionSourceHash).toBe(LIQUID_EMOTION_SOURCE.sha256)
  expect(parseCraftProject(JSON.stringify(saved), catalog).ok).toBe(true)
  click('撤销')
  expect(screen.getByRole('heading', { name: '后缀 2/2' })).toBeDefined()
  click('重做')
  expect(screen.getByRole('heading', { name: '后缀 2/3' })).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('演练项目已恢复。')).toBeDefined()
})

it('移除增容后显示已有三后缀保留，满五组拒绝新增且项目可恢复', () => {
  const { catalog, restored } = capacityFixture()
  const checked = parseCraftProject(
    JSON.stringify({
      ...restored.project,
      liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
      operations: [
        ...restored.project.operations,
        {
          kind: 'liquid-emotion',
          emotionId: contemptId,
          resultKind: 'prefix',
          removeModId: 'prefix1',
          values: [],
        },
        { currency: 'exalted', modIds: ['suffix3'], rolls: [{ modId: 'suffix3', values: [5] }] },
        { currency: 'annulment', modIds: [], removeModId: 'CraftedJewelAdditionalSuffixAllowed' },
        { currency: 'exalted', modIds: ['prefix2'], rolls: [{ modId: 'prefix2', values: [5] }] },
      ],
      cursor: 5,
    }),
    catalog,
  )
  if (!checked.ok) throw Error(checked.error)
  const state = checked.value.states[5]
  if (!state) throw Error('缺少五词缀状态')
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={state}
      initialProject={checked.value}
      translations={{}}
    />,
  )
  expect(screen.getByRole('heading', { name: '后缀 3/2' })).toBeDefined()
  expect(screen.getByText('已有后缀保留；当前已超过新增上限，不能再新增后缀。')).toBeDefined()
  expect(screen.queryByText('空后缀')).toBeNull()
  click('崇高石')
  expect(screen.getByText('稀有装备词缀已满。')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(saved.liquidEmotionSourceHash).toBe(LIQUID_EMOTION_SOURCE.sha256)
  expect(parseCraftProject(JSON.stringify(saved), catalog).ok).toBe(true)
  click('恢复本机演练')
  expect(screen.getByRole('heading', { name: '后缀 3/2' })).toBeDefined()
})

it('已接受的五组历史状态即使侧别容量有余量，也不显示可新增空槽', () => {
  const { catalog, state } = capacityFixture()
  const initialState = {
    ...state,
    affixes: [
      ...state.affixes,
      {
        modId: 'CraftedJewelAdditionalSuffixAllowed',
        lines: ['+1 Suffix Modifier allowed'],
        crafted: true as const,
      },
    ],
  }
  render(<RehearsalPanel catalog={catalog} initialState={initialState} translations={{}} />)
  expect(screen.getByRole('heading', { name: '前缀 3/2' })).toBeDefined()
  expect(screen.getByRole('heading', { name: '后缀 2/3' })).toBeDefined()
  expect(screen.queryByText('空后缀')).toBeNull()
  expect(screen.getByText('已有词缀已达五组上限，当前不能新增词缀。')).toBeDefined()
  click('崇高石')
  expect(screen.getByText('稀有装备词缀已满。')).toBeDefined()
})
it('液态制作选择合法移除对象和数值后才能预览，显示移除目标风险', () => {
  const { catalog, state } = fixture()
  const preview = vi.fn()
  render(
    <LiquidEmotionCraftPanel
      catalog={catalog}
      state={state}
      translations={translations}
      disabled={false}
      onPreview={preview}
      targetModIds={['prefix1']}
    />,
  )
  click('选择液态情感 稀释的液化愤怒')
  expect(
    (screen.getByRole('button', { name: '预览液态情感结果' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.change(screen.getByLabelText('液态情感移除结果'), { target: { value: 'prefix1' } })
  expect(screen.getByText(/本次将移除.*prefix1/)).toBeDefined()
  click('预览液态情感结果')
  expect(preview).toHaveBeenCalledWith({
    kind: 'liquid-emotion',
    emotionId,
    removeModId: 'prefix1',
    values: [1],
  })
})
it('液态结果取消不计费，应用后工艺标记与撤销重做、保存恢复一致', () => {
  const { catalog, state, restored } = fixture()
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={state}
      initialProject={restored}
      translations={translations}
    />,
  )
  click('选择液态情感 稀释的液化愤怒')
  fireEvent.change(screen.getByLabelText('液态情感移除结果'), { target: { value: 'prefix1' } })
  click('预览液态情感结果')
  expect(screen.getByRole('region', { name: '液态情感待应用结果' })).toBe(document.activeElement)
  click('取消液态情感结果')
  expect(document.activeElement?.textContent).toBe('液态情感制作')
  expect(screen.queryByText('稀释的液化愤怒 × 1')).toBeNull()
  click('选择液态情感 稀释的液化愤怒')
  fireEvent.change(screen.getByLabelText('液态情感移除结果'), { target: { value: 'prefix1' } })
  click('预览液态情感结果')
  click('应用液态情感结果')
  expect(screen.getByText('稀释的液化愤怒 × 1')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(saved.liquidEmotionSourceHash).toBe(LIQUID_EMOTION_SOURCE.sha256)
  expect(parseCraftProject(JSON.stringify(saved), catalog).ok).toBe(true)
  click('撤销')
  expect(screen.queryByText('稀释的液化愤怒 × 1')).toBeNull()
  click('重做')
  expect(screen.getByText('稀释的液化愤怒 × 1')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('演练项目已恢复。')).toBeDefined()
})
it('条件指引固定材料，应用后达到目标并停止，编辑规则清理过期结果', () => {
  const { catalog, state, restored } = fixture()
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={state}
      initialProject={restored}
      translations={translations}
    />,
  )
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'prefix2' } })
  click('加入目标 prefix2')
  click('启用条件指引示例')
  fireEvent.change(screen.getByLabelText('规则 4 动作'), { target: { value: 'liquid-emotion' } })
  expect((screen.getByLabelText('规则 4 液态情感') as HTMLSelectElement).value).toBe(emotionId)
  click('开始指引步骤')
  click('取消指引结果选择')
  expect(screen.queryByText('稀释的液化愤怒 × 1')).toBeNull()
  click('开始指引步骤')
  click('选择液态情感 稀释的液化愤怒')
  fireEvent.change(screen.getByLabelText('液态情感移除结果'), { target: { value: 'prefix1' } })
  click('预览液态情感结果')
  click('取消液态情感结果')
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '开始指引步骤' }))
  click('开始指引步骤')
  click('选择液态情感 稀释的液化愤怒')
  fireEvent.change(screen.getByLabelText('液态情感移除结果'), { target: { value: 'prefix1' } })
  click('预览液态情感结果')
  click('应用液态情感结果')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(parseCraftProject(JSON.stringify(saved), catalog).ok).toBe(true)
  click('撤销')
  expect(screen.getByText('命中规则 4：稀释的液化愤怒')).toBeDefined()
  click('开始指引步骤')
  fireEvent.change(screen.getByLabelText('规则 4 动作'), { target: { value: 'exalted' } })
  expect(screen.queryByLabelText('指引结果选择')).toBeNull()
})

it('固定条件效果无需数值，目标独立保存来源并沿指引达标停止', () => {
  const { catalog, state, restored } = fixture(true)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={state}
      initialProject={restored}
      translations={{ 'Potent Liquid Melancholy': '强效的液化悲哀' }}
    />,
  )
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'prefix2' } })
  click('加入目标 prefix2')
  click('保存演练到本机')
  const targetOnly = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(targetOnly.liquidEmotionSourceHash).toBe(LIQUID_EMOTION_SOURCE.sha256)
  expect(parseCraftProject(JSON.stringify(targetOnly), catalog).ok).toBe(true)
  click('启用条件指引示例')
  fireEvent.change(screen.getByLabelText('规则 4 动作'), { target: { value: 'liquid-emotion' } })
  click('开始指引步骤')
  click('选择液态情感 强效的液化悲哀')
  expect(screen.queryByLabelText('液态情感保证属性 · 数值 1')).toBeNull()
  fireEvent.change(screen.getByLabelText('液态情感移除结果'), { target: { value: 'prefix1' } })
  click('预览液态情感结果')
  click('应用液态情感结果')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  expect(screen.getByText('强效的液化悲哀 × 1')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(saved.operations.at(-1).values).toEqual([])
  expect(parseCraftProject(JSON.stringify(saved), catalog).ok).toBe(true)
  click('撤销')
  expect(screen.queryByText('强效的液化悲哀 × 1')).toBeNull()
  click('重做')
  expect(screen.getByText('强效的液化悲哀 × 1')).toBeDefined()
})

it.each(['normal', 'rare'] as const)('钻石 %s 起点的液态指引默认选唯一已核实映射', (rarity) => {
  const { catalog, state } = fixture()
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) throw Error('缺少测试基底')
  catalog.bases.push({ ...base, id: 'Diamond', name: 'Diamond' })
  const isolation = 'Metadata/Items/Currency/DistilledEmotion10'
  catalog.liquidEmotions?.push({
    id: isolation,
    name: 'Concentrated Liquid Isolation',
    radiusJewel: false,
    tierLevel: 77,
    mods: { Ruby: {}, Sapphire: {}, Emerald: {}, Diamond: { prefix: 'prefix2' } },
  })
  const change = vi.fn()
  render(
    <CraftStrategyActionEditor
      number={1}
      action={{ kind: 'stop' }}
      catalog={catalog}
      state={{ ...state, baseId: 'Diamond', rarity }}
      translations={{}}
      omenLabel={(id) => id}
      onChange={change}
    />,
  )
  fireEvent.change(screen.getByLabelText('规则 1 动作'), { target: { value: 'liquid-emotion' } })
  expect(change).toHaveBeenCalledWith({ kind: 'liquid-emotion', emotionId: isolation })
})
