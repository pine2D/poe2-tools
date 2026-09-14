import { expect, it } from 'vitest'
import { catalog, dictionary } from './catalystTestFixture'
import { collectCraftCosts } from './craftCosts'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { inspectItem } from './export'
import { JEWEL_SOURCE } from './jewels'
import { LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { inspectNumericLines, renderNumericLines } from './numeric'
import { parseItem } from './parse'
import type { CraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { STAT_SCALABILITY_SOURCE } from './statScalability'

const ferocity = 'Metadata/Items/Currency/EndgameDistilledEmotion2'
const effectIds = ['CraftedJewelSuffixEffect', 'CraftedJewelPrefixEffect'] as const
const sourceHashes = {
  jewelSourceHash: JEWEL_SOURCE.sha256,
  liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
  scalabilitySourceHash: STAT_SCALABILITY_SOURCE.sha256,
}
function imported(ids: readonly string[] = ['JewelFireDamage']): CraftState {
  const groups = ids.map((id) => {
    const mod = catalog.modifiers.find((entry) => entry.id === id)
    if (!mod) throw Error('缺少真实目录词缀')
    const bounds = inspectNumericLines(mod.lines)
    if (!bounds.ok) throw Error(bounds.error)
    const lines = renderNumericLines(
      mod.lines,
      bounds.value.map((bound) => bound.min),
    )
    if (!lines.ok) throw Error(lines.error)
    const name = mod.craftedOnly ? '' : ` "${mod.name}"`
    return `{ ${mod.kind === 'prefix' ? 'Prefix' : 'Suffix'} Modifier${name} }\n${lines.value.map((line) => `${line}${mod.craftedOnly ? ' (crafted)' : ''}`).join('\n')}`
  })
  const raw = `Item Class: Jewels\nRarity: Rare\nTest Jewel\nRuby\n--------\nItem Level: 86\n--------\n${groups.join('\n')}`
  const parsed = parseItem(raw)
  if (!parsed.ok) throw Error(parsed.error)
  const state = importCraftState(
    catalog,
    'Ruby',
    parsed.item,
    inspectItem(parsed.item, dictionary),
    undefined,
    undefined,
    dictionary.stats?.entries,
  )
  if (!state.ok) throw Error(state.error)
  return state.value
}
function project(): CraftProject {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    ...sourceHashes,
    initialState: imported(),
    operations: [],
    cursor: 0,
  }
}
const restore = (value: unknown, source = catalog) =>
  parseCraftProject(JSON.stringify(value), source, dictionary)
const step = (resultKind: 'prefix' | 'suffix') => ({
  kind: 'liquid-emotion' as const,
  emotionId: ferocity,
  resultKind,
  removeModId: 'JewelFireDamage',
  values: [50],
})
const strategy = {
  maxSteps: 10,
  rules: [
    { conditions: [{ kind: 'always' }], action: { kind: 'liquid-emotion', emotionId: ferocity } },
  ],
}

it('v54 升级恢复版本并拒绝未来 v55', () => {
  expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v54')
  expect(restore({ ...project(), rulesVersion: 'basic-2026-09-12-v55' }).ok).toBe(false)
})

it('Ferocity 双侧全历史重放、撤销和消耗一致，移除后仍保存三个来源', () => {
  for (const [kind, modId] of [
    ['prefix', effectIds[0]],
    ['suffix', effectIds[1]],
  ] as const) {
    const operations = [
      step(kind),
      { currency: 'annulment' as const, modIds: [], removeModId: modId },
    ]
    for (const cursor of [0, 1, 2]) {
      const result = restore({ ...project(), operations, cursor })
      if (!result.ok) throw Error(result.error)
      expect(result.value.states[1]?.affixes).toMatchObject([{ modId, crafted: true }])
      expect(result.value.states[2]?.affixes).toEqual([])
      expect(result.value.project).toMatchObject({ ...sourceHashes, cursor })
      expect(
        parseCraftProject(serializeCraftProject(result.value.project), catalog, dictionary),
      ).toEqual(result)
    }
    expect(collectCraftCosts(catalog, operations)).toMatchObject({
      ok: true,
      value: [
        { id: `emotion:${ferocity}`, count: 1 },
        { id: 'currency:annulment', count: 1 },
      ],
    })
  }
})

it('v2–v52 拒绝 Ferocity 动作、未执行指引、所有 redo 与增效目标引用', () => {
  const p = project()
  for (let version = 2; version <= 52; version++) {
    const legacy = { ...p, rulesVersion: `basic-2026-09-12-v${version}` }
    for (const injected of [
      { operations: [step('prefix')] },
      { strategy },
      { targetModIds: [effectIds[0]] },
      {
        targetModIds: ['JewelFireDamage'],
        targetAlternatives: [{ targetModId: 'JewelFireDamage', modIds: [effectIds[0]] }],
      },
      {
        targetModIds: [effectIds[1]],
        targetValues: [{ modId: effectIds[1], bounds: [{ index: 0, min: 40 }] }],
      },
    ])
      expect(restore({ ...legacy, ...injected }).ok).toBe(false)
  }
})

it('增效起点和原文隐藏增效不能注入旧版，缺来源或坏目录不能恢复', () => {
  for (const id of effectIds) {
    const p = { ...project(), initialState: imported([id, 'JewelFireDamage']) }
    expect(restore(p).ok).toBe(true)
    for (const version of [32, 49, 50, 51, 52]) {
      const legacy = { ...p, rulesVersion: `basic-2026-09-12-v${version}` }
      expect(restore(legacy).ok).toBe(false)
      expect(
        restore({
          ...legacy,
          initialState: { ...p.initialState, affixes: p.initialState.affixes.slice(1) },
        }).ok,
      ).toBe(false)
    }
    for (const hash of Object.keys(sourceHashes)) {
      expect(restore({ ...p, [hash]: undefined }).ok).toBe(false)
      expect(restore({ ...p, [hash]: 'a'.repeat(64) }).ok).toBe(false)
    }
  }
})

it('空目标及未执行策略、仅增效目标、全 redo 都必须核对三个来源', () => {
  const p = project()
  for (const injected of [
    { operations: [step('prefix')] },
    { operations: [step('suffix')], targetModIds: [] },
    { strategy },
    { targetModIds: [effectIds[0]] },
    { targetModIds: [effectIds[1]] },
    {
      strategy: {
        maxSteps: 10,
        rules: [
          {
            conditions: [{ kind: 'selected-targets', modIds: [effectIds[0]], min: 1, value: true }],
            action: { kind: 'stop' },
          },
        ],
      },
    },
  ]) {
    const configured = { ...p, ...injected }
    expect(restore(configured).ok).toBe(true)
    for (const hash of Object.keys(sourceHashes)) {
      expect(restore({ ...configured, [hash]: undefined }).ok, hash).toBe(false)
      expect(restore({ ...configured, [hash]: 'a'.repeat(64) }).ok, hash).toBe(false)
    }
    for (const source of [JEWEL_SOURCE, LIQUID_EMOTION_SOURCE, STAT_SCALABILITY_SOURCE]) {
      const broken = {
        ...catalog,
        _meta: {
          ...catalog._meta,
          sources: catalog._meta.sources.filter((entry) => entry.path !== source.path),
        },
      }
      expect(restore(configured, broken).ok, source.path).toBe(false)
    }
  }
})

it('v50–v52 原有普通液态操作继续恢复，副作用与当前版本相同', () => {
  const p = {
    ...project(),
    scalabilitySourceHash: undefined,
    operations: [
      {
        kind: 'liquid-emotion',
        emotionId: 'Metadata/Items/Currency/DistilledEmotion1',
        removeModId: 'JewelFireDamage',
        values: [20],
      },
    ],
    cursor: 0,
  }
  const current = restore(p)
  expect(current.ok).toBe(true)
  for (const version of [50, 51, 52])
    expect(restore({ ...p, rulesVersion: `basic-2026-09-12-v${version}` })).toEqual(current)
})
