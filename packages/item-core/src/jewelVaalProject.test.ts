import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { catalog } from './catalystTestFixture'
import { collectCraftCosts } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { serializeTargetCraftProject } from './craftProjectTargets'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { inspectItem } from './export'
import { JEWEL_SOURCE } from './jewels'
import { vaalJewelAffixCandidates } from './jewelVaalAffixes'
import { LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { inspectNumericLines } from './numeric'
import { parseItem } from './parse'
import { addCraftAffix, type CraftResult, type CraftState, craftCandidates } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function fixture() {
  let state: CraftState = {
    baseId: 'Sapphire',
    itemLevel: 86,
    rarity: 'rare',
    affixes: [],
    sourceText: null,
  }
  for (const kind of ['prefix', 'prefix', 'suffix', 'suffix']) {
    const mod = craftCandidates(catalog, state).find((m) => m.kind === kind)
    if (!mod) throw Error('缺少合成词缀')
    state = must(addCraftAffix(catalog, state, mod.id))
  }
  state = must(enableCraftAffixIdentity(catalog, state))
  const mod = must(vaalJewelAffixCandidates(catalog, state))[0]
  if (!mod) throw Error('缺少瓦尔候选')
  const values = must(inspectNumericLines(mod.lines)).map((range) => range.min)
  const operation = { kind: 'vaal', outcome: 'add', modId: mod.id, values } as unknown as CraftStep
  return { state, operation }
}
function project() {
  const { state, operation } = fixture()
  const [first, second, third, fourth] = state.affixes
  if (!first || !second || !third || !fourth) throw Error('缺少制作序列')
  return {
    schemaVersion: 1,
    rulesVersion: 'basic-2026-09-18-v116',
    sourceCommit: catalog._meta.sourceCommit,
    jewelSourceHash: JEWEL_SOURCE.sha256,
    initialState: { ...state, rarity: 'normal', affixes: [], nextAffixId: 1 },
    operations: [
      { currency: 'transmutation', modIds: [first.modId] },
      { currency: 'regal', modIds: [second.modId] },
      { currency: 'exalted', modIds: [third.modId] },
      { currency: 'exalted', modIds: [fourth.modId] },
      operation,
    ],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
}
it('瓦尔增删经统一操作入口执行，只计一颗瓦尔', () => {
  const { state, operation } = fixture()
  const result = must(applyCraftStep(catalog, state, operation))
  expect(result.affixes).toHaveLength(5)
  expect(result.corrupted).toBe(true)
  const selected = state.affixes[0]
  if (!selected) throw Error('缺少实例')
  const removal = {
    kind: 'vaal',
    outcome: 'remove',
    removeModId: selected.modId,
    removeAffixId: selected.affixId,
  } as unknown as CraftStep
  expect(must(applyCraftStep(catalog, state, removal)).affixes).toHaveLength(3)
  for (const step of [operation, removal])
    expect(must(collectCraftCosts(catalog, [step]))).toEqual([
      { id: 'currency:vaal', name: 'Vaal Orb', count: 1 },
    ])
})
it('v116 不借液态来源保存与恢复瓦尔第五条，包括撤销位置后的未来', () => {
  for (const cursor of [0, 4, 5]) {
    const input = { ...project(), cursor }
    const loaded = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
    expect(loaded.states[5]?.affixes).toHaveLength(5)
    expect(loaded.states[5]?.corrupted).toBe(true)
    expect(JSON.parse(must(serializeTargetCraftProject(loaded.project, catalog)))).toEqual(input)
  }
})
it('旧版本不能夹带新操作；损坏未来与缺珠宝来源均拒绝', () => {
  for (const rulesVersion of [
    'basic-2026-09-18-v115',
    'basic-2026-09-18-v114',
    'basic-2026-09-12-v72',
  ])
    expect(
      loadTargetWorkbenchProject(JSON.stringify({ ...project(), rulesVersion }), catalog).ok,
    ).toBe(false)
  const input = project()
  expect(
    loadTargetWorkbenchProject(JSON.stringify({ ...input, jewelSourceHash: 'bad' }), catalog).ok,
  ).toBe(false)
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({
        ...input,
        operations: [...input.operations.slice(0, 4), { ...input.operations[4], values: [-999] }],
      }),
      catalog,
    ).ok,
  ).toBe(false)
})

it('移除实例的完整未来可恢复，缺失或错配实例身份必须拒绝', () => {
  const input = project()
  const state = fixture().state
  const selected = state.affixes[0]
  if (!selected?.affixId) throw Error('缺少实例')
  const operation = {
    kind: 'vaal',
    outcome: 'remove',
    removeModId: selected.modId,
    removeAffixId: selected.affixId,
  }
  const removal = { ...input, operations: [...input.operations.slice(0, 4), operation] }
  const loaded = must(loadTargetWorkbenchProject(JSON.stringify(removal), catalog))
  expect(loaded.states[5]?.affixes).toEqual(state.affixes.slice(1))
  expect(JSON.parse(must(serializeTargetCraftProject(loaded.project, catalog)))).toEqual(removal)
  for (const bad of [
    { ...operation, removeAffixId: 'a2' },
    { kind: 'vaal', outcome: 'remove', removeModId: selected.modId },
  ])
    expect(
      loadTargetWorkbenchProject(
        JSON.stringify({ ...removal, operations: [...input.operations.slice(0, 4), bad] }),
        catalog,
      ).ok,
    ).toBe(false)
})

it('完整项目恢复不依赖不存在的液态表或来源', () => {
  const limited = {
    ...catalog,
    liquidEmotions: [],
    _meta: {
      ...catalog._meta,
      sources: catalog._meta.sources.filter((s) => s.path !== LIQUID_EMOTION_SOURCE.path),
    },
  }
  const input = project()
  const loaded = must(loadTargetWorkbenchProject(JSON.stringify(input), limited))
  expect(loaded.states[5]?.affixes).toHaveLength(5)
  expect(JSON.parse(must(serializeTargetCraftProject(loaded.project, limited)))).toEqual(input)
})

it.each(['zh-CN', 'zh-TW', 'en'] as const)('%s 第五条腐化珠宝文本可以再次导入', (locale) => {
  const { state, operation } = fixture()
  const result = must(applyCraftStep(catalog, state, operation))
  const dictLocale = locale === 'en' ? 'zh-CN' : locale
  const dictionary = createCraftItemDictionary(catalog, {
    items: JSON.parse(readFileSync(`data/dict/${dictLocale}/items.json`, 'utf8')),
    stats: JSON.parse(readFileSync(`data/dict/${dictLocale}/stats.json`, 'utf8')),
  })
  const text = must(exportCraftItemText(catalog, result, { locale, dictionary })).text
  const parsed = parseItem(text)
  if (!parsed.ok) throw Error(parsed.error)
  const imported = must(
    importIdentifiedCraftState(
      catalog,
      state.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      undefined,
      undefined,
      dictionary.stats?.entries,
    ),
  )
  expect(imported.corrupted).toBe(true)
  expect(imported.affixes.map((a) => [a.modId, a.lines])).toEqual(
    result.affixes.map((a) => [a.modId, a.lines]),
  )
})
