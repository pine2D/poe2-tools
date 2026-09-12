import { type CraftState, DESECRATION_SOURCE } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { BoneCraftPanel } from './BoneCraftPanel'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

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
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})
const raw =
  'Item Class: Helmets\nRarity: Rare\nSynthetic Item\nSynthetic Base\n--------\nItem Level: 64'
function start() {
  const initialState: CraftState = {
    baseId: 'Synthetic Base',
    itemLevel: 64,
    rarity: 'rare',
    affixes: [],
    sourceText: raw,
  }
  render(
    <RehearsalPanel
      catalog={boneCatalog()}
      initialState={initialState}
      translations={{ 'Preserved Rib': '合成保存肋骨' }}
    />,
  )
}
function applyBone() {
  fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
}
it('骨骼三段预览应用、占位/固定候选、保存恢复和撤销费用组成完整流程', () => {
  start()
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_rib' } })
  fireEvent.click(screen.getByLabelText('占用后缀'))
  fireEvent.click(screen.getByRole('button', { name: '预览骨骼结果' }))
  expect(screen.queryByText('合成保存肋骨 × 1')).toBeNull()
  expect((screen.getByRole('button', { name: '崇高石' }) as HTMLButtonElement).disabled).toBe(true)
  applyBone()
  expect(screen.getByText('未揭示亵渎后缀')).toBeDefined()
  fireEvent.change(screen.getByLabelText('装备文本语言'), { target: { value: 'en' } })
  fireEvent.click(screen.getByRole('button', { name: '导出装备文本' }))
  expect(screen.getByText(/待揭示亵渎不能导出装备文本，请保存项目/)).toBeDefined()
  expect(screen.getByRole('heading', { name: '后缀 1/3' })).toBeDefined()
  expect(screen.getByText('合成保存肋骨 × 1')).toBeDefined()
  expect((screen.getByRole('button', { name: '预览三项候选' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  for (const id of ['suffix1', 'exclusive1', 'exclusive2'])
    fireEvent.click(screen.getByLabelText(`候选 ${id}`))
  fireEvent.click(screen.getByRole('button', { name: '预览三项候选' }))
  applyBone()
  expect(screen.getByRole('heading', { name: '已固定三项候选' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.desecrationSourceHash).toBe(DESECRATION_SOURCE.sha256)
  expect(saved.operations).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: '选择揭示 exclusive1' }))
  fireEvent.change(screen.getByLabelText('exclusive1 · 数值 1'), { target: { value: '7' } })
  fireEvent.click(screen.getByRole('button', { name: '预览揭示结果' }))
  applyBone()
  expect(screen.getByText('亵渎词缀 1/1')).toBeDefined()
  expect((screen.getByLabelText('演练装备英文文本') as HTMLTextAreaElement).value).toContain(
    '(desecrated)',
  )
  expect((screen.getByRole('button', { name: '神圣石' }) as HTMLButtonElement).disabled).toBe(false)
  expect(screen.queryByText('未揭示亵渎后缀')).toBeNull()
  expect(screen.getByText('合成保存肋骨 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByRole('heading', { name: '已固定三项候选' })).toBeDefined()
  expect(screen.queryByText('亵渎词缀 1/1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '回到起点' }))
  expect(screen.queryByText('合成保存肋骨 × 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(
    JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').desecrationSourceHash,
  ).toBe(DESECRATION_SOURCE.sha256)
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(screen.getByText('合成保存肋骨 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(
    within(screen.getByLabelText('固定揭示选项')).getAllByRole('button', { name: /选择揭示/ }),
  ).toHaveLength(3)
})

it('满六组的目标移除风险及占位侧联动在预览前可核对', () => {
  const onPreview = vi.fn()
  render(
    <BoneCraftPanel
      catalog={boneCatalog()}
      state={boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])}
      translations={{ 'Preserved Rib': '保存肋骨' }}
      disabled={false}
      onPreview={onPreview}
      targetModIds={['prefix1']}
      targetAlternatives={[{ targetModId: 'prefix1', modIds: ['prefix2'] }]}
    />,
  )
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_rib' } })
  expect(screen.getByText(/随机移除风险中的对应目标词缀：prefix1/)).toBeDefined()
  expect((screen.getByRole('button', { name: '预览骨骼结果' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  fireEvent.click(screen.getByLabelText('骨骼移除 prefix2'))
  expect(screen.getByText(/本次指定移除将移除对应目标词缀：prefix1/)).toBeDefined()
  expect((screen.getByLabelText('占用前缀') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('占用后缀') as HTMLInputElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '预览骨骼结果' }))
  expect(onPreview).toHaveBeenCalledWith({
    kind: 'desecrate',
    boneId: 'preserved_rib',
    affixKind: 'prefix',
    removeModId: 'prefix2',
  })
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'ancient_rib' } })
  expect((screen.getByRole('button', { name: '预览骨骼结果' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
})
it('取消骨骼草稿恢复焦点并清选择，旧通货草稿与骨骼相互锁定', () => {
  start()
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_rib' } })
  fireEvent.click(screen.getByLabelText('占用后缀'))
  fireEvent.click(screen.getByRole('button', { name: '预览骨骼结果' }))
  expect(document.activeElement).toBe(screen.getByLabelText('骨骼待应用结果'))
  fireEvent.click(screen.getByRole('button', { name: '取消骨骼步骤' }))
  expect(document.activeElement).toBe(screen.getByLabelText('骨骼与揭示').parentElement)
  expect((screen.getByLabelText('骨骼材料') as HTMLSelectElement).value).toBe('')
  fireEvent.click(screen.getByRole('button', { name: '崇高石' }))
  expect((screen.getByLabelText('骨骼材料') as HTMLSelectElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '取消本次结果' }))
  expect((screen.getByLabelText('骨骼材料') as HTMLSelectElement).disabled).toBe(false)
})
it('固定选项逐项显示普通目标，数值达成与disabled覆盖数值编辑', () => {
  const catalog = boneCatalog()
  const state: CraftState = {
    ...boneState(),
    pendingDesecration: {
      boneId: 'preserved_rib',
      kind: 'suffix',
      options: ['suffix1', 'suffix2', 'exclusive1'],
    },
  }
  const props = {
    catalog,
    state,
    translations: {},
    onPreview: vi.fn(),
    targetModIds: ['suffix1'],
    targetValues: [{ modId: 'suffix1', bounds: [{ index: 0, min: 7 }] }],
  }
  const { rerender } = render(<BoneCraftPanel {...props} disabled={false} />)
  expect(screen.getByText(/对应目标：suffix1/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '选择揭示 suffix1' }))
  expect(screen.getByText('当前数值不满足此目标条件。')).toBeDefined()
  fireEvent.change(screen.getByLabelText('suffix1 · 数值 1'), { target: { value: '7' } })
  expect(screen.getByText('当前数值满足此目标条件。')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '预览揭示结果' }))
  expect(props.onPreview).toHaveBeenCalledWith({
    kind: 'desecration-reveal',
    modId: 'suffix1',
    values: [7],
  })
  rerender(<BoneCraftPanel {...props} disabled={true} />)
  expect(screen.getByLabelText('suffix1 · 数值 1').closest('fieldset')?.disabled).toBe(true)
  expect(
    (screen.getByRole('button', { name: '选择揭示 suffix2' }) as HTMLButtonElement).disabled,
  ).toBe(true)
})
it('空白普通起点先点金成稀有，再施加骨骼', () => {
  render(
    <RehearsalPanel
      catalog={boneCatalog()}
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
  expect(screen.getByText('骨骼只支持可制作的稀有装备。')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '点金石' }))
  for (const id of ['prefix1', 'prefix2', 'suffix1', 'suffix2'])
    fireEvent.click(
      within(screen.getByLabelText('本次指定结果')).getByRole('button', {
        name: new RegExp(`^${id} `),
      }),
    )
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_rib' } })
  fireEvent.click(screen.getByLabelText('占用后缀'))
  fireEvent.click(screen.getByRole('button', { name: '预览骨骼结果' }))
  applyBone()
  expect(screen.getByRole('heading', { name: '后缀 3/3' })).toBeDefined()
  expect(screen.queryAllByText('空后缀')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(
    JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations.map(
      (step: { kind?: string; currency?: string }) => step.kind ?? step.currency,
    ),
  ).toEqual(['alchemy', 'desecrate'])
})
