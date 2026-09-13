import type {
  CraftCatalog,
  CraftResult,
  CraftState,
  CraftTargetRoutes,
} from '@poe2-tools/item-core'
import { BONE_RULES, planCraftTargetRoutes } from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { TargetRoutesPanel } from './TargetRoutesPanel'

const pending = vi.hoisted(() => ({
  calls: [] as {
    args: unknown[]
    callback: (result: CraftResult<CraftTargetRoutes>) => void
    cancel: ReturnType<typeof vi.fn>
  }[],
}))
vi.mock('./targetRoutesWorkerClient', () => ({
  requestTargetRoutes: (
    args: unknown[],
    callback: (result: CraftResult<CraftTargetRoutes>) => void,
  ) => {
    const cancel = vi.fn()
    pending.calls.push({ args, callback, cancel })
    return cancel
  },
}))
const base = {
  id: 'Iron Helmet',
  name: 'Iron Helmet',
  type: 'Helmet',
  tags: ['default', 'helmet'],
  requirements: { Level: 1 },
  properties: { Armour: 18 },
  implicit: null,
  implicitTags: [],
  sourceQuality: 20,
  socketLimit: 2,
  hidden: false,
  runeforged: false,
}

const modifiers = [
  ['ArmourA', 'prefix', 'ArmourAGroup', 'Sturdy', '+(10-20) to Armour'],
  ['ArmourB', 'prefix', 'ArmourBGroup', 'Strong', '+(21-30) to Armour'],
  ['Life', 'prefix', 'LifeGroup', 'Healthy', '+(10-15) to maximum Life'],
  ['Fire', 'suffix', 'FireGroup', 'of Embers', '+(10-15)% to Fire Resistance'],
  ['Cold', 'suffix', 'ColdGroup', 'of Frost', '+(10-15)% to Cold Resistance'],
  ['Dexterity', 'suffix', 'DexterityGroup', 'of Skill', '+(5-10) to Dexterity'],
].map(([id, kind, group, name, line]) => ({
  id: id as string,
  kind: kind as 'prefix' | 'suffix',
  name: name as string,
  group: group as string,
  level: 1,
  lines: [line as string],
  statOrder: [1],
  tags: [],
  addsTags: [],
  eligibility: [{ tag: 'default', value: 1 as const }],
  tradeHashes: {},
}))

const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '2026-09-12T00:00:00.000Z',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
  bases: [base],
  modifiers,
}

function state(
  rarity: CraftState['rarity'] = 'normal',
  affixes: CraftState['affixes'] = [],
): CraftState {
  return { baseId: base.id, itemLevel: 80, rarity, affixes, sourceText: null }
}

const result: CraftResult<CraftTargetRoutes> = {
  ok: true,
  value: {
    alreadyMatched: false,
    truncated: false,
    examinedStates: 1,
    candidateApplications: 1,
    routes: [
      {
        finalState: state('magic'),
        steps: [
          {
            operation: { currency: 'transmutation', modIds: ['Life'] },
            state: state('magic'),
            matchedTargetIds: ['Life'],
            gainedTargetIds: ['Life'],
            lostTargetIds: [],
            atRiskTargetIds: [],
            rerolledTargetIds: [],
          },
        ],
      },
    ],
  },
}
const props = {
  catalog,
  state: state(),
  ids: ['Life'],
  values: [],
  alternatives: [],
  busy: false,
  translations: {},
  onPreview: vi.fn(),
}
afterEach(cleanup)
beforeEach(() => {
  pending.calls.length = 0
  props.onPreview.mockClear()
})
describe('路线按需计算生命周期', () => {
  it('输入改变取消旧请求，迟到结果不显示；卸载也取消', () => {
    const view = render(<TargetRoutesPanel {...props} />)
    expect(pending.calls).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
    view.rerender(<TargetRoutesPanel {...props} ids={['Fire']} />)
    expect(pending.calls[0]?.cancel).toHaveBeenCalled()
    act(() => pending.calls[0]?.callback(result))
    expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
    view.unmount()
    expect(pending.calls[1]?.cancel).toHaveBeenCalled()
  })
  it('显式取消忽略结果，busy阻止预览，保护切换清空结果', () => {
    const view = render(<TargetRoutesPanel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
    fireEvent.click(screen.getByRole('button', { name: '取消路线计算' }))
    act(() => pending.calls[0]?.callback(result))
    expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
    act(() => pending.calls[1]?.callback(result))
    view.rerender(<TargetRoutesPanel {...props} busy />)
    expect(
      (screen.getByRole('button', { name: '预览路线第一步' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '预览路线第一步' }))
    expect(props.onPreview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: '保留当前已达成目标' }))
    expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
  })
  it('关闭保护后状态变化只失效缓存，后续请求仍保留关闭偏好', () => {
    const view = render(<TargetRoutesPanel {...props} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '保留当前已达成目标' }))
    fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
    view.rerender(<TargetRoutesPanel {...props} state={state('magic')} />)
    expect(
      (screen.getByRole('checkbox', { name: '保留当前已达成目标' }) as HTMLInputElement).checked,
    ).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
    expect(pending.calls[1]?.args[5]).toEqual({ preserveMatched: false })
  })
})

it('仅固有请求位于第7参数，条件改变取消任务并丢弃迟到结果', () => {
  const implicitValues = [{ lineIndex: 0, bounds: [{ index: 0, min: 2 }] }]
  const view = render(<TargetRoutesPanel {...props} ids={[]} implicitValues={implicitValues} />)
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(pending.calls[0]?.args[6]).toEqual(implicitValues)
  view.rerender(
    <TargetRoutesPanel
      {...props}
      ids={[]}
      implicitValues={[{ lineIndex: 0, bounds: [{ index: 0, min: 3 }] }]}
    />,
  )
  expect(pending.calls[0]?.cancel).toHaveBeenCalled()
  act(() => pending.calls[0]?.callback(result))
  expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(pending.calls[1]?.args[6]).toEqual([{ lineIndex: 0, bounds: [{ index: 0, min: 3 }] }])
})

it.each([0, 1, 2])('骨骼路线预计材料仅计真实消耗，起始阶段%s', (startIndex) => {
  const catalog = boneCatalog()
  const initial = boneState()
  const planned = planCraftTargetRoutes(catalog, initial, ['exclusive1'])
  if (!planned.ok) throw new Error(planned.error)
  const route = planned.value.routes[0]
  if (!route) throw new Error('缺少合成路线')
  expect(route.steps).toHaveLength(3)
  const first = route.steps[0]?.operation
  if (!first || !('kind' in first) || first.kind !== 'desecrate') throw new Error('缺少骨骼操作')
  render(
    <TargetRoutesPanel
      {...props}
      catalog={catalog}
      state={startIndex === 0 ? initial : (route.steps[startIndex - 1]?.state ?? initial)}
      ids={['exclusive1']}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  act(() =>
    pending.calls[0]?.callback({
      ok: true,
      value: { ...planned.value, routes: [{ ...route, steps: route.steps.slice(startIndex) }] },
    }),
  )
  const expected = startIndex === 0 ? `${BONE_RULES[first.boneId].name} × 1` : '无需新增材料'
  expect(screen.getByText(`预计材料：${expected}。预览不计入实际历史。`)).toBeDefined()
  expect(screen.queryByText(/固定三项亵渎候选 × 1/)).toBeNull()
  expect(screen.queryByText(/完成亵渎揭示 × 1/)).toBeNull()
})
