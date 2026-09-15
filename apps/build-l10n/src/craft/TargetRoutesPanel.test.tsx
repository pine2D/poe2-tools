import type {
  CraftCatalog,
  CraftResult,
  CraftState,
  CraftTargetRoutes,
} from '@poe2-tools/item-core'
import {
  applyCraftStep,
  BONE_RULES,
  enableCraftAffixIdentity,
  planCraftTargetRoutes,
} from '@poe2-tools/item-core'
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

it('路线明细区分同类型的旧实例移除与新实例生成', () => {
  const enabled = enableCraftAffixIdentity(
    catalog,
    state('rare', [{ modId: 'Life', lines: ['+10(10-15) to maximum Life'] }]),
  )
  if (!enabled.ok) throw Error(enabled.error)
  const operation = {
    currency: 'chaos',
    modIds: ['Life'],
    removeModId: 'Life',
    removeAffixId: 'a1',
    rolls: [{ modId: 'Life', affixId: 'a2', values: [15] }],
  } as const
  const step = {
    ...operation,
    modIds: [...operation.modIds],
    rolls: operation.rolls.map((roll) => ({ ...roll, values: [...roll.values] })),
  }
  const applied = applyCraftStep(catalog, enabled.value, step)
  if (!applied.ok) throw Error(applied.error)
  render(
    <TargetRoutesPanel
      {...props}
      state={enabled.value}
      ids={['Life']}
      values={[{ modId: 'Life', bounds: [{ index: 0, min: 15 }] }]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  act(() =>
    pending.calls[0]?.callback({
      ok: true,
      value: {
        alreadyMatched: false,
        truncated: false,
        examinedStates: 2,
        candidateApplications: 1,
        routes: [
          {
            finalState: applied.value,
            steps: [
              {
                operation: step,
                state: applied.value,
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
    }),
  )
  expect(screen.getByText(/移除：\+10\(10-15\) to maximum Life/)).toBeDefined()
  expect(screen.getByText(/得到 \/ 更新：\+15\(10-15\) to maximum Life/)).toBeDefined()
})

it('改变破裂目标终止旧搜索，传递第八参并丢弃迟到路线', () => {
  const props = {
    catalog: boneCatalog('Ring'),
    state: boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2']),
    ids: ['prefix1', 'suffix1'],
    values: [],
    alternatives: [],
    busy: false,
    translations: {},
    onPreview: vi.fn(),
  }
  const view = render(<TargetRoutesPanel {...props} targetFracturedModId="prefix1" />)
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  const first = pending.calls.at(-1)
  if (!first) throw new Error('未创建搜索')
  expect(first.args[7]).toBe('prefix1')
  view.rerender(<TargetRoutesPanel {...props} targetFracturedModId="suffix1" />)
  expect(first.cancel).toHaveBeenCalledTimes(1)
  act(() => first.callback(result))
  expect(screen.queryByText(/找到 .*条全部目标达成/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(pending.calls.at(-1)?.args[7]).toBe('suffix1')
})
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
it('祝福路线说明保留显式数值，不显示普通神圣的显式重掷风险', () => {
  const blessed = structuredClone(result)
  if (!blessed.ok) throw new Error('缺少路线')
  const step = blessed.value.routes[0]?.steps[0]
  if (!step) throw new Error('缺少步骤')
  step.operation = { currency: 'divine', omen: 'blessed', modIds: [], implicitValues: [15] }
  render(<TargetRoutesPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  act(() => pending.calls[0]?.callback(blessed))
  expect(screen.getByText(/显式词缀及其数值保持不变/)).toBeDefined()
  expect(screen.queryByText(/神圣会随机重掷未破裂显式与固有数值/)).toBeNull()
})
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

it('费用优先需要报价，改价终止旧搜索并拒绝迟到结果，清价恢复默认搜索', () => {
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
  const view = render(<TargetRoutesPanel {...props} />)
  expect(
    (screen.getByRole('checkbox', { name: '按自填报价优先搜索' }) as HTMLInputElement).disabled,
  ).toBe(true)
  const pricing = { unit: 'divine' as const, prices: { 'currency:transmutation': 0.1 } }
  view.rerender(<TargetRoutesPanel {...props} pricing={pricing} />)
  fireEvent.click(screen.getByRole('checkbox', { name: '按自填报价优先搜索' }))
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  const first = pending.calls.at(-1)
  if (!first) throw Error('没有任务')
  expect(first.args[5]).toMatchObject({ pricing })
  const repriced = { ...pricing, prices: { 'currency:transmutation': 0.2 } }
  view.rerender(<TargetRoutesPanel {...props} pricing={repriced} />)
  expect(first.cancel).toHaveBeenCalledTimes(1)
  act(() => first.callback(result))
  expect(screen.queryByText(/找到 .*条全部目标达成/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(pending.calls.at(-1)?.args[5]).toMatchObject({ pricing: repriced })
  view.rerender(<TargetRoutesPanel {...props} />)
  expect(
    (screen.getByRole('checkbox', { name: '按自填报价优先搜索' }) as HTMLInputElement).checked,
  ).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(pending.calls.at(-1)?.args[5]).not.toHaveProperty('pricing')
})

it('仅修改数量条件终止旧 Worker，迟到的全部模式结果不能覆盖新条件', () => {
  const view = render(<TargetRoutesPanel {...props} minimumTargetCount={1} />)
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  const first = pending.calls.at(-1)
  if (!first) throw new Error('没有旧搜索')
  expect(first.args[5]).toMatchObject({ minimumTargetCount: 1 })
  view.rerender(<TargetRoutesPanel {...props} />)
  expect(first.cancel).toHaveBeenCalledTimes(1)
  act(() => first.callback(result))
  expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(pending.calls.at(-1)?.args[5]).not.toHaveProperty('minimumTargetCount')
})
