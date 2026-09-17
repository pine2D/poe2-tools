import type {
  CraftCatalog,
  CraftDefinitionRoutes,
  CraftResult,
  CraftState,
  CraftTargetDefinitions,
} from '@poe2-tools/item-core'
import {
  applyCraftStep,
  BONE_RULES,
  enableCraftAffixIdentity,
  FLUXES,
  planTargetDefinitionRoutes,
} from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { TargetRoutesPanel } from './TargetRoutesPanel'

function definitions(ids: string[]): CraftTargetDefinitions {
  return {
    nextTargetId: 40,
    targets: ids.map((modId, i) => ({ targetId: `t${27 + i}`, modId })),
    values: [],
    alternatives: [],
  }
}

const pending = vi.hoisted(() => ({
  calls: [] as {
    args: unknown[]
    callback: (result: CraftResult<CraftDefinitionRoutes>) => void
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
      definitions={{
        ...definitions(['Life']),
        values: [{ targetId: 't27', modId: 'Life', bounds: [{ index: 0, min: 15 }] }],
      }}
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
                matchedTargetIds: ['t27'],
                gainedTargetIds: ['t27'],
                lostTargetIds: [],
                atRiskTargetIds: [],
                rerolledTargetIds: [],
                affectedModIds: [],
                atRiskModIds: [],
                rerolledModIds: [],
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

it('改变破裂目标终止旧搜索，传递完整定义并丢弃迟到路线', () => {
  const props = {
    catalog: boneCatalog('Ring'),
    state: boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2']),
    definitions: definitions(['prefix1', 'suffix1']),
    busy: false,
    translations: {},
    onPreview: vi.fn(),
  }
  const view = render(
    <TargetRoutesPanel
      {...props}
      definitions={{ ...props.definitions, fracturedTargetId: 't27' }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  const first = pending.calls.at(-1)
  if (!first) throw new Error('未创建搜索')
  expect(first.args[2]).toMatchObject({ fracturedTargetId: 't27' })
  view.rerender(
    <TargetRoutesPanel
      {...props}
      definitions={{ ...props.definitions, fracturedTargetId: 't28' }}
    />,
  )
  expect(first.cancel).toHaveBeenCalledTimes(1)
  act(() => first.callback(result))
  expect(screen.queryByText(/找到 .*条全部目标达成/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(pending.calls.at(-1)?.args[2]).toMatchObject({ fracturedTargetId: 't28' })
})
vi.mock('./targetRoutesWorkerClient', () => ({
  requestTargetRoutes: (
    args: unknown[],
    callback: (result: CraftResult<CraftDefinitionRoutes>) => void,
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

const result: CraftResult<CraftDefinitionRoutes> = {
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
            matchedTargetIds: ['t27'],
            gainedTargetIds: ['t27'],
            lostTargetIds: [],
            atRiskTargetIds: [],
            rerolledTargetIds: [],
            affectedModIds: [],
            atRiskModIds: [],
            rerolledModIds: [],
          },
        ],
      },
    ],
  },
}
const props = {
  catalog,
  state: state(),
  definitions: definitions(['Life']),
  busy: false,
  translations: {},
  onPreview: vi.fn(),
}
afterEach(cleanup)
it('面板路线中的防具锻造显示实际操作名称', () => {
  const forged = structuredClone(result)
  if (!forged.ok || !forged.value.routes[0]?.steps[0]) throw Error('缺少路线')
  forged.value.routes[0].steps[0].operation = {
    kind: 'runeforge',
    fromBaseId: base.id,
    toBaseId: 'Forged Helmet',
  }
  render(<TargetRoutesPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  act(() => pending.calls[0]?.callback(forged))
  expect(screen.getByText('符文锻造')).toBeTruthy()
})
it('面板路线中的溶剂使用材料译名', () => {
  const flux = FLUXES[0]
  if (!flux) throw Error('缺少溶剂')
  const converted = structuredClone(result)
  if (!converted.ok || !converted.value.routes[0]?.steps[0]) throw Error('缺少路线')
  converted.value.routes[0].steps[0].operation = { kind: 'flux', fluxId: flux.id, rolls: [] }
  render(<TargetRoutesPanel {...props} translations={{ [flux.name]: '测试溶剂译名' }} />)
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  act(() => pending.calls[0]?.callback(converted))
  expect(screen.getByText('测试溶剂译名')).toBeTruthy()
})
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
it('纯面板路线传递完整条件并展示逐步数值，编辑条件后丢弃迟到结果', () => {
  const goals: CraftTargetDefinitions = {
    ...definitions([]),
    panelGoals: [{ kind: 'item-property', property: 'Armour', min: 18 }],
  }
  const start = { ...state(), quality: 0, sockets: [] }
  const view = render(<TargetRoutesPanel {...props} state={start} definitions={goals} />)
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  const first = pending.calls[0]
  expect(first?.args[2]).toEqual(goals)
  const panelResult = structuredClone(result)
  if (!panelResult.ok) throw Error('缺少路线')
  const route = panelResult.value.routes[0]
  if (!route?.steps[0]) throw Error('缺少步骤')
  route.steps[0].state = { ...route.steps[0].state, quality: 0, sockets: [] }
  act(() => first?.callback(panelResult))
  expect(screen.getByText('找到 1 条满足面板条件与其他目标的示例路线。')).toBeTruthy()
  expect(screen.getByText(/面板条件 1 · 护甲：18 · 已达成/)).toBeTruthy()
  expect(screen.queryByText('未设置制作目标；本路线用于完成揭示。')).toBeNull()
  view.rerender(
    <TargetRoutesPanel
      {...props}
      state={start}
      definitions={{
        ...goals,
        panelGoals: [{ kind: 'item-property', property: 'Armour', min: 100 }],
      }}
    />,
  )
  act(() => first?.callback(panelResult))
  expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
})
describe('路线按需计算生命周期', () => {
  it('输入改变取消旧请求，迟到结果不显示；卸载也取消', () => {
    const view = render(<TargetRoutesPanel {...props} />)
    expect(pending.calls).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
    view.rerender(<TargetRoutesPanel {...props} definitions={definitions(['Fire'])} />)
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
    expect(pending.calls[1]?.args[3]).toEqual({ preserveMatched: false })
  })
})

it('仅固有请求位于第5参数，条件改变取消任务并丢弃迟到结果', () => {
  const implicitValues = [{ lineIndex: 0, bounds: [{ index: 0, min: 2 }] }]
  const view = render(
    <TargetRoutesPanel {...props} definitions={definitions([])} implicitValues={implicitValues} />,
  )
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(pending.calls[0]?.args[4]).toEqual(implicitValues)
  view.rerender(
    <TargetRoutesPanel
      {...props}
      definitions={definitions([])}
      implicitValues={[{ lineIndex: 0, bounds: [{ index: 0, min: 3 }] }]}
    />,
  )
  expect(pending.calls[0]?.cancel).toHaveBeenCalled()
  act(() => pending.calls[0]?.callback(result))
  expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(pending.calls[1]?.args[4]).toEqual([{ lineIndex: 0, bounds: [{ index: 0, min: 3 }] }])
})

it.each([0, 1, 2])('骨骼路线预计材料仅计真实消耗，起始阶段%s', (startIndex) => {
  const catalog = boneCatalog()
  const initial = boneState()
  const planned = planTargetDefinitionRoutes(catalog, initial, definitions(['exclusive1']))
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
      definitions={definitions(['exclusive1'])}
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
    definitions: definitions(['Life']),
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
  expect(first.args[3]).toMatchObject({ pricing })
  const repriced = { ...pricing, prices: { 'currency:transmutation': 0.2 } }
  view.rerender(<TargetRoutesPanel {...props} pricing={repriced} />)
  expect(first.cancel).toHaveBeenCalledTimes(1)
  act(() => first.callback(result))
  expect(screen.queryByText(/找到 .*条全部目标达成/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(pending.calls.at(-1)?.args[3]).toMatchObject({ pricing: repriced })
  view.rerender(<TargetRoutesPanel {...props} />)
  expect(
    (screen.getByRole('checkbox', { name: '按自填报价优先搜索' }) as HTMLInputElement).checked,
  ).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(pending.calls.at(-1)?.args[3]).not.toHaveProperty('pricing')
})

it('仅修改数量条件终止旧 Worker，迟到的全部模式结果不能覆盖新条件', () => {
  const view = render(
    <TargetRoutesPanel {...props} definitions={{ ...props.definitions, minimumTargetCount: 1 }} />,
  )
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  const first = pending.calls.at(-1)
  if (!first) throw new Error('没有旧搜索')
  expect(first.args[2]).toMatchObject({ minimumTargetCount: 1 })
  view.rerender(<TargetRoutesPanel {...props} />)
  expect(first.cancel).toHaveBeenCalledTimes(1)
  act(() => first.callback(result))
  expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(pending.calls.at(-1)?.args[2]).not.toHaveProperty('minimumTargetCount')
})

it('删除再加同一类型分配新目标身份，旧 Worker 必须取消且结果不复活', () => {
  const view = render(<TargetRoutesPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  const first = pending.calls.at(-1)
  if (!first) throw Error('缺少请求')
  const replacement = {
    ...props.definitions,
    nextTargetId: 41,
    targets: [{ targetId: 't40', modId: 'Life' }],
  }
  view.rerender(<TargetRoutesPanel {...props} definitions={replacement} />)
  expect(first.cancel).toHaveBeenCalledTimes(1)
  act(() => first.callback(result))
  expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect(pending.calls.at(-1)?.args[2]).toEqual(replacement)
})

it('随机移除风险保留实际接受档位，目标失配说明独立使用目标定义', () => {
  const source = {
    ...catalog,
    modifiers: catalog.modifiers.map((mod) =>
      mod.id === 'ArmourB' ? { ...mod, group: 'ArmourAGroup' } : mod,
    ),
  }
  const current = state('rare', [{ modId: 'ArmourB', lines: ['+25 to Armour'] }])
  const config = {
    ...definitions(['ArmourA']),
    alternatives: [{ targetId: 't27', modIds: ['ArmourB'] }],
  }
  const planned = structuredClone(result)
  if (!planned.ok) throw Error('缺少路线')
  const step = planned.value.routes[0]?.steps[0]
  if (!step) throw Error('缺少步骤')
  step.atRiskTargetIds = ['t27']
  step.atRiskModIds = ['ArmourB']
  step.lostTargetIds = ['t27']
  render(<TargetRoutesPanel {...props} catalog={source} state={current} definitions={config} />)
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  act(() => pending.calls[0]?.callback(planned))
  expect(screen.getByText(/整个合法随机移除池内的目标风险：Strong/)).toBeDefined()
  expect(screen.getByText(/指定结果丢失目标身份或数值条件：Sturdy/)).toBeDefined()
})

it('容量上下文传入路线任务，来源变化终止旧任务且丢弃迟到结果', () => {
  const capacityContext = { ...props.state, sockets: [null] }
  const view = render(<TargetRoutesPanel {...props} capacityContext={capacityContext} />)
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  const first = pending.calls.at(-1)
  expect(first?.args[5]).toEqual(capacityContext)
  view.rerender(
    <TargetRoutesPanel {...props} capacityContext={{ ...capacityContext, sockets: [] }} />,
  )
  expect(first?.cancel).toHaveBeenCalledTimes(1)
  act(() => first?.callback(result))
  expect(screen.queryByText(/找到 .*条全部目标达成/)).toBeNull()
})
