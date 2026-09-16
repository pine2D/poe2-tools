import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import { analyzeEssenceTargetContext } from './essenceAdvice'
import { addCraftAffix, type CraftState, craftCandidates } from './rehearsal'
import { checkCraftStrategyAction } from './strategyActions'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const essenceId = 'Metadata/Items/Currency/CurrencyPerfectEssenceAttribute'
function fixture() {
  const start: CraftState = {
    baseId: 'Amber Amulet',
    rarity: 'rare',
    itemLevel: 86,
    affixes: [],
    sourceText: null,
  }
  const mod = craftCandidates(catalog, start).find((m) => m.kind === 'prefix')
  if (!mod) throw Error('缺少前缀')
  const state = addCraftAffix(catalog, start, mod.id)
  if (!state.ok) throw Error(state.error)
  return state.value
}
it.each(['Strength', 'Dexterity', 'Intelligence'])(
  '为%s目标生成精确结果操作并实际回放',
  (attribute) => {
    const state = fixture()
    const modId = `EssencePercent${attribute}1`
    const advice = analyzeEssenceTargetContext(catalog, state, [modId])
    expect(advice.ok).toBe(true)
    if (!advice.ok) throw Error(advice.error)
    expect(advice.value.length).toBeGreaterThan(0)
    for (const entry of advice.value) {
      expect(entry.operation).toMatchObject({ essenceId, resultModId: modId })
      const result = applyCraftStep(catalog, state, entry.operation)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.affixes.some((a) => a.modId === modId)).toBe(true)
    }
  },
)
it('材料级条件指引可进入多结果选择', () => {
  expect(checkCraftStrategyAction(catalog, fixture(), { kind: 'essence', essenceId }).ok).toBe(true)
})

import { analyzeEssencePreparationContext } from './essencePreparation'

it.each(['normal', 'magic'] as const)('%s项链可准备升级后使用三分支精华', (rarity) => {
  let state: CraftState = { ...fixture(), rarity, affixes: [] }
  const result = analyzeEssencePreparationContext(catalog, state, ['EssencePercentIntelligence1'])
  expect(result.ok).toBe(true)
  if (!result.ok) throw Error(result.error)
  const route = result.value.routes[0]
  expect(route).toBeDefined()
  if (!route) throw Error('缺少路线')
  for (const op of [...route.preparations, route.final.operation]) {
    const applied = applyCraftStep(catalog, state, op)
    if (!applied.ok) throw Error(applied.error)
    state = applied.value
  }
  expect(state.affixes.some((a) => a.modId === 'EssencePercentIntelligence1')).toBe(true)
})

import { planCraftTargetRoutes } from './targetRoutes'

it('已有其他工艺可先剥离再接完美无限结果，路线逐步可回放', () => {
  let state = fixture()
  const first = state.affixes[0]
  if (!first) throw Error('缺少词缀')
  const made = applyCraftStep(catalog, state, {
    kind: 'essence',
    essenceId,
    resultModId: 'EssencePercentStrength1',
    removeModId: first.modId,
    values: [7],
  })
  if (!made.ok) throw Error(made.error)
  state = made.value
  // 再加一组普通前缀，让移除旧工艺后完美精华仍有可移除对象。
  const ordinary = craftCandidates(catalog, state).find((m) => m.kind === 'prefix')
  if (!ordinary) throw Error('缺少普通词缀')
  const added = addCraftAffix(catalog, state, ordinary.id)
  if (!added.ok) throw Error(added.error)
  state = added.value
  const routes = planCraftTargetRoutes(catalog, state, ['EssencePercentIntelligence1'], [], [], {
    maxStates: 128,
    maxDepth: 3,
  })
  if (!routes.ok) throw Error(routes.error)
  expect(routes.value.routes.length).toBeGreaterThan(0)
  for (const route of routes.value.routes) {
    let replay = state
    for (const step of route.steps) {
      const next = applyCraftStep(catalog, replay, step.operation)
      if (!next.ok) throw Error(next.error)
      replay = next.value
    }
    expect(replay.affixes.some((a) => a.modId === 'EssencePercentIntelligence1')).toBe(true)
  }
})
