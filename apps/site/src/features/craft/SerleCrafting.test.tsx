import { readFileSync } from 'node:fs'
import {
  addCraftAffix,
  type CraftCatalog,
  type CraftResult,
  type CraftState,
  craftCandidates,
  createCraftItemDictionary,
  exportCraftItemText,
  importIdentifiedCraftState,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RehearsalPanel } from './RehearsalPanel'

// 真实目录的路线搜索与多次项目回放比模拟 Worker 的组件测试更耗时。
vi.setConfig({ testTimeout: 15_000 })

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
const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const serle = 'pob2:augment:["Serle\u0027s Triumph","armour"]'
const dictionary = createCraftItemDictionary(catalog)
function must<T>(r: CraftResult<T>): T {
  if (!r.ok) throw Error(r.error)
  return r.value
}
function imported(state: CraftState) {
  const text = must(exportCraftItemText(catalog, state, { locale: 'en', dictionary })).text
  const parsed = parseItem(text)
  if (!parsed.ok) throw Error(parsed.error)
  return must(
    importIdentifiedCraftState(
      catalog,
      state.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      state.sockets,
    ),
  )
}
const initial = {
  baseId: 'Twig Focus',
  itemLevel: 86,
  rarity: 'rare' as const,
  affixes: [],
  sourceText: null,
  quality: 20,
  sockets: [null, null],
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
function save() {
  click('保存演练到本机')
  const result = parseTargetCraftProject(
    localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '',
    catalog,
  )
  if (!result.ok) throw Error(result.error)
  return result.value.project
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
it('Serle显示四个后缀空位、绑定说明并保存v88完整未来', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={imported(initial)}
      importedSockets={initial.sockets}
      dictionary={dictionary}
    />,
  )
  change('选择镶嵌符文', serle)
  click('应用镶嵌')
  const heading = screen.getByRole('heading', { name: '后缀 0/4' })
  if (!heading.parentElement) throw Error('缺少后缀区域')
  expect(within(heading.parentElement).getAllByText('空后缀')).toHaveLength(4)
  expect(screen.getByLabelText('当前镶嵌效果').textContent).toContain('绑定孔不能替换')
  expect(save().rulesVersion).toBe('basic-2026-09-16-v88')
  click('撤销')
  expect(save().operations).toHaveLength(1)
  click('恢复本机演练')
  click('重做')
  expect(screen.getByRole('heading', { name: '后缀 0/4' })).toBeTruthy()
})
it('绑定覆盖草稿不宣称可覆盖旧符文且不改变历史', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={imported({ ...initial, sockets: [serle, null] })}
      importedSockets={[serle, null]}
      dictionary={dictionary}
    />,
  )
  const before = save()
  change('选择镶嵌符文', 'pob2:augment:["Iron Rune","armour"]')
  expect(screen.getByRole('button', { name: '应用镶嵌' }).hasAttribute('disabled')).toBe(true)
  expect(screen.queryByText(/旧符文会被覆盖/)).toBeNull()
  click('取消镶嵌')
  expect(save()).toEqual(before)
})

function renderFutureSerleProject(affixCount = 1, needsSocket = false, magic = false) {
  let state: CraftState = { ...initial, sockets: [serle] }
  for (const kind of [
    'prefix',
    'prefix',
    'prefix',
    'suffix',
    'suffix',
    'suffix',
    'suffix',
  ] as const) {
    const mod = craftCandidates(catalog, state).find((m) => m.kind === kind)
    if (!mod) throw Error('候选缺失')
    state = must(addCraftAffix(catalog, state, mod.id))
  }
  const sockets = needsSocket ? [] : [null]
  const first = imported({
    ...initial,
    rarity: magic ? 'magic' : 'rare',
    affixes: magic
      ? state.affixes.filter((_, i) => i === 0 || i === 3)
      : state.affixes.slice(0, affixCount),
    sockets,
  })
  const project = must(
    parseTargetCraftProject(
      JSON.stringify({
        schemaVersion: 1,
        sourceCommit: catalog._meta.sourceCommit,
        rulesVersion: 'basic-2026-09-16-v88',
        augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
          ?.sha256,
        initialState: first,
        importedSockets: sockets,
        operations: [
          ...(needsSocket ? [{ kind: 'artificer' }] : []),
          ...(magic ? [{ currency: 'regal', modIds: [state.affixes[1]?.modId] }] : []),
          { kind: 'socket', socketIndex: 0, augmentId: serle },
        ],
        cursor: 0,
        targetDefinitions: {
          nextTargetId: 8,
          targets: state.affixes.map((a, i) => ({ targetId: `t${i + 1}`, modId: a.modId })),
          alternatives: [],
          values: [],
        },
        orphanedTargets: [],
        strategy: {
          maxSteps: 10,
          rules: [
            {
              conditions: [{ kind: 'always' }],
              action: { kind: 'socket', socketIndex: 'first-empty', augmentId: serle },
            },
          ],
        },
      }),
      catalog,
    ),
  )
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={first}
      initialProject={project}
      dictionary={dictionary}
    />,
  )
  return state
}

it('七目标项目退到未来Serle前仍能执行首步指引并恢复', () => {
  renderFutureSerleProject()
  expect(save().targetDefinitions.targets).toHaveLength(7)
  click('开始指引步骤')
  expect(screen.getByRole('button', { name: '应用镶嵌' }).hasAttribute('disabled')).toBe(false)
  click('应用镶嵌')
  expect(save().cursor).toBe(1)
  click('撤销')
  click('恢复本机演练')
  expect(save().targetDefinitions.targets).toHaveLength(7)
})

it('未来Serle容量允许在当前未镶入时编辑目标数量和数值', () => {
  const state = renderFutureSerleProject()
  change('显式目标达成条件', '6')
  expect(save().targetDefinitions.minimumTargetCount).toBe(6)
  change('显式目标达成条件', 'all')
  const modId = state.affixes[0]?.modId
  click(`设置数值条件 ${modId}`)
  const minimum = screen.getByLabelText(`${modId} · 数值 1 最小值`) as HTMLInputElement
  fireEvent.change(minimum, { target: { value: minimum.min } })
  click(`保存数值条件 ${modId}`)
  expect(save().targetDefinitions.values).toHaveLength(1)
})

it('未来Serle容量允许在当前未镶入时删除和重新提取目标', () => {
  const state = renderFutureSerleProject()
  click(`移除目标 ${state.affixes[1]?.modId}`)
  expect(save().targetDefinitions.targets).toHaveLength(6)
  click('从当前装备提取目标')
  click('用所选词缀替换显式目标')
  expect(save().targetDefinitions.targets).toHaveLength(1)
})
it('没有孔位的仅Serle报价也保存v88及镶嵌来源', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={{
        baseId: 'Twig Focus',
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
      }}
    />,
  )
  change('搜索报价材料', 'Serle')
  fireEvent.click(screen.getByRole('button', { name: /添加报价.*凯旋/ }))
  fireEvent.change(screen.getByLabelText(/凯旋单价/), { target: { value: '3' } })
  click('应用报价')
  const saved = save()
  expect(saved.rulesVersion).toBe('basic-2026-09-16-v88')
  expect(saved.augmentSourceHash).toBe(
    catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')?.sha256,
  )
  expect(saved.operations).toHaveLength(0)
})

it.each([false, true])('容量路线第一步能预览、取消及应用（需打孔=%s）', (needsSocket) => {
  renderFutureSerleProject(6, needsSocket)
  click('生成多步示例路线')
  const preview = () => {
    const button = screen.getAllByRole('button', { name: '预览路线第一步' })[0]
    if (!button) throw Error('缺少路线第一步')
    fireEvent.click(button)
  }
  const before = save()
  preview()
  click(needsSocket ? '取消打孔' : '取消镶嵌')
  expect(save()).toEqual(before)
  preview()
  click(needsSocket ? '应用打孔' : '应用镶嵌')
  const after = save()
  expect(after.cursor).toBe(1)
  expect(after.operations[0]).toMatchObject({ kind: needsSocket ? 'artificer' : 'socket' })
})

it.each([false, true])('先升稀有的容量路线保存未来镶嵌，取消不写入历史（取消=%s）', (cancel) => {
  renderFutureSerleProject(2, false, true)
  click('生成多步示例路线')
  const preview = () => {
    const button = screen.getAllByRole('button', { name: '预览路线第一步' })[0]
    if (!button) throw Error('缺少路线第一步')
    fireEvent.click(button)
  }
  const before = cancel ? save() : null
  preview()
  if (cancel) {
    click('取消本次结果')
    expect(save()).toEqual(before)
    return
  }
  click('应用本次结果')
  const after = save()
  expect(after.cursor).toBe(1)
  expect(after.operations[0]).toMatchObject({ currency: 'regal' })
  expect(after.operations.slice(1).some((step) => 'kind' in step && step.kind === 'socket')).toBe(
    true,
  )
  click('恢复本机演练')
  expect(save()).toEqual(after)
  click('生成多步示例路线')
  preview()
  click('应用本次结果')
  const withOmen = save()
  expect(withOmen.cursor).toBe(2)
  expect(withOmen.operations[1]).toMatchObject({ currency: 'exalted', omen: 'greater_exaltation' })
  expect(
    withOmen.operations.slice(2).some((step) => 'kind' in step && step.kind === 'socket'),
  ).toBe(true)
})

it('修改容量路线首步数值后不能静默丢弃未来历史', () => {
  renderFutureSerleProject(2, false, true)
  click('生成多步示例路线')
  const before = save()
  const preview = screen.getAllByRole('button', { name: '预览路线第一步' })[0]
  if (!preview) throw Error('缺少路线第一步')
  fireEvent.click(preview)
  const input = [...document.querySelectorAll<HTMLInputElement>('.numeric-controls input')].find(
    (entry) => Number(entry.min) < Number(entry.max),
  )
  if (!input) throw Error('缺少可修改的路线数值')
  fireEvent.change(input, {
    target: { value: input.value === input.min ? input.max : input.min },
  })
  click('应用本次结果')
  expect(screen.getByText('路线首步已修改，请取消并重新生成路线。')).toBeTruthy()
  expect(save()).toEqual(before)
})
