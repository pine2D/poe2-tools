import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { applyCraftStep, type CraftStep } from './craftSteps'
import {
  type DefinitionCraftStrategy,
  definitionStrategyStageAt,
  evaluateDefinitionCraftStrategy,
} from './definitionStrategy'
import { addCraftAffix, type CraftResult, type CraftState, craftCandidates } from './rehearsal'
import { analyzeTargetDefinitions } from './targetDefinitionAdvice'
import { extractTargetDefinitions } from './targetExtraction'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const augmentId = 'pob2:augment:["Serle\'s Triumph","armour"]'
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function fixture(baseId = 'Twig Focus', activeCatalog = catalog) {
  const before: CraftState = {
    baseId,
    rarity: 'rare',
    itemLevel: 86,
    sourceText: null,
    affixes: [],
    sockets: [null],
  }
  const step: CraftStep = { kind: 'socket', socketIndex: 0, augmentId }
  const after = must(applyCraftStep(activeCatalog, before, step))
  let full = after
  for (let i = 0; i < 4; i++) {
    const mod = craftCandidates(activeCatalog, full).find((m) => m.kind === 'suffix')
    if (!mod) throw Error('后缀候选缺失')
    full = must(addCraftAffix(activeCatalog, full, mod.id))
  }
  const definitions = must(
    extractTargetDefinitions(
      activeCatalog,
      full,
      full.affixes.map((a) => a.modId),
      false,
      false,
    ),
  )
  const strategy: DefinitionCraftStrategy = {
    maxSteps: 4,
    flow: {
      entryStageId: 'socket',
      stages: [
        { id: 'socket', name: '镶入' },
        { id: 'done', name: '完成' },
      ],
    },
    rules: [
      {
        stageId: 'socket',
        nextStageId: 'done',
        conditions: [{ kind: 'always' }],
        action: { kind: 'socket', socketIndex: 'first-empty', augmentId },
      },
      { stageId: 'done', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
    ],
  }
  return { before, after, full, step, definitions, strategy }
}
it('真实未来Serle保留容量资格，起点数值与实际首步仍使用当前状态', () => {
  const { before, after, step, definitions, strategy } = fixture()
  for (const cursor of [0, 1])
    expect(
      definitionStrategyStageAt(catalog, [before, after], [step], strategy, 0, cursor, {
        definitions,
      }),
    ).toEqual({ ok: true, value: cursor === 0 ? 'socket' : 'done' })
  expect(
    evaluateDefinitionCraftStrategy(catalog, before, strategy, 0, { definitions }, 'socket', after),
  ).toMatchObject({ ok: true, value: { kind: 'action', action: { kind: 'socket' } } })
  expect(analyzeTargetDefinitions(catalog, before, definitions, undefined, [], after).ok).toBe(true)
  expect(before.sockets).toEqual([null])
})
it('伪造未来孔位或篡改操作不能成为阶段容量来源', () => {
  const { before, after, definitions, strategy } = fixture()
  expect(
    definitionStrategyStageAt(
      catalog,
      [before, after],
      [{ kind: 'socket', socketIndex: 0, augmentId: 'pob2:augment:["Lesser Iron Rune","armour"]' }],
      strategy,
      0,
      0,
      { definitions },
    ).ok,
  ).toBe(false)
  expect(
    definitionStrategyStageAt(catalog, [before, after], [], strategy, 0, 0, { definitions }).ok,
  ).toBe(false)
  expect(evaluateDefinitionCraftStrategy(catalog, before, strategy, 0, { definitions }).ok).toBe(
    false,
  )
  expect(analyzeTargetDefinitions(catalog, before, definitions).ok).toBe(false)
})

it('未来四后缀已达成不代替当前目标匹配，也不修改当前数值上下文', () => {
  const { before, full, definitions, strategy } = fixture()
  const withStop: DefinitionCraftStrategy = {
    maxSteps: 4,
    rules: [
      { conditions: [{ kind: 'targets-met', value: true }], action: { kind: 'stop' } },
      { conditions: [{ kind: 'always' }], action: strategy.rules[0]?.action ?? { kind: 'stop' } },
    ],
  }
  expect(
    evaluateDefinitionCraftStrategy(catalog, before, withStop, 0, { definitions }, undefined, full),
  ).toMatchObject({ ok: true, value: { kind: 'action' } })
  expect(
    must(analyzeTargetDefinitions(catalog, before, definitions, undefined, [], full)).progress
      .matches,
  ).toHaveLength(0)
  const forged = { ...full, sockets: [augmentId, augmentId] }
  expect(analyzeTargetDefinitions(catalog, before, definitions, undefined, [], forged).ok).toBe(
    false,
  )
})
it('真实锻造后Serle容量可用于前退阶段，实际首步仍锻造原基底', () => {
  const loaded = {
    ...catalog,
    runeforging: JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8')),
  }
  const { before, after, step, definitions, strategy } = fixture(
    'Runeforged Adherent Cuffs',
    loaded,
  )
  const initial: CraftState = { ...before, baseId: 'Adherent Cuffs' }
  const runeforge: CraftStep = {
    kind: 'runeforge',
    fromBaseId: initial.baseId,
    toBaseId: before.baseId,
  }
  const forged = must(applyCraftStep(loaded, initial, runeforge))
  const input: DefinitionCraftStrategy = {
    ...strategy,
    flow: {
      entryStageId: 'forge',
      stages: [{ id: 'forge', name: '锻造' }, ...(strategy.flow?.stages ?? [])],
    },
    rules: [
      {
        stageId: 'forge',
        nextStageId: 'socket',
        conditions: [{ kind: 'always' }],
        action: { kind: 'runeforge' },
      },
      ...strategy.rules,
    ],
  }
  for (const cursor of [0, 1, 2])
    expect(
      definitionStrategyStageAt(
        loaded,
        [initial, forged, after],
        [runeforge, step],
        input,
        0,
        cursor,
        { definitions },
      ),
    ).toEqual({ ok: true, value: ['forge', 'socket', 'done'][cursor] })
  expect(
    evaluateDefinitionCraftStrategy(loaded, initial, input, 0, { definitions }, 'forge', after),
  ).toMatchObject({ ok: true, value: { kind: 'action', action: { kind: 'runeforge' } } })
})

it('混合萃取后的摧毁终态不能覆盖阶段使用的真实Serle容量来源', () => {
  const { after, definitions } = fixture()
  const initial: CraftState = {
    ...after,
    sockets: [augmentId, 'pob2:augment:["Lesser Iron Rune","armour"]'],
  }
  const extraction: CraftStep = { kind: 'extraction' }
  const destroyed = must(applyCraftStep(catalog, initial, extraction))
  const strategy: DefinitionCraftStrategy = {
    maxSteps: 4,
    flow: { entryStageId: 'done', stages: [{ id: 'done', name: '完成' }] },
    rules: [{ stageId: 'done', conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
  }
  for (const cursor of [0, 1])
    expect(
      definitionStrategyStageAt(catalog, [initial, destroyed], [extraction], strategy, 0, cursor, {
        definitions,
      }),
    ).toEqual({ ok: true, value: 'done' })
  expect(destroyed.destroyed).toBe(true)
})
