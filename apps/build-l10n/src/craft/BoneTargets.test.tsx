import {
  type CraftState,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  beltCatalog,
  beltSource,
  required,
} from '../../../../packages/item-core/src/beltTestFixture'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const delayed = vi.hoisted(() => ({
  hold: false,
  calls: [] as { finish: () => void; cancel: ReturnType<typeof vi.fn> }[],
}))
vi.mock('./targetRoutesWorkerClient', async () => {
  const { planTargetDefinitionRoutes } = await import('@poe2-tools/item-core')
  return {
    requestTargetRoutes: (
      args: Parameters<typeof planTargetDefinitionRoutes>,
      callback: (result: ReturnType<typeof planTargetDefinitionRoutes>) => void,
    ) => {
      const finish = () => callback(planTargetDefinitionRoutes(...args))
      const cancel = vi.fn()
      if (delayed.hold) delayed.calls.push({ finish, cancel })
      else finish()
      return cancel
    },
  }
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  delayed.hold = false
  delayed.calls = []
})
function addTarget(id = 'exclusive1') {
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: id } })
  fireEvent.click(screen.getByRole('button', { name: `加入目标 ${id}` }))
}
function firstStep() {
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  const preview = screen.getAllByRole('button', { name: '预览路线第一步' })[0]
  if (!preview) throw new Error('没有路线')
  fireEvent.click(preview)
}
it('搜索专属目标通过路线真实三阶段应用且只消耗一次骨骼', () => {
  render(
    <RehearsalPanel
      catalog={boneCatalog()}
      initialState={boneState()}
      translations={{
        'Ancient Rib': '远古肋骨',
        'Preserved Rib': '保存完好的肋骨',
        'Gnawed Rib': '啃噬的肋骨',
      }}
    />,
  )
  addTarget()
  firstStep()
  expect(screen.getByLabelText('骨骼待应用结果')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
  expect(screen.getByText('未揭示亵渎后缀')).toBeDefined()
  firstStep()
  fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
  firstStep()
  fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
  expect(screen.queryByText('未揭示亵渎后缀')).toBeNull()
  expect(screen.getByText('已达成 1 / 1')).toBeDefined()
  expect(screen.getAllByText(/肋骨 × 1/)).toHaveLength(1)
})

const apply = () =>
  fireEvent.click(
    screen.getByRole('button', {
      name: screen.queryByRole('button', { name: '应用骨骼步骤' })
        ? '应用骨骼步骤'
        : '应用本次结果',
    }),
  )
const saved = () => JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
function normalStart(rarity: CraftState['rarity'] = 'normal') {
  const { sockets: _, ...initial } = boneState()
  render(
    <RehearsalPanel
      catalog={boneCatalog()}
      initialState={{ ...initial, rarity }}
      translations={{
        'Ancient Rib': '远古肋骨',
        'Preserved Rib': '保存完好的肋骨',
        'Gnawed Rib': '啃噬的肋骨',
      }}
    />,
  )
  addTarget()
}
it.each(['normal', 'magic'] as const)('%s准备后接骨骼路线，取消预览不消费', (rarity) => {
  normalStart(rarity)
  firstStep()
  fireEvent.click(screen.getByRole('button', { name: '取消本次结果' }))
  expect(screen.getByText('尚未消耗通货')).toBeDefined()
  for (let i = 0; i < (rarity === 'normal' ? 5 : 4); i++) {
    firstStep()
    apply()
  }
  expect(screen.getByText('已达成 1 / 1')).toBeDefined()
  expect(screen.getAllByText(/肋骨 × 1/)).toHaveLength(1)
})
it('骨骼后与offer后保存恢复目标和固定三项，恢复清草稿与迟到worker', () => {
  normalStart()
  for (let i = 0; i < 3; i++) {
    firstStep()
    apply()
  }
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(saved().targetDefinitions).toEqual({
    nextTargetId: 2,
    targets: [{ targetId: 't1', modId: 'exclusive1' }],
    alternatives: [],
    values: [],
  })
  expect(saved().operations.at(-1).kind).toBe('desecrate')
  expect(parseTargetCraftProject(JSON.stringify(saved()), boneCatalog()).ok).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  firstStep()
  apply()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const fixed = saved().operations.at(-1).modIds
  expect(fixed).toHaveLength(3)
  firstStep()
  expect(screen.getByLabelText('骨骼待应用结果')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.queryByLabelText('骨骼待应用结果')).toBeNull()
  delayed.hold = true
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(required(delayed.calls[0]).cancel).toHaveBeenCalled()
  act(() => required(delayed.calls[0]).finish())
  expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
  delayed.hold = false
  firstStep()
  apply()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(saved().operations[saved().cursor - 1].modIds).toEqual(fixed)
  expect(saved().targetDefinitions).toEqual({
    nextTargetId: 2,
    targets: [{ targetId: 't1', modId: 'exclusive1' }],
    alternatives: [],
    values: [],
  })
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(screen.getByText('已达成 1 / 1')).toBeDefined()
})
it.each([false, true])(
  'pending已达成或无目标仍能后台完成，固定options不改写（有目标=%s）',
  (withTarget) => {
    const state = {
      ...boneState(['prefix1']),
      pendingDesecration: {
        boneId: 'preserved_rib' as const,
        kind: 'suffix' as const,
        options: ['suffix1', 'suffix2', 'suffix3'],
      },
    }
    render(<RehearsalPanel catalog={boneCatalog()} initialState={state} translations={{}} />)
    if (withTarget) addTarget('prefix1')
    expect(screen.queryByText('所有目标组均已达成，可停止当前路线。')).toBeNull()
    expect(screen.getByText(/当前仍有未揭示亵渎/)).toBeDefined()
    expect((screen.getByRole('button', { name: '崇高石' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    firstStep()
    expect(screen.getByLabelText('骨骼待应用结果')).toBeDefined()
    apply()
    expect(screen.queryByText('未揭示亵渎后缀')).toBeNull()
    expect(state.pendingDesecration.options).toEqual(['suffix1', 'suffix2', 'suffix3'])
  },
)
it('固定无目标选项仅称完成揭示，建议入口预览沿真实boneDraft', () => {
  const state = {
    ...boneState(),
    pendingDesecration: {
      boneId: 'preserved_rib' as const,
      kind: 'suffix' as const,
      options: ['suffix1', 'suffix2', 'suffix3'],
    },
  }
  render(<RehearsalPanel catalog={boneCatalog()} initialState={state} translations={{}} />)
  addTarget()
  expect(screen.getAllByText('此项用于完成揭示，不代表推进缺失目标。')).toHaveLength(3)
  expect(screen.queryByRole('button', { name: /预览骨骼建议：完成亵渎揭示 exclusive1/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '预览骨骼建议：完成亵渎揭示 suffix1' }))
  expect(screen.getByLabelText('骨骼待应用结果')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '取消骨骼步骤' }))
  expect(screen.getByText('尚未消耗通货')).toBeDefined()
  expect(screen.getByRole('heading', { name: '已固定三项候选' })).toBeDefined()
})
it('中文导入腰带联合固有与专属目标，完成后保存真实来源', () => {
  const catalog = beltCatalog()
  const source = beltSource('zh-CN', '2(1-2)', 80)
  const parsed = parseItem(source.item.rawText.replace('稀有度: 普通', '稀有度: 稀有'))
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, source.dictionary)
  render(
    <CraftEntry
      catalog={catalog}
      base={required(catalog.bases[0])}
      itemLevel={80}
      imported={{ baseId: 'Synthetic Base', item: parsed.item, mods: inspection.mods }}
      translations={{}}
      translateLine={undefined}
      dictionary={source.dictionary}
      onRestore={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '从当前装备开始' }))
  addTarget()
  fireEvent.change(screen.getByLabelText('固有属性 1 · 数值 1 下限'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: '保存固有属性 1 条件' }))
  expect(screen.getByText('已达成 1 / 2')).toBeDefined()
  for (let i = 0; i < 3; i++) {
    firstStep()
    apply()
  }
  expect(screen.getByText('已达成 2 / 2')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(saved().initialState.sourceText).toBe(parsed.item.rawText)
  expect(parseTargetCraftProject(JSON.stringify(saved()), catalog, source.dictionary).ok).toBe(true)
  expect(saved().targetImplicitValues).toEqual([{ lineIndex: 0, bounds: [{ index: 0, min: 2 }] }])
  expect(
    saved().operations.filter((op: { kind?: string }) => op.kind === 'desecrate'),
  ).toHaveLength(1)
})

it('满六建议展示本工具可演练移除池目标风险，指定安全结果不冒称保底', () => {
  render(
    <RehearsalPanel
      catalog={boneCatalog()}
      initialState={boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])}
      translations={{}}
    />,
  )
  addTarget('prefix1')
  addTarget('exclusive1')
  expect(screen.getAllByText(/本工具可演练移除池内的目标风险：prefix1/).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/指定安全结果不代表随机安全/).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/满六组，本次指定移除/).length).toBeGreaterThan(0)
})
it('搜索重开起点清除未应用骨骼与旧路线目标', () => {
  const catalog = boneCatalog()
  render(
    <CraftEntry
      catalog={catalog}
      base={required(catalog.bases[0])}
      itemLevel={64}
      imported={undefined}
      translations={{}}
      translateLine={undefined}
      dictionary={undefined}
      onRestore={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  addTarget()
  for (let i = 0; i < 2; i++) {
    firstStep()
    apply()
  }
  firstStep()
  expect(screen.getByLabelText('骨骼待应用结果')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  expect(screen.queryByLabelText('骨骼待应用结果')).toBeNull()
  expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
  expect(screen.queryByRole('button', { name: '移除目标 exclusive1' })).toBeNull()
  expect(screen.getByText('尚未消耗通货')).toBeDefined()
})
