import { type CraftState, loadTargetWorkbenchProject } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { BoneCraftPanel } from './BoneCraftPanel'
import { CraftComparisonPanel } from './CraftComparisonPanel'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const emptyDefinitions = { nextTargetId: 1, targets: [], alternatives: [], values: [] }

it('恢复空 v123 项目后网页保存不降版', () => {
  const catalog = boneCatalog('Ring')
  const { sockets: _, ...initial } = boneState()
  const initialState = { ...initial, rarity: 'normal' as const, nextAffixId: 1 }
  const loaded = loadTargetWorkbenchProject(
    JSON.stringify({
      schemaVersion: 1,
      rulesVersion: 'basic-2026-09-18-v123',
      sourceCommit: catalog._meta.sourceCommit,
      initialState,
      operations: [],
      cursor: 0,
      targetDefinitions: emptyDefinitions,
      orphanedTargets: [],
    }),
    catalog,
  )
  if (!loaded.ok) throw Error(loaded.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initialState}
      initialProject={loaded.value}
      translations={translations}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').rulesVersion).toBe(
    'basic-2026-09-18-v123',
  )
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})
const translations = { 'Omen of Abyssal Echoes': '深渊回响预兆', 'Preserved Rib': '保存完好的肋骨' }
it('首组三项前声明回响，预览包含购买机会且busy锁定', () => {
  const onPreview = vi.fn()
  const props = {
    catalog: boneCatalog(),
    state: {
      ...boneState(),
      pendingDesecration: { boneId: 'preserved_rib' as const, kind: 'suffix' as const },
    },
    translations,
    onPreview,
  }
  const view = render(<BoneCraftPanel definitions={emptyDefinitions} {...props} disabled={false} />)
  fireEvent.click(screen.getByLabelText('首次揭示使用深渊回响'))
  for (const id of ['suffix1', 'suffix2', 'suffix3'])
    fireEvent.click(screen.getByLabelText(`候选 ${id}`))
  expect(screen.getByText(/成功固定首组即消耗一份/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '预览三项候选' }))
  expect(onPreview).toHaveBeenCalledWith({
    kind: 'desecration-offer',
    modIds: ['suffix1', 'suffix2', 'suffix3'],
    revealOmen: 'abyssal_echoes',
  })
  view.rerender(<BoneCraftPanel definitions={emptyDefinitions} {...props} disabled={true} />)
  expect((screen.getByLabelText('首次揭示使用深渊回响') as HTMLInputElement).disabled).toBe(true)
})

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
const apply = () => fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
function normalPending(
  boneId:
    | 'preserved_rib'
    | 'ancient_rib'
    | 'blackblooded'
    | 'ring-blackblooded'
    | 'ring-liege' = 'preserved_rib',
) {
  const ring = boneId.startsWith('ring-')
  const lich = boneId === 'ring-liege' ? 'liege' : 'blackblooded'
  const hasLich = ring || boneId === 'blackblooded'
  const catalog = boneCatalog(ring ? 'Ring' : hasLich ? 'Amulet' : 'Helmet')
  if (hasLich)
    for (const mod of catalog.modifiers) {
      if (mod.desecratedOnly)
        mod.tags = ['unveiled_mod', lich === 'liege' ? 'amanamu_mod' : 'kurgal_mod']
    }
  const { sockets: _, ...initial } = boneState()
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={{ ...initial, rarity: 'normal' }}
      translations={translations}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '点金石' }))
  for (const id of ['prefix1', 'prefix2', 'suffix1', 'suffix2'])
    fireEvent.click(
      within(screen.getByLabelText('本次指定结果')).getByRole('button', {
        name: new RegExp(`^${id} `),
      }),
    )
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  fireEvent.change(screen.getByLabelText('骨骼材料'), {
    target: { value: hasLich ? 'preserved_collarbone' : boneId },
  })
  if (hasLich) fireEvent.change(screen.getByLabelText('骨骼巫妖预兆'), { target: { value: lich } })
  fireEvent.click(screen.getByLabelText('占用后缀'))
  fireEvent.click(screen.getByRole('button', { name: '预览骨骼结果' }))
  apply()
}
function firstOffer() {
  fireEvent.click(screen.getByLabelText('首次揭示使用深渊回响'))
  for (const id of ['suffix3', 'suffix4', 'exclusive1'])
    fireEvent.click(screen.getByLabelText(`候选 ${id}`))
  fireEvent.click(screen.getByRole('button', { name: '预览三项候选' }))
}
it.each(['preserved_rib', 'ancient_rib'] as const)(
  '%s 首offer收费一次、重选免费且保留两组，跨组同ID可访问并能选回首组保存恢复',
  (boneId) => {
    normalPending(boneId)
    firstOffer()
    expect(screen.queryByText('深渊回响预兆 × 1')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '取消骨骼步骤' }))
    expect((screen.getByLabelText('首次揭示使用深渊回响') as HTMLInputElement).checked).toBe(false)
    firstOffer()
    apply()
    expect(screen.getByText('深渊回响预兆 × 1')).toBeDefined()
    expect(screen.queryByLabelText('首次揭示使用深渊回响')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '指定第二组三项' }))
    for (const id of ['exclusive1', 'exclusive2', 'exclusive3'])
      fireEvent.click(screen.getByLabelText(`第二组候选 ${id}`))
    fireEvent.click(screen.getByRole('button', { name: '预览第二组三项' }))
    expect(
      within(screen.getByLabelText('骨骼待应用结果')).getByRole('heading', {
        name: '重选第二组三项候选',
      }),
    ).toBeDefined()
    apply()
    expect(screen.getByRole('heading', { name: '首组三项候选' })).toBeDefined()
    expect(screen.getByRole('heading', { name: '第二组三项候选' })).toBeDefined()
    expect(screen.getByRole('button', { name: '首组：选择揭示 exclusive1' })).toBeDefined()
    expect(screen.getByRole('button', { name: '第二组：选择揭示 exclusive1' })).toBeDefined()
    expect(screen.queryByRole('button', { name: '指定第二组三项' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    const project = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
    expect(project.schemaVersion).toBe(1)
    if (boneId === 'ancient_rib') expect(project.rulesVersion).toBe('basic-2026-09-18-v118')
    expect(project.operations[2].revealOmen).toBe('abyssal_echoes')
    expect(project.operations[3].kind).toBe('desecration-reroll')
    fireEvent.click(screen.getByRole('button', { name: '首组：选择揭示 suffix3' }))
    fireEvent.click(screen.getByRole('button', { name: '预览揭示结果' }))
    apply()
    expect(screen.getByText('亵渎词缀 1/1')).toBeDefined()
    expect(screen.getByText('深渊回响预兆 × 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    expect(screen.getByRole('button', { name: '第二组：选择揭示 exclusive3' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(screen.queryByRole('heading', { name: '第二组三项候选' })).toBeNull()
    expect(screen.getByText('深渊回响预兆 × 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(screen.queryByText('深渊回响预兆 × 1')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(screen.getByText('深渊回响预兆 × 1')).toBeDefined()
  },
)

it('Ancient及巫妖交互显示工具未验证原因，已有首组不能晚补回响', () => {
  for (const pending of [
    { boneId: 'ancient_collarbone' as const, kind: 'suffix' as const },
    {
      boneId: 'preserved_collarbone' as const,
      kind: 'suffix' as const,
      lichOmen: 'sovereign' as const,
    },
  ]) {
    render(
      <BoneCraftPanel
        definitions={emptyDefinitions}
        catalog={boneCatalog('Ring')}
        state={{ ...boneState(), pendingDesecration: pending }}
        translations={translations}
        disabled={false}
        onPreview={vi.fn()}
      />,
    )
    expect((screen.getByLabelText('首次揭示使用深渊回响') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('本工具尚未验证')
    cleanup()
  }
  render(
    <BoneCraftPanel
      definitions={emptyDefinitions}
      catalog={boneCatalog()}
      state={{
        ...boneState(),
        pendingDesecration: {
          boneId: 'preserved_rib',
          kind: 'suffix',
          options: ['suffix1', 'suffix2', 'suffix3'],
        },
      }}
      translations={translations}
      disabled={false}
      onPreview={vi.fn()}
    />,
  )
  expect(screen.queryByLabelText('首次揭示使用深渊回响')).toBeNull()
  expect(screen.queryByRole('button', { name: '指定第二组三项' })).toBeNull()
  expect(screen.getByText(/不能在看到首组后补用/)).toBeDefined()
})
it('两组同ID按钮有独立可访问名称与选中状态，最终只预览对应ID', () => {
  const catalog = boneCatalog()
  const preview = vi.fn()
  const state: CraftState = {
    ...boneState(),
    pendingDesecration: {
      boneId: 'preserved_rib',
      kind: 'suffix',
      options: ['suffix1', 'suffix2', 'suffix3'],
      revealOmen: 'abyssal_echoes',
      rerollOptions: ['suffix1', 'exclusive1', 'exclusive2'],
    },
  }
  const props = { catalog, state, translations, onPreview: preview }
  const view = render(<BoneCraftPanel definitions={emptyDefinitions} {...props} disabled={false} />)
  const first = screen.getByRole('button', { name: '首组：选择揭示 suffix1' })
  const second = screen.getByRole('button', { name: '第二组：选择揭示 suffix1' })
  fireEvent.click(second)
  expect(first.getAttribute('aria-pressed')).toBe('false')
  expect(second.getAttribute('aria-pressed')).toBe('true')
  fireEvent.change(screen.getByLabelText('suffix1 · 数值 1'), { target: { value: '8' } })
  fireEvent.click(screen.getByRole('button', { name: '预览揭示结果' }))
  expect(preview).toHaveBeenCalledWith({
    kind: 'desecration-reveal',
    modId: 'suffix1',
    values: [8],
  })
  view.rerender(<BoneCraftPanel definitions={emptyDefinitions} {...props} disabled={true} />)
  expect((first as HTMLButtonElement).disabled).toBe(true)
  expect((second as HTMLButtonElement).disabled).toBe(true)
})
it('已购买后直接揭示首组仍收费，第二组建议与worker路线沿真实草稿且不新增费用', () => {
  normalPending()
  firstOffer()
  apply()
  fireEvent.click(screen.getByRole('button', { name: '选择揭示 suffix3' }))
  fireEvent.click(screen.getByRole('button', { name: '预览揭示结果' }))
  apply()
  expect(screen.getByText('深渊回响预兆 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'exclusive2' } })
  fireEvent.click(screen.getByRole('button', { name: '加入目标 exclusive2' }))
  expect(screen.getByRole('button', { name: '预览骨骼建议：重选第二组三项候选' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(screen.getByText('预计材料：无需新增材料。预览不计入实际历史。')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '预览路线第一步' }))
  expect(
    within(screen.getByLabelText('骨骼待应用结果')).getByRole('heading', {
      name: '重选第二组三项候选',
    }),
  ).toBeDefined()
  apply()
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  fireEvent.click(screen.getByRole('button', { name: '预览路线第一步' }))
  apply()
  expect(screen.getByText('已达成 1 / 1')).toBeDefined()
  expect(screen.getByText('深渊回响预兆 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const operations = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations
  expect(
    operations.filter((op: { kind?: string }) => op.kind === 'desecration-reroll'),
  ).toHaveLength(1)
})
it('比较明确保留首组并追加第二组及已购买机会', () => {
  const before: CraftState = {
    ...boneState(),
    pendingDesecration: {
      boneId: 'preserved_rib',
      kind: 'suffix',
      options: ['suffix1', 'suffix2', 'suffix3'],
      revealOmen: 'abyssal_echoes',
    },
  }
  const after: CraftState = {
    ...before,
    pendingDesecration: {
      boneId: 'preserved_rib',
      kind: 'suffix',
      options: ['suffix1', 'suffix2', 'suffix3'],
      revealOmen: 'abyssal_echoes',
      rerollOptions: ['suffix1', 'exclusive1', 'exclusive2'],
    },
  }
  render(
    <CraftComparisonPanel
      definitions={emptyDefinitions}
      catalog={boneCatalog()}
      before={before}
      after={after}
      translations={translations}
    />,
  )
  expect(screen.getByText('首组三项候选')).toBeDefined()
  expect(screen.getByText('第二组三项候选')).toBeDefined()
  expect(screen.getAllByText(/已购买一次重选机会/)).toHaveLength(2)
})

it.each([
  ['blackblooded', 'basic-2026-09-18-v119', 'blackblooded'],
  ['ring-blackblooded', 'basic-2026-09-18-v123', 'blackblooded'],
  ['ring-liege', 'basic-2026-09-18-v123', 'liege'],
] as const)('%s网页计费一次，撤销保存完整第二组未来并恢复版本', (mode, version, lich) => {
  normalPending(mode)
  fireEvent.click(screen.getByLabelText('首次揭示使用深渊回响'))
  for (const id of ['exclusive1', 'exclusive2', 'exclusive3'])
    fireEvent.click(screen.getByLabelText(`候选 ${id}`))
  fireEvent.click(screen.getByRole('button', { name: '预览三项候选' }))
  apply()
  fireEvent.click(screen.getByRole('button', { name: '指定第二组三项' }))
  for (const id of ['exclusive1', 'exclusive2', 'exclusive3'])
    fireEvent.click(screen.getByLabelText(`第二组候选 ${id}`))
  fireEvent.click(screen.getByRole('button', { name: '预览第二组三项' }))
  apply()
  expect(screen.getByText('深渊回响预兆 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const future = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(future.rulesVersion).toBe(version)
  expect(future.cursor).toBe(3)
  expect(future.operations[1].lichOmen).toBe(lich)
  expect(future.operations[3].kind).toBe('desecration-reroll')
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(screen.getByRole('button', { name: '第二组：选择揭示 exclusive3' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '首组：选择揭示 exclusive2' }))
  fireEvent.click(screen.getByRole('button', { name: '预览揭示结果' }))
  apply()
  expect(screen.getByText('亵渎词缀 1/1')).toBeDefined()
  expect(screen.getByText('深渊回响预兆 × 1')).toBeDefined()
})
