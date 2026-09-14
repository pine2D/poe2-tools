import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, type CraftProject, parseCraftProject } from './craftProject'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { inspectItem } from './export'
import { JEWEL_SOURCE } from './jewels'
import { parseItem } from './parse'
import {
  type CraftState,
  craftCandidates,
  createCraftState,
  prepareCraftOperation,
} from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { planCraftTargetRoutes } from './targetRoutes'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const large = 'JewelRadiusLargeSize'
const medium = 'JewelRadiusMediumSize'
const spell = 'JewelRadiusSpellDamage'
const cast = 'JewelRadiusCastSpeed'
const effect = 'JewelRadiusSmallNodeEffect'
function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('缺少测试记录')
  return value
}
const initial: CraftState = {
  baseId: 'Time-Lost Sapphire',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
}
const steps: CraftStep[] = [
  { currency: 'transmutation', modIds: [large] },
  { currency: 'augmentation', modIds: [cast], rolls: [{ modId: cast, values: [1] }] },
  { currency: 'regal', modIds: [spell], rolls: [{ modId: spell, values: [1] }] },
  { currency: 'exalted', modIds: [effect], rolls: [{ modId: effect, values: [15] }] },
]
function apply(state: CraftState, step: CraftStep): CraftState {
  const next = applyCraftStep(catalog, state, step)
  if (!next.ok) throw Error(next.error)
  return next.value
}
function text(state: CraftState): string {
  const result = exportCraftItemText(catalog, state)
  if (!result.ok) throw Error(result.error)
  return result.value.text
}
function imported(source: string, baseId = initial.baseId) {
  const parsed = parseItem(source)
  if (!parsed.ok) throw Error(parsed.error)
  return importCraftState(
    catalog,
    baseId,
    parsed.item,
    inspectItem(parsed.item, { items: { bases: { [baseId]: baseId }, uniques: {} } }),
  )
}

it.each(['Time-Lost Ruby', 'Time-Lost Emerald', 'Time-Lost Sapphire', 'Time-Lost Diamond'])(
  '%s 搜索起点采用小半径且候选只来自范围域',
  (baseId) => {
    const state = { ...initial, baseId }
    expect(createCraftState(catalog, state).ok).toBe(true)
    expect(text(state)).toContain('Radius: Small')
    const candidates = craftCandidates(catalog, { ...state, rarity: 'magic' }, 'augmentation')
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((entry) => entry.radiusJewelOnly)).toBe(true)
  },
)

it('从空白起点制作二前二后，半径词缀互斥且不能加第五组', () => {
  const state = steps.reduce(apply, initial)
  expect(state.affixes).toHaveLength(4)
  expect(text(state)).toContain('Radius: Large')
  expect(craftCandidates(catalog, state)).toEqual([])
  expect(prepareCraftOperation(catalog, state, 'exalted').ok).toBe(false)
  const first = apply(initial, required(steps[0]))
  expect(
    craftCandidates(catalog, { ...first, rarity: 'rare' }).some((entry) => entry.id === medium),
  ).toBe(false)
  expect(
    createCraftState(catalog, {
      ...state,
      affixes: [...state.affixes, { modId: medium, lines: ['Upgrades Radius to Medium'] }],
    }).ok,
  ).toBe(false)
})

it('神圣只重掷数值，剥离半径后回到小范围；混沌更换为中范围', () => {
  const state = steps.reduce(apply, initial)
  const divine = apply(state, {
    currency: 'divine',
    modIds: [],
    rolls: [
      { modId: cast, values: [2] },
      { modId: spell, values: [2] },
      { modId: effect, values: [25] },
    ],
  })
  expect(divine.affixes[0]).toEqual(state.affixes[0])
  expect(text(divine)).toContain('Radius: Large')
  expect(text(apply(divine, { currency: 'annulment', modIds: [], removeModId: large }))).toContain(
    'Radius: Small',
  )
  expect(text(apply(state, { currency: 'chaos', modIds: [medium], removeModId: large }))).toContain(
    'Radius: Medium',
  )
})

it('高级文本半径与完整范围词缀可回读，冲突、重复及未知半径拒绝', () => {
  const state = steps.reduce(apply, initial)
  const source = text(state)
  const result = imported(source)
  expect(result.ok && result.value.affixes).toEqual(state.affixes)
  for (const line of ['Radius: Small', 'Radius: Huge', 'Radius: Large\nRadius: Large'])
    expect(imported(source.replace('Radius: Large', line)).ok).toBe(false)
  for (const line of ['范围：大', '半径: 大', '範圍：大', '半徑: 大'])
    expect(imported(source.replace('Radius: Large', line)).ok).toBe(true)
  expect(imported(source.replace('Radius: Large\n--------\n', '')).ok).toBe(true)
  expect(
    imported(
      text({ ...initial, baseId: 'Sapphire' }).replace(
        'Item Level:',
        'Radius: Small\n--------\nItem Level:',
      ),
      'Sapphire',
    ).ok,
  ).toBe(false)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 独立词典往返保留范围全文和半径，原文半径不能删改后导入',
  (locale) => {
    const dictionary = createCraftItemDictionary(
      catalog,
      locale === 'en'
        ? {}
        : Object.fromEntries(
            ['items', 'stats'].map((kind) => [
              kind,
              JSON.parse(readFileSync(`data/dict/${locale}/${kind}.json`, 'utf8')),
            ]),
          ),
    )
    const state = steps.reduce(apply, initial)
    const exported = exportCraftItemText(catalog, state, { locale, dictionary })
    if (!exported.ok) throw Error(exported.error)
    const parsed = parseItem(exported.value.text)
    if (!parsed.ok) throw Error(parsed.error)
    const inspection = inspectItem(parsed.item, dictionary)
    const restored = importCraftState(
      catalog,
      state.baseId,
      parsed.item,
      inspection,
      undefined,
      undefined,
      dictionary.stats?.entries,
    )
    if (!restored.ok) throw Error(restored.error)
    expect(restored.value.affixes).toEqual(state.affixes)
    const changed = structuredClone(parsed.item)
    changed.blocks = changed.blocks.filter(
      (block) => !block.lines.some((line) => line.raw.startsWith('Radius:')),
    )
    expect(importCraftState(catalog, state.baseId, changed, inspection).ok).toBe(false)
    if (locale !== 'en')
      expect(exported.value.warnings.some((warning) => warning.includes('原生标题'))).toBe(true)
  },
)

it('三个不同前缀仍超出范围珠宝容量；普通珠宝词缀不能由保留规则放行', () => {
  const state = steps.reduce(apply, initial)
  const extra = required(catalog.modifiers.find((mod) => mod.id === 'JewelRadiusColdDamage'))
  expect(
    createCraftState(catalog, {
      ...state,
      affixes: [
        required(state.affixes[0]),
        required(state.affixes[2]),
        { modId: extra.id, lines: extra.lines },
      ],
    }).ok,
  ).toBe(false)
  const ordinary = required(catalog.modifiers.find((mod) => mod.id === 'JewelLifeonKill'))
  expect(
    createCraftState(catalog, {
      ...state,
      affixes: [{ modId: ordinary.id, lines: ordinary.lines }],
    }).ok,
  ).toBe(false)
})

it('范围状态不能借已开放普通珠宝规则混入工艺、亵渎、品质或腐化', () => {
  const state = steps.reduce(apply, initial)
  for (const added of [
    { quality: 0 },
    { catalyst: { id: "Xoph's", quality: 0 } },
    { corrupted: true as const },
  ])
    expect(createCraftState(catalog, { ...state, ...added }).ok).toBe(false)
  for (const flag of ['crafted', 'desecrated'] as const)
    expect(
      createCraftState(catalog, {
        ...state,
        affixes: state.affixes.map((a, i) => (i ? a : { ...a, [flag]: true })),
      }).ok,
    ).toBe(false)
  expect(createCraftState({ ...catalog, _meta: { ...catalog._meta, sources: [] } }, state).ok).toBe(
    false,
  )
})

it('不能替换词缀检查结果绕过原文半径冲突', () => {
  const largeText = text(steps.reduce(apply, initial))
  const contradictory = parseItem(largeText.replace('Radius: Large', 'Radius: Medium'))
  const mediumItem = parseItem(
    largeText.replaceAll('Large', 'Medium').replace('"Grand"', '"Greater"'),
  )
  if (!contradictory.ok || !mediumItem.ok) throw Error('缺少测试文本')
  const dictionary = createCraftItemDictionary(catalog)
  expect(
    importCraftState(
      catalog,
      initial.baseId,
      contradictory.item,
      inspectItem(mediumItem.item, dictionary),
    ).ok,
  ).toBe(false)
})

it('目标路线生成并实际回放半径属性，保持二前二后容量', () => {
  const result = planCraftTargetRoutes(catalog, initial, [large, cast], [], [], {
    maxDepth: 2,
    maxStates: 12,
  })
  if (!result.ok) throw Error(result.error)
  expect(result.value.routes.length).toBeGreaterThan(0)
  for (const route of result.value.routes) {
    const end = route.steps.reduce((state, step) => apply(state, step.operation), initial)
    expect(end).toEqual(route.finalState)
    expect(text(end)).toContain('Radius: Large')
  }
})

it('新版本项目在所有游标恢复半径历史，旧版本不能借新目录开放范围起点', () => {
  const project: CraftProject = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    jewelSourceHash: JEWEL_SOURCE.sha256,
    initialState: initial,
    operations: [...steps, { currency: 'annulment', modIds: [], removeModId: large }],
    cursor: 0,
    targetModIds: [large],
  }
  for (let cursor = 0; cursor <= project.operations.length; cursor++) {
    const result = parseCraftProject(JSON.stringify({ ...project, cursor }), catalog)
    if (!result.ok) throw Error(result.error)
    expect(text(required(result.value.states[cursor]))).toContain(
      `Radius: ${cursor === 0 || cursor === 5 ? 'Small' : 'Large'}`,
    )
  }
  for (const version of [32, 52, 66])
    expect(
      parseCraftProject(
        JSON.stringify({ ...project, rulesVersion: `basic-2026-09-12-v${version}` }),
        catalog,
      ).ok,
    ).toBe(false)
})
