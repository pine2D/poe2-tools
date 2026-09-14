import { expect, it } from 'vitest'
import { catalog, dictionary } from './catalystTestFixture'
import { exportCraftItemText } from './craftItemText'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import type { CraftStep } from './craftSteps'
import { inspectItem } from './export'
import { JEWEL_SOURCE } from './jewels'
import { LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { inspectNumericLines, renderNumericLines } from './numeric'
import { parseItem } from './parse'
import type { CraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'

const contempt = 'Metadata/Items/Currency/EndgameDistilledEmotion3'
const extraSuffix = 'CraftedJewelAdditionalSuffixAllowed'
const extraPrefix = 'CraftedJewelAdditionalPrefixAllowed'
const prefixes = ['JewelFireDamage', 'JewelArmour', 'JewelAreaofEffect'] as const
const suffixes = ['JewelArmourBreakDuration', 'JewelBleedingDuration', 'JewelIgniteChance'] as const

function imported(ids: readonly string[]): CraftState {
  const affixes = ids.map((modId) => {
    const mod = catalog.modifiers.find((entry) => entry.id === modId)
    if (!mod) throw Error('缺少测试词缀')
    const ranges = inspectNumericLines(mod.lines)
    if (!ranges.ok) throw Error(ranges.error)
    const lines = renderNumericLines(
      mod.lines,
      ranges.value.map((range) => range.min),
    )
    if (!lines.ok) throw Error(lines.error)
    return { modId, lines: lines.value, ...(mod.craftedOnly ? { crafted: true as const } : {}) }
  })
  const output = exportCraftItemText(catalog, {
    baseId: 'Ruby',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    affixes,
  })
  if (!output.ok) throw Error(output.error)
  const parsed = parseItem(output.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const result = importCraftState(
    catalog,
    'Ruby',
    parsed.item,
    inspectItem(parsed.item, dictionary),
    undefined,
    undefined,
    dictionary.stats?.entries,
  )
  if (!result.ok) throw Error(result.error)
  return result.value
}

function project(ids: readonly string[] = [prefixes[0]]): CraftProject {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    jewelSourceHash: JEWEL_SOURCE.sha256,
    liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
    initialState: imported(ids),
    operations: [],
    cursor: 0,
  }
}
const restore = (value: unknown, source = catalog) =>
  parseCraftProject(JSON.stringify(value), source, dictionary)
const operation = (resultKind: 'prefix' | 'suffix') => ({
  kind: 'liquid-emotion',
  emotionId: contempt,
  resultKind,
  removeModId: prefixes[0],
  values: [],
})

it('v52 显式双侧结果完整重放并保留撤销位置', () => {
  expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v52')
  for (const [kind, modId] of [
    ['prefix', extraSuffix],
    ['suffix', extraPrefix],
  ] as const) {
    const p = { ...project(), operations: [operation(kind)] }
    for (const cursor of [0, 1]) {
      const result = restore({ ...p, cursor })
      if (!result.ok) throw Error(result.error)
      expect(result.value.states[1]?.affixes).toEqual([
        { modId, lines: catalog.modifiers.find((m) => m.id === modId)?.lines, crafted: true },
      ])
      expect(result.value.project.operations[0]).toMatchObject({ resultKind: kind })
    }
  }
})

it('v2–v51 拒绝增容操作与尚未执行的指引，包括 redo', () => {
  const p = project()
  for (let version = 2; version <= 51; version++) {
    const legacy = { ...p, rulesVersion: `basic-2026-09-12-v${version}` }
    expect(restore({ ...legacy, operations: [operation('prefix')] }).ok).toBe(false)
    expect(
      restore({
        ...legacy,
        strategy: {
          maxSteps: 10,
          rules: [
            {
              conditions: [{ kind: 'always' }],
              action: { kind: 'liquid-emotion', emotionId: contempt },
            },
          ],
        },
      }).ok,
    ).toBe(false)
  }
})

it('双侧步骤必须选择有效侧别，单侧步骤不能携带 resultKind', () => {
  const p = project()
  for (const resultKind of [undefined, null, 'both', 1])
    expect(restore({ ...p, operations: [{ ...operation('prefix'), resultKind }] }).ok).toBe(false)
  for (const resultKind of ['prefix', 'suffix', null]) {
    const step = {
      ...operation('prefix'),
      emotionId: 'Metadata/Items/Currency/DistilledEmotion1',
      values: [10],
      resultKind,
    }
    expect(restore({ ...p, operations: [step] }).ok).toBe(false)
    expect(restore({ ...p, rulesVersion: 'basic-2026-09-12-v51', operations: [step] }).ok).toBe(
      false,
    )
  }
  expect(() =>
    serializeCraftProject({
      ...p,
      operations: [{ ...operation('prefix'), resultKind: undefined }] as unknown as CraftStep[],
    }),
  ).toThrow()
})

it('增容及无工艺的超固有容量起点都需要液态来源，旧版不能借来源原文恢复', () => {
  for (const ids of [
    [extraSuffix],
    [extraPrefix],
    [...prefixes, suffixes[0]],
    [prefixes[0], ...suffixes],
    [...prefixes.slice(0, 2), ...suffixes],
  ]) {
    const p = project(ids)
    expect(restore(p).ok).toBe(true)
    for (const hash of [undefined, 'a'.repeat(64)])
      expect(restore({ ...p, liquidEmotionSourceHash: hash }).ok).toBe(false)
    for (const version of [32, 49, 50, 51])
      expect(restore({ ...p, rulesVersion: `basic-2026-09-12-v${version}` }).ok).toBe(false)
    if (ids.length > 2) {
      const hidden = { ...p.initialState, affixes: p.initialState.affixes.slice(0, 2) }
      expect(restore({ ...p, initialState: hidden, liquidEmotionSourceHash: undefined }).ok).toBe(
        false,
      )
      expect(restore({ ...p, initialState: hidden, rulesVersion: 'basic-2026-09-12-v51' }).ok).toBe(
        false,
      )
    }
    expect(
      restore(p, {
        ...catalog,
        _meta: {
          ...catalog._meta,
          sources: catalog._meta.sources.filter(
            (source) => source.path !== LIQUID_EMOTION_SOURCE.path,
          ),
        },
      }).ok,
    ).toBe(false)
  }
})

it('v52 增容目标和普通三同侧目标需要液态来源，v51 只保留固有容量可达的部分目标', () => {
  const p = project()
  for (const targetModIds of [
    [extraSuffix],
    [extraPrefix],
    prefixes,
    suffixes,
    [...prefixes.slice(0, 2), ...suffixes],
  ]) {
    const target = { ...p, targetModIds }
    expect(restore(target).ok).toBe(true)
    expect(restore({ ...target, liquidEmotionSourceHash: undefined }).ok).toBe(false)
    expect(restore({ ...target, rulesVersion: 'basic-2026-09-12-v51' }).ok).toBe(false)
  }
  expect(
    restore({
      ...p,
      rulesVersion: 'basic-2026-09-12-v51',
      liquidEmotionSourceHash: undefined,
      targetModIds: prefixes,
      minimumTargetCount: 2,
    }).ok,
  ).toBe(true)
})

it('移除增容后保留的第三条属性可回放，非法未来混沌仍拒绝', () => {
  const p = project([extraSuffix, prefixes[0], ...suffixes])
  const retained = { currency: 'annulment', modIds: [], removeModId: extraSuffix }
  const result = restore({ ...p, operations: [retained], cursor: 0 })
  if (!result.ok) throw Error(result.error)
  expect(result.value.states[1]?.affixes).toHaveLength(4)
  expect(result.value.states[1]?.affixes.some((affix) => affix.crafted)).toBe(false)
  expect(
    restore({
      ...p,
      operations: [
        retained,
        { currency: 'chaos', modIds: [suffixes[0]], removeModId: suffixes[0] },
      ],
    }).ok,
  ).toBe(false)
})

it('从空白起点生成五条属性再移除增容，全部 redo 仍核对来源与版本', () => {
  const p = project()
  const input = {
    ...p,
    initialState: {
      baseId: 'Ruby',
      itemLevel: 86,
      rarity: 'normal',
      sourceText: null,
      affixes: [],
    },
    operations: [
      { currency: 'alchemy', modIds: [...prefixes.slice(0, 2), ...suffixes.slice(0, 2)] },
      operation('prefix'),
      { currency: 'exalted', modIds: [suffixes[2]] },
      { currency: 'annulment', modIds: [], removeModId: extraSuffix },
    ],
  }
  const result = restore(input)
  if (!result.ok) throw Error(result.error)
  expect(result.value.states.map((state) => state.affixes.length)).toEqual([0, 4, 4, 5, 4])
  expect(result.value.project.liquidEmotionSourceHash).toBe(LIQUID_EMOTION_SOURCE.sha256)
  expect(restore({ ...input, liquidEmotionSourceHash: undefined }).ok).toBe(false)
  expect(restore({ ...input, rulesVersion: 'basic-2026-09-12-v51' }).ok).toBe(false)
})

it('旧项目正常多替代档位不累计容量，新增容替代项不能注入旧项目', () => {
  const primary = catalog.modifiers.find((mod) => mod.id === prefixes[0])
  if (!primary) throw Error('缺少测试主目标')
  const alternatives = [1, 2, 3].map((index) => ({
    ...primary,
    id: `CapacityTestAlternative${index}`,
  }))
  const source = { ...catalog, modifiers: [...catalog.modifiers, ...alternatives] }
  const p = {
    ...project(),
    liquidEmotionSourceHash: undefined,
    rulesVersion: 'basic-2026-09-12-v51',
    initialState: {
      baseId: 'Ruby',
      itemLevel: 86,
      rarity: 'normal',
      sourceText: null,
      affixes: [],
    },
    targetModIds: [...prefixes.slice(0, 2), ...suffixes.slice(0, 2)],
    targetAlternatives: [{ targetModId: prefixes[0], modIds: alternatives.map((mod) => mod.id) }],
  }
  expect(restore(p, source).ok).toBe(true)
  expect(
    restore(
      { ...p, targetAlternatives: [{ targetModId: prefixes[0], modIds: [extraSuffix] }] },
      source,
    ).ok,
  ).toBe(false)
})

it('v50 和 v51 普通液态历史仍可恢复升级', () => {
  for (const version of [50, 51]) {
    const p = {
      ...project(),
      rulesVersion: `basic-2026-09-12-v${version}`,
      operations: [
        {
          kind: 'liquid-emotion',
          emotionId: 'Metadata/Items/Currency/DistilledEmotion1',
          removeModId: prefixes[0],
          values: [10],
        },
      ],
    }
    const result = restore(p)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.project.rulesVersion).toBe('basic-2026-09-12-v52')
  }
})
