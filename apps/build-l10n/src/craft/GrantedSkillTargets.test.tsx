import type { CatalogBase, CraftCatalog, CraftState } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', async () => {
  const { planTargetDefinitionRoutes } = await import('@poe2-tools/item-core')
  return {
    requestTargetRoutes: (
      args: Parameters<typeof planTargetDefinitionRoutes>,
      callback: (value: ReturnType<typeof planTargetDefinitionRoutes>) => void,
    ) => {
      callback(planTargetDefinitionRoutes(...args))
      return vi.fn()
    },
  }
})
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
  modifiers: [],
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
function setup(known = true) {
  const state: CraftState = {
    baseId: base.id,
    itemLevel: 53,
    rarity: 'normal',
    affixes: [],
    implicitLines: [`Grants Skill: Level 12 Test Minion${known ? ' (Max Level 13)' : ''}`],
    sourceText: null,
  }
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={state}
      translations={{ 'Perfect Flux': '完美溶剂' }}
    />,
  )
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
function target(value = '20') {
  fireEvent.change(screen.getByLabelText('固有属性 1 · 数值 1 下限'), { target: { value } })
  click('保存固有属性 1 条件')
}
function saved() {
  click('保存演练到本机')
  return JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('装备技能目标区别角色等级，建议完美溶剂并随 v97 撤销和未来恢复', () => {
  setup()
  const editor = within(screen.getByLabelText('固有属性目标'))
  expect(editor.getByText('装备固有技能最高等级：13')).toBeDefined()
  expect(editor.queryByRole('option', { name: '品质后有效值' })).toBeNull()
  target()
  expect(screen.getByText('已达成 0 / 1')).toBeDefined()
  expect(saved().targetImplicitValues).toEqual([
    { kind: 'granted-skill', lineIndex: 0, bounds: [{ index: 0, min: 20 }] },
  ])
  click('预览建议：完美溶剂')
  expect(screen.getByLabelText('完美溶剂待应用结果').textContent).toContain('13 → 20')
  click('取消完美溶剂结果')
  expect(saved().operations).toEqual([])
  click('预览建议：完美溶剂')
  click('应用完美溶剂结果')
  expect(screen.getByText('已达成 1 / 1')).toBeDefined()
  expect(screen.getByText('完美溶剂 × 1')).toBeDefined()
  expect(saved().rulesVersion).toBe('basic-2026-09-17-v97')
  click('撤销')
  const future = saved()
  expect(future.cursor).toBe(0)
  expect(future.operations).toEqual([{ kind: 'perfect-flux', previousMaxLevel: 13 }])
  click('恢复本机演练')
  click('重做')
  expect(screen.getByText('已达成 1 / 1')).toBeDefined()
  expect(screen.queryByRole('button', { name: '预览建议：完美溶剂' })).toBeNull()
})
it('仅技能目标的真实 worker 路线预览应用计费并使用正确材料名称', () => {
  setup()
  target()
  click('生成多步示例路线')
  const routes = within(screen.getByLabelText('多步示例路线'))
  expect(routes.getAllByText(/完美溶剂/).length).toBeGreaterThan(0)
  const first = routes.getAllByRole('button', { name: '预览路线第一步' })[0]
  if (!first) throw Error('缺少路线')
  fireEvent.click(first)
  click('应用完美溶剂结果')
  expect(screen.getByText('已达成 1 / 1')).toBeDefined()
  expect(saved().operations).toEqual([{ kind: 'perfect-flux', previousMaxLevel: 13 }])
})
it('原最高等级未知不拿显示的12级作声明，非整数条件拒绝且保留原目标', () => {
  setup(false)
  expect(
    within(screen.getByLabelText('固有属性目标')).getByText('装备固有技能最高等级：未知'),
  ).toBeDefined()
  target()
  expect(screen.queryByRole('button', { name: '预览建议：完美溶剂' })).toBeNull()
  expect(screen.getByText('已达成 0 / 1')).toBeDefined()
  target('19.5')
  expect(screen.getByRole('alert')).toBeDefined()
  expect(saved().targetImplicitValues[0].bounds[0].min).toBe(20)
})
