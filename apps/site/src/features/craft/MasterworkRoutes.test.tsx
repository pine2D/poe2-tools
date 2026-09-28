import { readFileSync } from 'node:fs'
import { type CraftCatalog, parseTargetCraftProject } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
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
const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog: CraftCatalog = {
  ...primary,
  modifiers: [],
  essences: [],
  augments: (primary.augments ?? []).filter(
    (a) =>
      a.category === 'armour' && (a.name.endsWith('Desert Rune') || a.name === 'Masterwork Rune'),
  ),
}
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
function previewFirst() {
  const button = screen.getAllByRole('button', { name: '预览路线第一步' })[0]
  if (!button) throw Error('缺少路线第一步')
  fireEvent.click(button)
}
function save() {
  click('保存演练到本机')
  const result = parseTargetCraftProject(
    localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '',
    catalog,
  )
  if (!result.ok) throw Error(result.error)
  return result.value.project
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
it('真实面板路线逐次升级：预览取消不消费，应用清除旧路线，完整未来恢复', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={{
        baseId: 'Adherent Cuffs',
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
        quality: 0,
        sockets: [null],
      }}
    />,
  )
  change('选择镶嵌符文', id('Lesser Desert Rune'))
  click('应用镶嵌')
  click('添加面板目标')
  change('面板目标 1 面板指标', 'fireResistance')
  change('面板目标 1 面板下限', '22')
  click('应用面板目标 1面板范围')
  for (const [name, price] of [
    ['Masterwork Rune', '1'],
    ['Desert Rune', '100'],
    ['Greater Desert Rune', '100'],
    ['Perfect Desert Rune', '100'],
  ]) {
    if (!name || !price) throw Error('缺少报价')
    const label = catalog.localizedNames?.['zh-CN']?.[name] ?? name
    change('搜索报价材料', name)
    click(`添加报价 ${label}`)
    change(`${label}单价`, price)
  }
  click('应用报价')
  fireEvent.click(screen.getByLabelText('按自填报价优先搜索'))
  for (const name of ['Desert Rune', 'Greater Desert Rune', 'Perfect Desert Rune']) {
    click('生成多步示例路线')
    previewFirst()
    const before = save()
    click('取消符文升级结果')
    expect(save()).toEqual(before)
    previewFirst()
    click('应用符文升级结果')
    expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
    expect(save().operations.at(-1)).toMatchObject({ kind: 'masterwork', toAugmentId: id(name) })
  }
  expect(within(screen.getByRole('region', { name: '面板目标' })).getByText('已达成')).toBeTruthy()
  const complete = save()
  expect(complete.rulesVersion).toBe('basic-2026-09-18-v121')
  expect(complete.operations).toHaveLength(4)
  click('撤销')
  const future = save()
  expect(future.cursor).toBe(3)
  expect(future.operations).toEqual(complete.operations)
  click('恢复本机演练')
  click('重做')
  expect(save()).toEqual(complete)
}, 15_000)

it('路线带出报价材料并定位已有表单，保留未应用草稿且不提前修改报价或历史', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={{
        baseId: 'Adherent Cuffs',
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
        quality: 0,
        sockets: [null],
      }}
    />,
  )
  change('选择镶嵌符文', id('Lesser Desert Rune'))
  click('应用镶嵌')
  change('次级沙漠符文单价', '7')
  click('添加面板目标')
  change('面板目标 1 面板指标', 'fireResistance')
  change('面板目标 1 面板下限', '22')
  click('应用面板目标 1面板范围')
  click('生成多步示例路线')
  const button = screen.getAllByRole('button', { name: '填写本路线报价' })[0]
  if (!button) throw Error('缺少路线报价入口')
  fireEvent.click(button)
  const perfect = screen.getByLabelText('完美沙漠符文单价') as HTMLInputElement
  expect(document.activeElement).toBe(perfect)
  expect(perfect.closest('details')?.open).toBe(true)
  expect(perfect.value).toBe('')
  expect((screen.getByLabelText('次级沙漠符文单价') as HTMLInputElement).value).toBe('7')
  expect(save().pricing).toBeUndefined()
  expect(save().operations).toHaveLength(1)
  change('完美沙漠符文单价', '3')
  click('应用报价')
  expect(save().pricing?.prices).toMatchObject({
    'augment:Lesser Desert Rune': 7,
    'augment:Perfect Desert Rune': 3,
  })
  expect(screen.getByText('路线新增成本：3 神圣石')).toBeTruthy()
  expect(save().operations).toHaveLength(1)
})
