import { type CraftProject, enableCraftAffixIdentity } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  catalog as makeCatalog,
  state,
} from '../../../../packages/item-core/src/partialTargetFixture'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./ProjectControls', () => ({
  ProjectControls: ({ project }: { project: CraftProject }) => (
    <output data-testid="project">{JSON.stringify(project)}</output>
  ),
}))
vi.mock('./targetRoutesWorkerClient', async () => {
  const { planTargetDefinitionRoutes } = await import('@poe2-tools/item-core')
  return {
    requestTargetRoutes: (
      args: Parameters<typeof planTargetDefinitionRoutes>,
      callback: (result: ReturnType<typeof planTargetDefinitionRoutes>) => void,
    ) => {
      callback(planTargetDefinitionRoutes(...args))
      return () => {}
    },
  }
})
afterEach(cleanup)
const catalog = makeCatalog()
function start(rarity: 'normal' | 'magic' | 'rare', ids: string[]) {
  const initial = enableCraftAffixIdentity(catalog, state(rarity, ids))
  if (!initial.ok) throw Error(initial.error)
  render(<RehearsalPanel catalog={catalog} initialState={initial.value} translations={{}} />)
}
function project(): CraftProject {
  return JSON.parse(screen.getByTestId('project').textContent ?? '')
}
function click(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}
function choose(id: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${id} ·`) }))
}
function apply() {
  click('应用本次结果')
}
describe('普通制作界面保留词缀实例', () => {
  it('目标路线的神圣首步进入草稿后仍保留实例定位', () => {
    start('magic', ['p1'])
    fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'p1' } })
    click('加入目标 p1')
    click('设置数值条件 p1')
    fireEvent.change(screen.getByLabelText('p1 · 数值 1 最小值'), { target: { value: '9' } })
    click('保存数值条件 p1')
    click('生成多步示例路线')
    const first = screen.getAllByRole('button', { name: '预览路线第一步' })[0]
    if (!first) throw Error('缺少目标路线')
    fireEvent.click(first)
    expect((screen.getByLabelText('p1 · 数值 1') as HTMLInputElement).value).toBe('9')
    apply()
    expect(project().operations[0]).toMatchObject({
      currency: 'divine',
      rolls: [{ modId: 'p1', affixId: 'a1', values: [9] }],
    })
  })
  it('新增和神圣掷值保留实际实例，取消不产生历史', () => {
    start('normal', [])
    click('蜕变石')
    choose('p1')
    fireEvent.change(screen.getByLabelText('p1 · 数值 1'), { target: { value: '8' } })
    click('取消本次结果')
    expect(project().operations).toEqual([])
    click('蜕变石')
    choose('p1')
    fireEvent.change(screen.getByLabelText('p1 · 数值 1'), { target: { value: '8' } })
    apply()
    expect(project().operations[0]).toMatchObject({
      rolls: [{ modId: 'p1', affixId: 'a1', values: [8] }],
    })
    click('神圣石')
    fireEvent.change(screen.getByLabelText('p1 · 数值 1'), { target: { value: '9' } })
    apply()
    expect(project().operations[1]).toMatchObject({
      rolls: [{ modId: 'p1', affixId: 'a1', values: [9] }],
    })
  })
  it('同类型混沌替换区分旧移除与新掷值，撤销后的新操作截断未来', () => {
    start('rare', ['p1', 's1'])
    click('混沌石')
    fireEvent.click(
      within(screen.getByLabelText('选择要移除的词缀')).getByRole('button', {
        name: /选择移除此组：p1/,
      }),
    )
    choose('p1')
    apply()
    expect(project().operations[0]).toMatchObject({
      removeModId: 'p1',
      removeAffixId: 'a1',
      rolls: [{ modId: 'p1', affixId: 'a3' }],
    })
    click('撤销')
    expect(project().cursor).toBe(0)
    expect(project().operations).toHaveLength(1)
    click('剥离石')
    fireEvent.click(
      within(screen.getByLabelText('选择要移除的词缀')).getByRole('button', {
        name: /选择移除此组：p1/,
      }),
    )
    apply()
    expect(project().operations).toEqual([
      { currency: 'annulment', modIds: [], removeModId: 'p1', removeAffixId: 'a1' },
    ])
  })
  it('点金撤回选择后按同一起点重放，保留其余数值并重用该分支游标', () => {
    start('magic', ['p1'])
    click('点金石')
    for (const id of ['p1', 's1', 'p2', 's2']) choose(id)
    fireEvent.change(screen.getByLabelText('p1 · 数值 1'), { target: { value: '7' } })
    click('撤销上一个选择')
    expect((screen.getByLabelText('p1 · 数值 1') as HTMLInputElement).value).toBe('7')
    choose('p3')
    apply()
    expect(project().operations[0]).toMatchObject({
      modIds: ['p1', 's1', 'p2', 'p3'],
      rolls: [
        { modId: 'p1', affixId: 'a2', values: [7] },
        { modId: 's1', affixId: 'a3' },
        { modId: 'p2', affixId: 'a4' },
        { modId: 'p3', affixId: 'a5' },
      ],
    })
  })
})
