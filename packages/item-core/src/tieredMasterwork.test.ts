import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { prepareExtractionCraft } from './extraction'
import { prepareMasterworkCraft } from './masterwork'
import { parseItem } from './parse'
import type { CraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { checkCraftStrategyAction } from './strategyActions'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'
import { requiresTieredMasterworkProjectVersion } from './tieredMasterworkProjectVersion'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const id = (name: string, category = 'armour') => `pob2:augment:${JSON.stringify([name, category])}`
function initial(
  name = 'Lesser Rebirth Rune',
  category = 'armour',
  baseId = 'Adherent Cuffs',
): CraftState {
  return {
    baseId,
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
    sockets: [id(name, category)],
    quality: 20,
  }
}
it.each([
  ['armour', 'Adherent Cuffs', 'Rebirth', 3],
  ['weapon', 'Crude Bow', 'Iron', 3],
  ['wand', 'Withered Wand', 'Desert', 3],
  ['armour', 'Adherent Cuffs', 'Tempered', 2],
])('%s %s 从低阶逐次升级、计费与萃取', (category, baseId, family, steps) => {
  let state = initial(`Lesser ${family} Rune`, category, baseId)
  const operations = []
  for (let i = 0; i < steps; i++) {
    expect(
      checkCraftStrategyAction(catalog, state, { kind: 'masterwork', socketIndex: 0 }).ok,
    ).toBe(true)
    const p = prepareMasterworkCraft(catalog, state, 0)
    if (!p.ok) throw Error(p.error)
    const target = `${['', 'Greater ', 'Perfect '][i]}${family} Rune`
    expect(p.value.to.name).toBe(target)
    const r = applyCraftStep(catalog, state, p.value.operation)
    if (!r.ok) throw Error(r.error)
    expect(r.value.sockets).toEqual([id(target, category)])
    expect({ ...r.value, sockets: state.sockets }).toMatchObject(state)
    operations.push(p.value.operation)
    state = r.value
  }
  expect(prepareMasterworkCraft(catalog, state, 0).ok).toBe(false)
  expect(collectCraftCosts(catalog, operations)).toMatchObject({
    ok: true,
    value: [{ id: 'augment:Masterwork Rune', count: steps }],
  })
  expect(prepareExtractionCraft(catalog, state)).toMatchObject({
    ok: true,
    value: {
      returns: [{ count: 1, name: `${steps === 3 ? 'Perfect' : 'Greater'} ${family} Rune` }],
    },
  })
})
function project() {
  return {
    schemaVersion: 1,
    rulesVersion: 'basic-2026-09-18-v121',
    sourceCommit: catalog._meta.sourceCommit,
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    initialState: { ...initial(), sockets: [null], nextAffixId: 1 },
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId: id('Lesser Rebirth Rune') },
      ...['', 'Greater ', 'Perfect '].map((prefix, i) => ({
        kind: 'masterwork',
        socketIndex: 0,
        fromAugmentId: id(`${['Lesser ', '', 'Greater '][i]}Rebirth Rune`),
        toAugmentId: id(`${prefix}Rebirth Rune`),
      })),
    ],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
}
it('v121所有游标恢复完整未来；v120拒绝低阶历史但保留旧升级和报价', () => {
  const p = project()
  for (let cursor = 0; cursor <= 4; cursor++) {
    const result = loadTargetWorkbenchProject(JSON.stringify({ ...p, cursor }), catalog)
    if (!result.ok) throw Error(result.error)
    expect(result.value.project.operations).toEqual(p.operations)
    expect(result.value.states[4]?.sockets).toEqual([id('Perfect Rebirth Rune')])
    expect(result.value.project.rulesVersion).toBe(p.rulesVersion)
  }
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-18-v120' }),
      catalog,
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('v121') })
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({
        ...p,
        rulesVersion: 'basic-2026-09-18-v120',
        operations: [
          { kind: 'socket', socketIndex: 0, augmentId: id('Greater Rebirth Rune') },
          p.operations[3],
        ],
        pricing: { unit: 'divine', prices: { 'augment:Masterwork Rune': 1 } },
      }),
      catalog,
    ).ok,
  ).toBe(true)
})
it('低阶起点尚未执行的升级指引也需v121，单独低阶孔位仍兼容旧版', () => {
  const original = project()
  const p = { ...original, operations: original.operations.slice(0, 1), cursor: 1 }
  const strategy = {
    maxSteps: 10,
    rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'masterwork', socketIndex: 0 } }],
  }
  expect(loadTargetWorkbenchProject(JSON.stringify({ ...p, strategy }), catalog).ok).toBe(true)
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...p, strategy, rulesVersion: 'basic-2026-09-18-v120' }),
      catalog,
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('v121') })
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-18-v120' }),
      catalog,
    ).ok,
  ).toBe(true)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s三步各结果导出后按孔位完整回读', (locale) => {
  const dictionary = createCraftItemDictionary(
    catalog,
    locale === 'en'
      ? {}
      : {
          items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
          stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
        },
  )
  const r = loadTargetWorkbenchProject(JSON.stringify(project()), catalog)
  if (!r.ok) throw Error(r.error)
  for (const state of r.value.states.slice(2)) {
    const text = exportCraftItemText(catalog, state, { locale, dictionary })
    if (!text.ok) throw Error(text.error)
    const parsed = parseItem(text.value.text)
    if (!parsed.ok) throw Error(parsed.error)
    const restored = importCraftState(
      catalog,
      state.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      state.sockets,
      undefined,
      dictionary.stats?.entries,
    )
    if (!restored.ok) throw Error(restored.error)
    expect(restored.value.sockets).toEqual(state.sockets)
    const prepared = prepareMasterworkCraft(catalog, state, 0)
    expect(prepareMasterworkCraft(catalog, restored.value, 0).ok).toBe(prepared.ok)
  }
})
it('能力检测只看数据字段、按孔位核对，不解释原文或执行访问器', () => {
  const action = { kind: 'masterwork', socketIndex: 1 }
  expect(requiresTieredMasterworkProjectVersion({ state: initial(), action }, catalog)).toBe(false)
  expect(
    requiresTieredMasterworkProjectVersion(
      { state: initial(), action: { ...action, socketIndex: 0 } },
      catalog,
    ),
  ).toBe(true)
  expect(
    requiresTieredMasterworkProjectVersion(
      {
        sourceText: JSON.stringify(project()),
        pricing: { prices: { 'augment:Masterwork Rune': 1 } },
      },
      catalog,
    ),
  ).toBe(false)
  const sockets = Object.defineProperty([], '0', {
    get: () => {
      throw Error('不应读取访问器')
    },
  })
  expect(requiresTieredMasterworkProjectVersion({ state: { sockets }, action }, catalog)).toBe(
    false,
  )
})
it('没有升级动作的项目不读取符文目录', () => {
  const untouched = Object.defineProperty({ ...catalog }, 'augments', {
    get: () => {
      throw Error('无升级动作不应读取目录')
    },
  })
  expect(
    requiresTieredMasterworkProjectVersion({ initialState: initial(), operations: [] }, untouched),
  ).toBe(false)
})
it('沿用指引保留v121及全部未来，新指引匹配低阶孔位时升级版本', () => {
  const p = project()
  const receiver = {
    ...p,
    rulesVersion: 'basic-2026-09-18-v120',
    operations: p.operations.slice(0, 1),
    cursor: 1,
  }
  const strategy = {
    maxSteps: 10,
    rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'masterwork', socketIndex: 0 } }],
  }
  const result = reuseTargetCraftPlan(
    JSON.stringify(receiver),
    JSON.stringify({ ...p, strategy }),
    catalog,
  )
  if (!result.ok) throw Error(result.error)
  expect(result.value.project.rulesVersion).toBe('basic-2026-09-18-v121')
  expect(result.value.project.operations).toEqual(receiver.operations)
  const retained = reuseTargetCraftPlan(
    JSON.stringify(p),
    JSON.stringify({
      ...receiver,
      strategy: {
        maxSteps: 10,
        rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
      },
    }),
    catalog,
  )
  if (!retained.ok) throw Error(retained.error)
  expect(retained.value.project.rulesVersion).toBe('basic-2026-09-18-v121')
  expect(retained.value.project.operations).toEqual(p.operations)
})
