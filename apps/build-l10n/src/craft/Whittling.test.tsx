import {
  exportCraftItemText,
  importCraftState,
  inspectItem,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { RehearsalPanel } from './RehearsalPanel'
import { TargetRoutesPanel } from './TargetRoutesPanel'

vi.mock('./targetRoutesWorkerClient', async () => {
  const { planCraftTargetRoutes } = await import('@poe2-tools/item-core')
  return {
    requestTargetRoutes: (
      args: Parameters<typeof planCraftTargetRoutes>,
      callback: (result: ReturnType<typeof planCraftTargetRoutes>) => void,
    ) => {
      callback(planCraftTargetRoutes(...args))
      return () => {}
    },
  }
})

afterEach(cleanup)
it('消减显示出现等级与并列风险，手动移除只提供最低组', () => {
  const catalog = boneCatalog()
  for (const m of catalog.modifiers) m.level = m.id === 'suffix1' ? 10 : 30
  const text = exportCraftItemText(catalog, boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2']))
  if (!text.ok) throw Error(text.error)
  const parsed = parseItem(text.value.text)
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
      translations={{ 'Omen of Whittling': '消减预兆' }}
    />,
  )
  fireEvent.change(screen.getByLabelText('本次搭配预兆'), { target: { value: 'whittling' } })
  expect(screen.getByText(/比较出现等级，不按阶级或数值大小选择/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '混沌石' }))
  const removal = screen.getByRole('region', { name: '选择要移除的词缀' })
  expect(within(removal).getByText(/目录词缀等级 10/)).toBeDefined()
  expect(within(removal).queryByText(/后缀中随机移除/)).toBeNull()
  expect(within(removal).getAllByRole('button', { name: /移除.*组/ })).toHaveLength(1)
  expect(within(removal).queryByText('prefix1')).toBeNull()
  fireEvent.click(within(removal).getByRole('button', { name: '取消选择' }))
  expect(screen.queryByText('消减预兆 × 1')).toBeNull()
})

it.each(['whittling', 'whittling_sinistral_erasure'] as const)(
  '%s 联合路线显示材料、等级规则并预览实际步骤',
  async (omen) => {
    const catalog = boneCatalog()
    for (const m of catalog.modifiers)
      m.level = m.id === 'prefix3' ? 5 : omen !== 'whittling' && m.id === 'suffix1' ? 1 : 30
    const state = boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])
    const preview = vi.fn()
    render(
      <TargetRoutesPanel
        catalog={catalog}
        state={state}
        ids={['prefix1', 'prefix2', 'prefix4', 'suffix1', 'suffix2', 'suffix3']}
        values={[]}
        alternatives={[]}
        busy={false}
        translations={{ 'Omen of Whittling': '消减预兆' }}
        onPreview={preview}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
    expect(await screen.findByText(/消减预兆 × 1/)).toBeDefined()
    expect(
      screen.getAllByText(
        omen === 'whittling' ? /比较出现等级，不按阶级或数值大小选择/ : /先限定未破裂前缀/,
      ).length,
    ).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: '预览路线第一步' })[0] as HTMLElement)
    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'chaos', omen, removeModId: 'prefix3' }),
    )
  },
)
