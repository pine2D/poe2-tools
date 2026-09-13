import {
  CRAFT_RULES_VERSION,
  LIQUID_EMOTION_SOURCE,
  parseCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { jewelFixture } from '../../../../packages/item-core/src/jewelTestFixture'
import { LiquidEmotionCraftPanel } from './LiquidEmotionCraftPanel'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', () => ({ requestTargetRoutes: () => () => {} }))
afterEach(() => {
  cleanup()
  localStorage.clear()
})
const emotionId = 'Metadata/Items/Currency/DistilledEmotion1'
function fixture() {
  const { catalog, state } = jewelFixture()
  catalog._meta.sources.push(LIQUID_EMOTION_SOURCE)
  catalog.liquidEmotions = [
    {
      id: emotionId,
      name: 'Diluted Liquid Ire',
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
