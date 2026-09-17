import { readFileSync } from 'node:fs'
import {
  applyCraftStep,
  type CraftCatalog,
  type CraftResult,
  type CraftState,
  type CraftStep,
  craftCandidates,
  desecrationCandidates,
  inspectNumericLines,
  loadTargetWorkbenchProject,
  prepareCraftOperation,
  type RestoredTargetCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { BoneCraftPanel } from './BoneCraftPanel'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

interface HistoryFixture {
  initial: CraftState
  operations: CraftStep[]
  append: (step: CraftStep) => void
  current: () => CraftState
  fork: () => HistoryFixture
}
function history(
  initial: CraftState,
  operations: CraftStep[] = [],
  state = initial,
): HistoryFixture {
  const append = (step: CraftStep) => {
    state = must(applyCraftStep(catalog, state, step))
    operations.push(step)
  }
  return {
    initial,
    operations,
    append,
    current: () => state,
    fork: () => history(initial, [...operations], state),
  }
}
// 所有入口由普通空基底经真实操作生成，保存时仍会回放完整历史。
function fixture(vorana = true) {
  const initial: CraftState = {
    baseId: vorana ? 'Wicker Tiara' : "Adherent's Raiment",
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
    sockets: [null],
    nextAffixId: 1,
  }
  const data = history(initial)
  data.append({
    kind: 'socket',
    socketIndex: 0,
    augmentId: `pob2:augment:${JSON.stringify(vorana ? ["Vorana's Carnage", 'helmet'] : ["Medved's Tending", 'body armour'])}`,
  })
  for (const currency of ['transmutation', 'regal'] as const) {
    const prepared = must(prepareCraftOperation(catalog, data.current(), currency))
    const mod = craftCandidates(catalog, prepared.state, currency).find(
      (entry) => !entry.id.includes('Influence'),
    )
    if (!mod) throw Error('缺少升稀有候选')
    data.append({ currency, modIds: [mod.id] })
  }
  return data
}
const projectFixtures = new Map<string, RestoredTargetCraftProject>()
const projectKey = (data: HistoryFixture) => JSON.stringify([data.initial, data.operations])
function project(data: HistoryFixture): RestoredTargetCraftProject {
  const key = projectKey(data)
  const cached = projectFixtures.get(key)
  if (cached) return structuredClone(cached)
  const source = (path: string) =>
    catalog._meta.sources.find((entry) => entry.path === `src/Data/${path}.lua`)?.sha256
  const result = must(
    loadTargetWorkbenchProject(
      JSON.stringify({
        schemaVersion: 1,
        sourceCommit: catalog._meta.sourceCommit,
        rulesVersion: 'basic-2026-09-17-v96',
        initialState: data.initial,
        operations: data.operations,
        cursor: data.operations.length,
        augmentSourceHash: source('ModRunes'),
        desecrationSourceHash: source('ModVeiled'),
        targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
        orphanedTargets: [],
      }),
      catalog,
    ),
  )
  projectFixtures.set(key, result)
  return structuredClone(result)
}
function mount(data: ReturnType<typeof fixture>) {
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={data.initial}
      initialProject={project(data)}
      translations={{
        'Preserved Rib': '保存完好的肋骨',
        'Omen of Putrefaction': '腐烂预兆',
      }}
    />,
  )
}
function save() {
  click('保存演练到本机')
  return must(
    loadTargetWorkbenchProject(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '', catalog),
  )
}
function options(state: CraftState, preferred?: string) {
  const pool = desecrationCandidates(catalog, state)
  const first = preferred
    ? pool.find((entry) => entry.id === preferred)
    : pool.find((entry) => entry.id.startsWith('BerserkInfluence'))
  if (!first) throw Error('缺少合法揭示候选')
  return [first, ...pool.filter((entry) => entry.id !== first.id).slice(0, 2)]
}
function reveal(data: ReturnType<typeof fixture>) {
  const candidates = options(data.current())
  const selected = candidates[0]
  if (!selected) throw Error('缺少揭示结果')
  data.append({ kind: 'desecration-offer', modIds: candidates.map((entry) => entry.id) })
  data.append({
    kind: 'desecration-reveal',
    modId: selected.id,
    values: must(inspectNumericLines(selected.lines)).map((range) => range.min),
  })
}
// 缓存各槽独立快照，避免反复计算相同前置揭示池；单独运行任一场景仍可构建。
const putrefactionHistories = new Map<number, ReturnType<typeof fixture>>()
function preparedSlots(count: number): HistoryFixture {
  const cached = putrefactionHistories.get(count)
  if (cached) return cached.fork()
  const data = count === 0 ? fixture() : preparedSlots(count - 1)
  if (count === 0) data.append({ kind: 'putrefy', boneId: 'preserved_rib' })
  else reveal(data)
  putrefactionHistories.set(count, data)
  return data.fork()
}
beforeAll(() => {
  const data = preparedSlots(6)
  const complete = project(data)
  // 完整历史已经真实回放，复用其合法前缀；每次挂载仍独立克隆并接受界面自身的信任校验。
  for (let count = 0; count <= data.operations.length; count++) {
    const operations = data.operations.slice(0, count)
    const state = complete.states[count]
    if (!state) throw Error('缺少已回放的历史状态')
    projectFixtures.set(projectKey(history(data.initial, operations, state)), {
      ...complete,
      project: { ...complete.project, operations, cursor: count },
      states: complete.states.slice(0, count + 1),
    })
  }
})
function offerInUi(state: CraftState, preferred?: string) {
  const candidates = options(state, preferred)
  for (const candidate of candidates) {
    change('搜索揭示候选', candidate.id)
    fireEvent.click(screen.getByLabelText(`候选 ${candidate.id}`))
  }
  click('预览三项候选')
  click('应用骨骼步骤')
  return candidates.map((candidate) => candidate.id)
}
function revealInUi(state: CraftState, preferred?: string) {
  const candidates = offerInUi(state, preferred)
  click(`选择揭示 ${candidates[0]}`)
  click('预览揭示结果')
  click('应用骨骼步骤')
}

it('Soul 普通骨骼施加、固定与揭示可保存 v96，未核实的预兆有可见说明', () => {
  const data = fixture(false)
  mount(data)
  expect((screen.getByLabelText('使用腐烂预兆') as HTMLInputElement).disabled).toBe(true)
  expect((screen.getByLabelText('骨骼巫妖预兆') as HTMLSelectElement).disabled).toBe(true)
  expect(screen.getByText(/Uhtred、Kolr、Thrud、Medved、Katla、Vorana/)).toBeDefined()
  change('骨骼材料', 'preserved_rib')
  fireEvent.click(screen.getByLabelText('占用前缀'))
  click('预览骨骼结果')
  click('应用骨骼步骤')
  data.append({ kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'prefix' })
  expect((screen.getByLabelText('首次揭示使用深渊回响') as HTMLInputElement).disabled).toBe(true)
  revealInUi(data.current(), 'SoulInfluenceIncreasedLifeAndMana')
  const current = save()
  expect(current.project.rulesVersion).toBe('basic-2026-09-17-v96')
  expect(current.states.at(-1)?.affixes).toContainEqual(
    expect.objectContaining({ modId: 'SoulInfluenceIncreasedLifeAndMana', desecrated: true }),
  )
  expect(screen.getByText('保存完好的肋骨 × 1')).toBeDefined()
})

it('Vorana 腐烂取消不收费，应用后腐化并产生六槽', () => {
  const data = fixture()
  mount(data)
  change('骨骼材料', 'preserved_rib')
  fireEvent.click(screen.getByLabelText('使用腐烂预兆'))
  click('预览腐烂预兆结果')
  click('取消骨骼步骤')
  expect(screen.queryByText('腐烂预兆 × 1')).toBeNull()
  change('骨骼材料', 'preserved_rib')
  fireEvent.click(screen.getByLabelText('使用腐烂预兆'))
  click('预览腐烂预兆结果')
  click('应用骨骼步骤')
  expect(screen.getByText('剩余隐藏槽位：前缀 3，后缀 3。')).toBeDefined()
  const current = save()
  expect(current.project.rulesVersion).toBe('basic-2026-09-17-v96')
  expect(current.states.at(-1)).toMatchObject({ corrupted: true, affixes: [] })
  expect(screen.getByText('保存完好的肋骨 × 1')).toBeDefined()
  expect(screen.getByText('腐烂预兆 × 1')).toBeDefined()
})

it('Vorana 已勾选腐烂后切换远古肋骨，仍可取消腐烂', () => {
  render(
    <BoneCraftPanel
      catalog={catalog}
      state={fixture().current()}
      definitions={{ nextTargetId: 1, targets: [], alternatives: [], values: [] }}
      translations={{}}
      disabled={false}
      onPreview={vi.fn()}
    />,
  )
  change('骨骼材料', 'preserved_rib')
  fireEvent.click(screen.getByLabelText('使用腐烂预兆'))
  change('骨骼材料', 'ancient_rib')
  const checkbox = screen.getByLabelText('使用腐烂预兆') as HTMLInputElement
  expect(checkbox.checked).toBe(true)
  expect(checkbox.disabled).toBe(false)
  fireEvent.click(checkbox)
  expect(checkbox.checked).toBe(false)
  expect(screen.getByLabelText('骨骼方向预兆')).toBeDefined()
})

it.each([0, 1, 2, 3, 4, 5])('Vorana 腐烂第 %i 槽固定三项候选，不推进槽位或重复计费', (slot) => {
  const data = preparedSlots(slot)
  mount(data)
  expect(data.current().pendingDesecration?.kind).toBe(slot < 3 ? 'prefix' : 'suffix')
  const candidates = offerInUi(data.current())
  expect(screen.getByRole('heading', { name: '已固定三项候选' })).toBeDefined()
  for (const id of candidates)
    expect(screen.getByRole('button', { name: `选择揭示 ${id}` })).toBeDefined()
  expect(
    screen.getByText(
      `剩余隐藏槽位：前缀 ${Math.max(0, 3 - slot)}，后缀 ${slot < 3 ? 3 : 6 - slot}。`,
    ),
  ).toBeDefined()
  expect(screen.getByText('保存完好的肋骨 × 1')).toBeDefined()
  expect(screen.getByText('腐烂预兆 × 1')).toBeDefined()
})

it.each([0, 1, 2, 3, 4, 5])('Vorana 腐烂第 %i 槽按前缀后缀顺序揭示且不重复计费', (slot) => {
  const complete = project(preparedSlots(6))
  const count = 5 + slot * 2
  const state = complete.states[count]
  if (!state) throw Error('缺少已固定三项候选的状态')
  const data = history(
    complete.project.initialState,
    complete.project.operations.slice(0, count),
    state,
  )
  mount(data)
  expect(state.pendingDesecration?.kind).toBe(slot < 3 ? 'prefix' : 'suffix')
  click(`选择揭示 ${state.pendingDesecration?.options?.[0]}`)
  click('预览揭示结果')
  click('应用骨骼步骤')
  if (slot === 5) {
    expect(screen.queryByText(/^剩余隐藏槽位/)).toBeNull()
  } else {
    expect(
      screen.getByText(
        `剩余隐藏槽位：前缀 ${Math.max(0, 2 - slot)}，后缀 ${slot < 3 ? 3 : 5 - slot}。`,
      ),
    ).toBeDefined()
  }
  expect(screen.getByText('保存完好的肋骨 × 1')).toBeDefined()
  expect(screen.getByText('腐烂预兆 × 1')).toBeDefined()
})

it('Vorana 完整揭示历史撤销后保存 v96，保留完整未来', () => {
  const data = preparedSlots(6)
  const expected = project(data)
  mount(data)
  click('撤销')
  click('保存演练到本机')
  const future = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(future.rulesVersion).toBe('basic-2026-09-17-v96')
  expect(future.cursor).toBe(data.operations.length - 1)
  expect(future.operations).toEqual(data.operations)
  // 保存结果须与已通过真实读取器验证的完整项目相等，仅改变游标；恢复行为另有独立界面用例。
  expect(future).toEqual({ ...expected.project, cursor: data.operations.length - 1 })
  expect(expected.states.at(-1)).toEqual(data.current())
  expect(expected.states.at(-1)?.affixes).toHaveLength(6)
  expect(expected.states.at(-1)?.affixes.every((affix) => !affix.desecrated)).toBe(true)
})

it('Vorana 恢复撤销后的完整历史，可以重做至第六槽完成', () => {
  const data = preparedSlots(6)
  const future = project(data)
  localStorage.setItem(
    REHEARSAL_PROJECT_KEY,
    JSON.stringify({ ...future.project, cursor: data.operations.length - 1 }),
  )
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={data.initial}
      translations={{ 'Omen of Putrefaction': '腐烂预兆' }}
    />,
  )
  click('恢复本机演练')
  click('重做')
  click('保存演练到本机')
  const restored = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(restored.cursor).toBe(data.operations.length)
  expect(restored.operations).toEqual(data.operations)
  expect(screen.queryByText(/^剩余隐藏槽位/)).toBeNull()
  expect(screen.getByText('腐烂预兆 × 1')).toBeDefined()
})
