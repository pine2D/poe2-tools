import {
  exportCraftItemText,
  importCraftState,
  inspectItem,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { RehearsalPanel } from './RehearsalPanel'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
it('定向消减取消不计费，应用保留两枚材料和完整撤销恢复', () => {
  const catalog = boneCatalog()
  for (const mod of catalog.modifiers)
    mod.level = mod.id === 'suffix1' ? 1 : mod.id === 'prefix1' ? 10 : 30
  const exported = exportCraftItemText(
    catalog,
    boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2']),
  )
  if (!exported.ok) throw Error(exported.error)
  const parsed = parseItem(exported.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const dictionary = { items: { bases: { 'Synthetic Base': 'Synthetic Base' }, uniques: {} } }
  const initial = importCraftState(
    catalog,
    'Synthetic Base',
    parsed.item,
    inspectItem(parsed.item, dictionary),
  )
  if (!initial.ok) throw Error(initial.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initial.value}
      translations={{
        'Omen of Whittling': '消减预兆',
        'Omen of Sinistral Erasure': '左旋消抹预兆',
      }}
    />,
  )
  const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
  fireEvent.change(screen.getByLabelText('本次搭配预兆'), {
    target: { value: 'whittling_sinistral_erasure' },
  })
  click('混沌石')
  let removal = screen.getByRole('region', { name: '选择要移除的词缀' })
  expect(within(removal).getByText('目录词缀等级 10')).toBeDefined()
  expect(within(removal).getAllByRole('button', { name: /移除.*组/ })).toHaveLength(1)
  fireEvent.click(within(removal).getByRole('button', { name: '取消选择' }))
  expect(screen.queryByText('消减预兆 × 1')).toBeNull()
  click('混沌石')
  removal = screen.getByRole('region', { name: '选择要移除的词缀' })
  fireEvent.click(within(removal).getByRole('button', { name: /移除.*组/ }))
  fireEvent.change(screen.getByLabelText('搜索合法词缀'), { target: { value: 'suffix3' } })
  fireEvent.click(
    within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: /suffix3/ }),
  )
  click('应用本次结果')
  expect(screen.getByText('消减预兆 × 1')).toBeDefined()
  expect(screen.getByText('左旋消抹预兆 × 1')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v67')
  expect(saved.operations[0]).toMatchObject({
    omen: 'whittling_sinistral_erasure',
    removeModId: 'prefix1',
    modIds: ['suffix3'],
  })
  click('撤销')
  expect(screen.queryByText('消减预兆 × 1')).toBeNull()
  click('恢复本机演练')
  expect(screen.getByText('消减预兆 × 1')).toBeDefined()
})
