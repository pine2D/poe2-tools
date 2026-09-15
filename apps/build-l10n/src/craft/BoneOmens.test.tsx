import type { BoneCraftOperation, CraftStep } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { BoneAdvicePanel } from './BoneAdvicePanel'
import { BoneCraftPanel } from './BoneCraftPanel'
import { CraftComparisonPanel } from './CraftComparisonPanel'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'
import { TargetRoutesPanel } from './TargetRoutesPanel'

const translations = {
  'Preserved Collarbone': '保存完好的锁骨',
  'Omen of Sinistral Necromancy': '左旋死灵预兆',
  'Omen of Dextral Necromancy': '右旋死灵预兆',
  'Omen of the Liege': '领主预兆',
  'Omen of the Sovereign': '至高预兆',
  'Omen of the Blackblooded': '黑血预兆',
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
it('两类预兆独立选择，配置变化清除侧与移除结果，预览固化精确字段', () => {
  const onPreview = vi.fn()
  render(
    <BoneCraftPanel
      definitions={{ nextTargetId: 1, targets: [], alternatives: [], values: [] }}
      catalog={boneCatalog('Ring')}
      state={boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])}
      translations={translations}
      disabled={false}
      onPreview={onPreview}
    />,
  )
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_collarbone' } })
  fireEvent.change(screen.getByLabelText('骨骼方向预兆'), {
    target: { value: 'dextral_necromancy' },
  })
  fireEvent.click(screen.getByLabelText('骨骼移除 suffix1'))
  fireEvent.change(screen.getByLabelText('骨骼巫妖预兆'), { target: { value: 'liege' } })
  expect((screen.getByLabelText('骨骼移除 suffix1') as HTMLInputElement).checked).toBe(false)
  expect((screen.getByRole('button', { name: '预览骨骼结果' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  fireEvent.click(screen.getByLabelText('骨骼移除 suffix1'))
  fireEvent.click(screen.getByRole('button', { name: '预览骨骼结果' }))
  expect(onPreview).toHaveBeenCalledWith({
    kind: 'desecrate',
    boneId: 'preserved_collarbone',
    affixKind: 'suffix',
    removeModId: 'suffix1',
    directionOmen: 'dextral_necromancy',
    lichOmen: 'liege',
  })
  expect(screen.getByText(/不代表其他游戏结果不可能/)).toBeDefined()
})

const forced = vi.hoisted(() => ({ operations: [] as CraftStep[] }))
vi.mock('./targetRoutesWorkerClient', async () => {
  const { applyCraftStep, planTargetDefinitionRoutes } = await import('@poe2-tools/item-core')
  return {
    requestTargetRoutes: (
      args: Parameters<typeof planTargetDefinitionRoutes>,
      callback: (value: ReturnType<typeof planTargetDefinitionRoutes>) => void,
    ) => {
      if (!forced.operations.length) {
        callback(planTargetDefinitionRoutes(...args))
        return () => {}
      }
      let state = args[1]
      const steps = forced.operations.map((operation) => {
        const next = applyCraftStep(args[0], state, operation)
        if (!next.ok) throw new Error(next.error)
        state = next.value
        return {
          operation,
          state,
          matchedTargetIds: [],
          gainedTargetIds: [],
          lostTargetIds: [],
          atRiskTargetIds: [],
          rerolledTargetIds: [],
          affectedModIds: [],
          atRiskModIds: [],
          rerolledModIds: [],
        }
      })
      callback({
        ok: true,
        value: {
          routes: [{ steps, finalState: state }],
          examinedStates: steps.length,
          candidateApplications: steps.length,
          truncated: false,
          alreadyMatched: false,
        },
      })
      return () => {}
    },
  }
})
afterEach(() => {
  forced.operations = []
})
const double: BoneCraftOperation = {
  kind: 'desecrate',
  boneId: 'preserved_collarbone',
  affixKind: 'suffix',
  directionOmen: 'dextral_necromancy',
  lichOmen: 'liege',
}
const applyBone = () => fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
function selectDouble() {
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_collarbone' } })
  fireEvent.change(screen.getByLabelText('骨骼方向预兆'), {
    target: { value: 'dextral_necromancy' },
  })
  fireEvent.change(screen.getByLabelText('骨骼巫妖预兆'), { target: { value: 'liege' } })
  fireEvent.click(screen.getByLabelText('占用后缀'))
  fireEvent.click(screen.getByRole('button', { name: '预览骨骼结果' }))
}
it('双预兆只在骨骼应用各计一份，保存恢复pending、取消与撤销重做不丢配置', () => {
  const { sockets: _, ...initial } = boneState()
  render(
    <RehearsalPanel
      catalog={boneCatalog('Ring')}
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
  selectDouble()
  expect(screen.queryByText('右旋死灵预兆 × 1')).toBeNull()
  expect(
    within(screen.getByLabelText('骨骼待应用结果')).getByRole('heading', {
      name: /右旋死灵预兆.*领主预兆/,
    }),
  ).toBeDefined()
  expect((screen.getByLabelText('骨骼方向预兆') as HTMLSelectElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '取消骨骼步骤' }))
  expect((screen.getByLabelText('骨骼巫妖预兆') as HTMLSelectElement).value).toBe('')
  selectDouble()
  applyBone()
  for (const name of ['保存完好的锁骨', '右旋死灵预兆', '领主预兆'])
    expect(screen.getByText(`${name} × 1`)).toBeDefined()
  expect(screen.queryByLabelText('骨骼巫妖预兆')).toBeNull()
  expect(screen.getByText(/已固化骨骼预兆：右旋死灵预兆、领主预兆/)).toBeDefined()
  for (const id of ['exclusive1', 'exclusive2', 'exclusive3'])
    fireEvent.click(screen.getByLabelText(`候选 ${id}`))
  fireEvent.click(screen.getByRole('button', { name: '预览三项候选' }))
  applyBone()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.schemaVersion).toBe(1)
  expect(saved.operations[1]).toEqual(double)
  fireEvent.click(screen.getByRole('button', { name: '选择揭示 exclusive2' }))
  fireEvent.click(screen.getByRole('button', { name: '预览揭示结果' }))
  applyBone()
  expect(screen.getByText('领主预兆 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByRole('heading', { name: '已固定三项候选' })).toBeDefined()
  expect(screen.getByText(/已固化骨骼预兆：右旋死灵预兆、领主预兆/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.queryByText('领主预兆 × 1')).toBeNull()
  expect((screen.getByLabelText('骨骼方向预兆') as HTMLSelectElement).value).toBe('')
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(screen.getByText('领主预兆 × 1')).toBeDefined()
  expect(
    within(screen.getByLabelText('演练历史')).getAllByText(/右旋死灵预兆.*领主预兆/).length,
  ).toBeGreaterThan(0)
})
it('骨骼建议及路线展示双预兆，三阶段预计材料各一份且offer/reveal免费', () => {
  const catalog = boneCatalog('Ring')
  const state = boneState()
  const preview = vi.fn()
  const advice = render(
    <BoneAdvicePanel
      catalog={catalog}
      state={state}
      definitions={{
        nextTargetId: 2,
        targets: [{ targetId: 't1', modId: 'exclusive1' }],
        alternatives: [],
        values: [],
      }}
      steps={[
        {
          operation: double,
          targetModIds: ['exclusive1'],
          targetIds: ['t1'],
          matchedTargetIds: [],
          gainedTargetIds: [],
          affectedModIds: [],
          atRiskModIds: [],
          atRiskTargetIds: [],
          lostTargetIds: [],
          randomRemovalRisk: false,
        },
      ]}
      translations={translations}
      busy={false}
      onPreview={preview}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /预览骨骼建议：.*右旋死灵预兆.*领主预兆/ }))
  expect(preview).toHaveBeenCalledWith(double)
  advice.unmount()
  forced.operations = [
    double,
    { kind: 'desecration-offer', modIds: ['exclusive1', 'exclusive2', 'exclusive3'] },
    { kind: 'desecration-reveal', modId: 'exclusive1', values: [5] },
  ]
  render(
    <TargetRoutesPanel
      catalog={catalog}
      state={state}
      definitions={{
        nextTargetId: 2,
        targets: [{ targetId: 't1', modId: 'exclusive1' }],
        alternatives: [],
        values: [],
      }}
      busy={false}
      translations={translations}
      onPreview={preview}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(
    screen.getByText(
      '预计材料：保存完好的锁骨 × 1、右旋死灵预兆 × 1、领主预兆 × 1。预览不计入实际历史。',
    ),
  ).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '预览路线第一步' }))
  expect(preview).toHaveBeenLastCalledWith(double)
})

it('切换预兆即时显示选中材料不可用原因，部位限制及不足三项不冒称游戏禁止', () => {
  const catalog = boneCatalog('Ring')
  render(
    <BoneCraftPanel
      definitions={{ nextTargetId: 1, targets: [], alternatives: [], values: [] }}
      catalog={catalog}
      state={boneState()}
      translations={translations}
      disabled={false}
      onPreview={vi.fn()}
    />,
  )
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_collarbone' } })
  fireEvent.click(screen.getByLabelText('占用后缀'))
  fireEvent.change(screen.getByLabelText('骨骼巫妖预兆'), { target: { value: 'sovereign' } })
  expect((screen.getByLabelText('骨骼材料') as HTMLSelectElement).value).toBe(
    'preserved_collarbone',
  )
  expect(screen.getByRole('status').textContent).toContain('本工具暂不支持不足三项的巫妖候选情形')
  expect((screen.getByRole('button', { name: '预览骨骼结果' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  fireEvent.change(screen.getByLabelText('骨骼巫妖预兆'), { target: { value: 'liege' } })
  expect(screen.getByRole('status').textContent).toContain('可用于本工具演练')
  expect((screen.getByLabelText('占用后缀') as HTMLInputElement).checked).toBe(false)
  fireEvent.change(screen.getByLabelText('骨骼方向预兆'), {
    target: { value: 'sinistral_necromancy' },
  })
  expect(screen.getByRole('status').textContent).toContain('本工具暂不支持不足三项')
  cleanup()
  render(
    <BoneCraftPanel
      definitions={{ nextTargetId: 1, targets: [], alternatives: [], values: [] }}
      catalog={boneCatalog()}
      state={boneState()}
      translations={translations}
      disabled={false}
      onPreview={vi.fn()}
    />,
  )
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_rib' } })
  fireEvent.change(screen.getByLabelText('骨骼巫妖预兆'), { target: { value: 'liege' } })
  expect(screen.getByRole('status').textContent).toContain('不能用于护甲骨骼')
})

it('前后比较能明确展示新增固化的两类预兆', () => {
  const pending = { boneId: 'preserved_collarbone' as const, kind: 'suffix' as const }
  render(
    <CraftComparisonPanel
      definitions={{ nextTargetId: 1, targets: [], alternatives: [], values: [] }}
      catalog={boneCatalog('Ring')}
      before={{ ...boneState(), pendingDesecration: pending }}
      after={{
        ...boneState(),
        pendingDesecration: { ...pending, directionOmen: 'dextral_necromancy', lichOmen: 'liege' },
      }}
      translations={translations}
    />,
  )
  expect(screen.getByText('预兆：右旋死灵预兆、领主预兆')).toBeDefined()
})

it('路线按材料身份区分同译名，已有双预兆pending的后两步无需新增材料', () => {
  const catalog = boneCatalog('Ring')
  const tail: CraftStep[] = [
    { kind: 'desecration-offer', modIds: ['exclusive1', 'exclusive2', 'exclusive3'] },
    { kind: 'desecration-reveal', modId: 'exclusive1', values: [5] },
  ]
  forced.operations = [double, ...tail]
  const props = {
    catalog,
    definitions: {
      nextTargetId: 2,
      targets: [{ targetId: 't1', modId: 'exclusive1' }],
      alternatives: [],
      values: [],
    },
    busy: false,
    onPreview: vi.fn(),
  }
  const first = render(
    <TargetRoutesPanel
      {...props}
      state={boneState()}
      translations={{
        ...translations,
        'Omen of Dextral Necromancy': '合成同名预兆',
        'Omen of the Liege': '合成同名预兆',
      }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(
    screen.getByText(
      '预计材料：保存完好的锁骨 × 1、合成同名预兆（Omen of Dextral Necromancy） × 1、合成同名预兆（Omen of the Liege） × 1。预览不计入实际历史。',
    ),
  ).toBeDefined()
  first.unmount()
  forced.operations = tail
  render(
    <TargetRoutesPanel
      {...props}
      state={{
        ...boneState(),
        pendingDesecration: {
          boneId: 'preserved_collarbone',
          kind: 'suffix',
          directionOmen: 'dextral_necromancy',
          lichOmen: 'liege',
        },
      }}
      translations={translations}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(screen.getByText('预计材料：无需新增材料。预览不计入实际历史。')).toBeDefined()
})
it('搜索重开起点销毁双预兆草稿并重置两个选择器', () => {
  const catalog = boneCatalog('Ring')
  const base = catalog.bases[0]
  if (!base) throw new Error('fixture')
  render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={64}
      imported={undefined}
      translations={translations}
      translateLine={undefined}
      dictionary={undefined}
      onRestore={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  fireEvent.click(screen.getByRole('button', { name: '点金石' }))
  for (const id of ['prefix1', 'prefix2', 'suffix1', 'suffix2'])
    fireEvent.click(
      within(screen.getByLabelText('本次指定结果')).getByRole('button', {
        name: new RegExp(`^${id} `),
      }),
    )
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  selectDouble()
  expect(screen.getByLabelText('骨骼待应用结果')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  expect(screen.queryByLabelText('骨骼待应用结果')).toBeNull()
  expect((screen.getByLabelText('骨骼方向预兆') as HTMLSelectElement).value).toBe('')
  expect((screen.getByLabelText('骨骼巫妖预兆') as HTMLSelectElement).value).toBe('')
  expect(screen.getByText('尚未消耗通货')).toBeDefined()
})
