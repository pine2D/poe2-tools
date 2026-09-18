import { readFileSync } from 'node:fs'
import {
  addCraftAffix,
  applyCraftStep,
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
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const dictionary = createCraftItemDictionary(catalog)
const essenceId = 'Metadata/Items/Currency/CurrencyPerfectEssenceAttribute'
function must<T>(r: CraftResult<T>): T {
  if (!r.ok) throw Error(r.error)
  return r.value
}
function imported(state: CraftState) {
  const parsed = parseItem(
    must(exportCraftItemText(catalog, state, { locale: 'en', dictionary })).text,
  )
  if (!parsed.ok) throw Error(parsed.error)
  return must(
    importIdentifiedCraftState(
      catalog,
      state.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
    ),
  )
}
function start() {
  const state: CraftState = {
    baseId: 'Amber Amulet',
    rarity: 'rare',
    itemLevel: 86,
    affixes: [],
    sourceText: null,
  }
  const mod = craftCandidates(catalog, state).find((m) => m.kind === 'prefix')
  if (!mod) throw Error('缺少前缀')
  return imported(must(addCraftAffix(catalog, state, mod.id)))
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
function save() {
  click('保存演练到本机')
  return must(
    parseTargetCraftProject(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '', catalog),
  ).project
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
it.each(['Ancestral Tiara', 'Sleek Jacket'])(
  '防御精华 %s 预览、应用及撤销后的完整未来恢复',
  (baseId) => {
    const initial: CraftState = {
      baseId,
      rarity: 'normal',
      itemLevel: 86,
      affixes: [],
      sourceText: null,
    }
    const magic = must(
      applyCraftStep(catalog, initial, { currency: 'transmutation', modIds: ['IncreasedLife1'] }),
    )
    render(
      <RehearsalPanel
        catalog={catalog}
        translations={{}}
        initialState={imported(magic)}
        dictionary={dictionary}
      />,
    )
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索可演练精华' }), {
      target: { value: 'Greater Essence of Enhancement' },
    })
    fireEvent.click(screen.getByRole('button', { name: /选择精华 Greater Essence of Enhancement/ }))
    click('预览精华结果')
    click('应用精华结果')
    let project = save()
    expect(project.rulesVersion).toBe('basic-2026-09-18-v115')
    expect(project.operations[0]).toMatchObject({
      kind: 'essence',
      essenceId: 'Metadata/Items/Currency/CurrencyGreaterEssenceDefences',
    })
    click('撤销')
    project = save()
    expect(project.cursor).toBe(0)
    expect(project.operations).toHaveLength(1)
    click('恢复本机演练')
    click('重做')
    expect(save().cursor).toBe(1)
  },
)
it('网页三结果预览应用、撤销保存完整未来及恢复重做', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={start()}
      dictionary={dictionary}
    />,
  )
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索可演练精华' }), {
    target: { value: 'Perfect Essence of the Infinite' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: /选择精华 Perfect Essence of the Infinite.*Intelligence/ }),
  )
  fireEvent.click(screen.getByRole('radio'))
  click('预览精华结果')
  click('应用精华结果')
  let project = save()
  expect(project.rulesVersion).toBe('basic-2026-09-16-v89')
  expect(project.operations[0]).toMatchObject({ resultModId: 'EssencePercentIntelligence1' })
  click('撤销')
  project = save()
  expect(project.cursor).toBe(0)
  expect(project.operations).toHaveLength(1)
  click('恢复本机演练')
  click('重做')
  expect(save().cursor).toBe(1)
})
it('已带三分支工艺的导入起点也保存来源指纹', () => {
  const state = start()
  const a = state.affixes[0]
  if (!a) throw Error('缺少词缀')
  const crafted = must(
    applyCraftStep(catalog, state, {
      kind: 'essence',
      essenceId,
      resultModId: 'EssencePercentDexterity1',
      values: [8],
      removeModId: a.modId,
      ...(a.affixId ? { removeAffixId: a.affixId } : {}),
    }),
  )
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={imported(crafted)}
      dictionary={dictionary}
    />,
  )
  expect(save().rulesVersion).toBe('basic-2026-09-16-v89')
})
it('恢复没有新能力的v89也保持原规则版本', () => {
  const project = must(
    parseTargetCraftProject(
      JSON.stringify({
        schemaVersion: 1,
        sourceCommit: catalog._meta.sourceCommit,
        rulesVersion: 'basic-2026-09-16-v89',
        initialState: start(),
        operations: [],
        cursor: 0,
        targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
        orphanedTargets: [],
      }),
      catalog,
    ),
  )
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={project.project.initialState}
      initialProject={project}
      dictionary={dictionary}
    />,
  )
  expect(save().rulesVersion).toBe('basic-2026-09-16-v89')
})
it.each([
  ['Lesser Essence of the Infinite', 'Strength2'],
  ['Essence of the Infinite', 'Dexterity4'],
  ['Greater Essence of the Infinite', 'Intelligence6'],
])('普通属性精华 %s 保存v117完整未来并恢复重做', (name, resultModId) => {
  const initial: CraftState = {
    baseId: 'Amber Amulet',
    rarity: 'magic',
    itemLevel: 86,
    sourceText: null,
    affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }],
  }
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={imported(initial)}
      dictionary={dictionary}
    />,
  )
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索可演练精华' }), {
    target: { value: name },
  })
  const attribute = resultModId.replace(/\d+$/, '')
  const button = screen
    .getAllByRole('button', { name: /^选择精华 / })
    .find(
      (b) =>
        b.getAttribute('aria-label')?.startsWith(`选择精华 ${name} · `) &&
        b.getAttribute('aria-label')?.includes(attribute),
    )
  if (!button) throw Error('缺少指定属性结果')
  fireEvent.click(button)
  click('预览精华结果')
  click('应用精华结果')
  const applied = save()
  expect(applied.rulesVersion).toBe('basic-2026-09-18-v117')
  expect(applied.operations[0]).toMatchObject({ kind: 'essence', resultModId })
  click('撤销')
  expect(save()).toMatchObject({
    rulesVersion: 'basic-2026-09-18-v117',
    cursor: 0,
    operations: applied.operations,
  })
  click('恢复本机演练')
  click('重做')
  expect(save()).toEqual(applied)
})
