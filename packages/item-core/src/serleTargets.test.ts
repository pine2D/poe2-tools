import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import { addCraftAffix, type CraftResult, type CraftState, craftCandidates } from './rehearsal'
import { editTargetDefinitionContext, readTargetDefinitionContext } from './targetDefinitionContext'
import { validateTargetDefinitions } from './targetDefinitions'
import { extractTargetDefinitions } from './targetExtraction'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
function must<T>(r: CraftResult<T>): T {
  if (!r.ok) throw Error(r.error)
  return r.value
}
function full(): CraftState {
  let state: CraftState = {
    baseId: 'Twig Focus',
    rarity: 'rare',
    itemLevel: 86,
    sourceText: null,
    sockets: [null],
    affixes: [],
  }
  state = must(
    applyCraftStep(catalog, state, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: 'pob2:augment:["Serle\u0027s Triumph","armour"]',
    }),
  )
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
  return state
}
it('七组装备提取目标、编辑、持久化上下文和匹配保留Serle来源', () => {
  const state = full()
  const definitions = must(
    extractTargetDefinitions(
      catalog,
      state,
      state.affixes.map((a) => a.modId),
      false,
      false,
    ),
  )
  expect(definitions.targets).toHaveLength(7)
  expect(validateTargetDefinitions(catalog, state, definitions).ok).toBe(true)
  const context = { definitions, orphanedTargets: [] }
  expect(readTargetDefinitionContext(catalog, state.baseId, context, state).ok).toBe(true)
  expect(
    editTargetDefinitionContext(catalog, state, context, { kind: 'minimum', count: 7 }).ok,
  ).toBe(true)
  expect(readTargetDefinitionContext(catalog, state.baseId, context).ok).toBe(false)
})
it('已有腐化Serle第三孔的容量上下文不丢失腐化孔资格', () => {
  const state = {
    ...full(),
    corrupted: true as const,
    sockets: ['pob2:augment:["Serle\u0027s Triumph","armour"]', null, null],
  }
  const definitions = must(
    extractTargetDefinitions(
      catalog,
      state,
      state.affixes.map((a) => a.modId),
      false,
      false,
    ),
  )
  expect(
    readTargetDefinitionContext(catalog, state.baseId, { definitions, orphanedTargets: [] }, state)
      .ok,
  ).toBe(true)
})
