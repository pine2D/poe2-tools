import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  type CraftState,
  type CraftStep,
  loadTargetWorkbenchProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const rune = `pob2:augment:["Thrud's Might","weapon"]`
const target = 'DestructionInfluenceFireModifierEffect'
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
afterEach(() => {
  cleanup()
  localStorage.clear()
})
function save() {
  click('保存演练到本机')
  if (!localStorage.getItem(REHEARSAL_PROJECT_KEY))
    throw Error(screen.getByRole('region', { name: '演练项目' }).textContent ?? '无保存结果')
  const result = loadTargetWorkbenchProject(
    localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '',
    catalog,
  )
  if (!result.ok) throw Error(result.error)
  return result.value
}
const initial: CraftState = {
  baseId: 'Crude Bow',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
  sockets: [null],
  nextAffixId: 1,
}
const operations: CraftStep[] = [
  { kind: 'socket', socketIndex: 0, augmentId: rune },
  { currency: 'transmutation', modIds: ['LocalAddedFireDamage1'] },
  { currency: 'regal', modIds: ['LocalAddedColdDamage1'] },
  { kind: 'desecrate', boneId: 'preserved_jawbone', affixKind: 'suffix' },
  {
    kind: 'desecration-offer',
    modIds: [
      target,
      'DestructionInfluenceColdModifierEffect',
      'DestructionInfluenceChaosModifierEffect',
    ],
  },
  { kind: 'desecration-reveal', modId: target, values: [20] },
]
// 镶嵌与升稀有已有独立界面覆盖；使用真实可回放历史准备骨骼入口，减少重复渲染。
function prepared(count: number) {
  const source = (path: string) =>
    catalog._meta.sources.find((s) => s.path === `src/Data/${path}.lua`)?.sha256
  const result = loadTargetWorkbenchProject(
    JSON.stringify({
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: 'basic-2026-09-17-v95',
      initialState: initial,
      operations: operations.slice(0, count),
      cursor: count,
      augmentSourceHash: source('ModRunes'),
      desecrationSourceHash: source('ModVeiled'),
      scalabilitySourceHash: source('ModScalability'),
      targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
      orphanedTargets: [],
    }),
    catalog,
  )
  if (!result.ok) throw Error(result.error)
  return result.value
}
it('毁灭符文普通骨骼三阶段保存 v95 与三份来源', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initial}
      initialProject={prepared(3)}
      translations={{}}
    />,
  )
  change('骨骼材料', 'preserved_jawbone')
  fireEvent.click(screen.getByLabelText('占用后缀'))
  click('预览骨骼结果')
  click('应用骨骼步骤')
  change('搜索揭示候选', 'DestructionInfluence')
  for (const id of [
    target,
    'DestructionInfluenceColdModifierEffect',
    'DestructionInfluenceChaosModifierEffect',
  ])
    fireEvent.click(screen.getByLabelText(`候选 ${id}`))
  click('预览三项候选')
  click('应用骨骼步骤')
  click(`选择揭示 ${target}`)
  change(`${target} · 数值 1`, '20')
  click('预览揭示结果')
  click('应用骨骼步骤')
  const current = save()
  expect(current.project.rulesVersion).toBe('basic-2026-09-17-v95')
  for (const [key, path] of [
    ['augmentSourceHash', 'ModRunes'],
    ['desecrationSourceHash', 'ModVeiled'],
    ['scalabilitySourceHash', 'ModScalability'],
  ] as const)
    expect(current.project[key]).toBe(
      catalog._meta.sources.find((s) => s.path === `src/Data/${path}.lua`)?.sha256,
    )
  expect(current.states[6]?.affixes[2]).toMatchObject({ modId: target, desecrated: true })
})
it('v95 撤销后保存恢复仍可重做完整未来', () => {
  const current = prepared(6)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initial}
      initialProject={current}
      translations={{}}
    />,
  )
  click('回到起点')
  expect(save().project.cursor).toBe(0)
  click('恢复本机演练')
  for (let i = 0; i < 6; i++) click('重做')
  expect(save().states[6]?.affixes).toEqual(current.states[6]?.affixes)
})
