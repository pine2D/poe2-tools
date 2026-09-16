import { readFileSync } from 'node:fs'
import { type CraftCatalog, parseTargetCraftProject } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', () => ({ requestTargetRoutes: () => () => {} }))
const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
function save() {
  click('保存演练到本机')
  const p = parseTargetCraftProject(
    localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '',
    catalog,
  )
  if (!p.ok) throw Error(p.error)
  return p.value.project
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
it('原孔升级预览取消不计费，应用后v85完整未来恢复，指引固定孔位', () => {
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
        sockets: [null],
        quality: 20,
      }}
    />,
  )
  change('选择镶嵌符文', id('Greater Ward Rune'))
  click('应用镶嵌')
  click('预览符文升级结果')
  expect(screen.getByText('30 → 36（+6）')).toBeTruthy()
  click('取消符文升级结果')
  expect(save().operations).toHaveLength(1)
  click('启用条件指引示例')
  change('规则 1 条件 1', 'always')
  change('规则 1 动作', 'masterwork')
  expect(save().rulesVersion).toBe('basic-2026-09-16-v85')
  click('开始指引步骤')
  click('预览符文升级结果')
  click('应用符文升级结果')
  expect(within(screen.getByLabelText('防御面板估算')).getByText('36')).toBeTruthy()
  const p = save()
  expect(p.operations).toHaveLength(2)
  expect(p.operations[1]).toMatchObject({
    kind: 'masterwork',
    socketIndex: 0,
    toAugmentId: id('Perfect Ward Rune'),
  })
  click('撤销')
  const future = save()
  expect(future.cursor).toBe(1)
  expect(future.operations).toHaveLength(2)
  click('重做')
  click('恢复本机演练')
  expect(save()).toEqual(future)
  click('重做')
  expect(save().operations).toEqual(p.operations)
  expect(
    within(screen.getByRole('region', { name: '已消耗材料' })).getByText(
      `${catalog.localizedNames?.['zh-CN']?.['Masterwork Rune']} × 1`,
    ),
  ).toBeTruthy()
}, 15_000)

it('起点孔位未知时，未执行升级指引仍写入来源哈希', () => {
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
      }}
    />,
  )
  click('启用条件指引示例')
  change('规则 1 动作', 'masterwork')
  const p = save()
  expect(p.rulesVersion).toBe('basic-2026-09-16-v85')
  expect(p.augmentSourceHash).toBe(
    catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')?.sha256,
  )
})
