import { expect, it } from 'vitest'
import { desecrationCandidates } from './boneCraft'
import { inspectModPool } from './catalog'
import { catalog, dictionary } from './catalystTestFixture'
import { collectCraftCosts } from './craftCosts'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { DESECRATION_SOURCE } from './desecration'
import { JEWEL_SOURCE } from './jewels'
import { prepareLiquidEmotionCraft } from './liquidEmotionCraft'
import { inspectLiquidEmotions, LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { liquidRouteContext } from './liquidRouteCandidates'
import { craftModsConflict } from './modConflicts'
import { inspectNumericLines } from './numeric'
import type { CraftResult, CraftState } from './rehearsal'
import { checkCraftStrategyAction } from './strategyActions'

const must = <T>(r: CraftResult<T>): T => {
  if (!r.ok) throw Error(r.error)
  return r.value
}
function fixture(baseId = 'Time-Lost Sapphire') {
  const base = catalog.bases.find((entry) => entry.id === baseId)
  if (!base) throw Error('缺少基底')
  const emotionId = `Metadata/Items/Currency/EndgameDistilledEmotion${baseId.startsWith('Time-Lost') ? 'TimeLost' : ''}1`
  const guaranteed = inspectLiquidEmotions(catalog, base).find(
    (entry) => entry.emotion.id === emotionId,
  )?.outcomes[0]
  if (!guaranteed) throw Error('缺少工艺')
  const pool = inspectModPool(base, catalog.modifiers, 86)
    .map((entry) => entry.mod)
    .filter((mod) => !craftModsConflict(mod, guaranteed))
  const prefix = pool.find((mod) => mod.kind === 'prefix')
  const suffix = pool.find((mod) => mod.kind === 'suffix')
  if (!prefix || !suffix) throw Error('缺少词缀')
  const initial: CraftState = {
    baseId,
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
  }
  const preparation: CraftStep[] = [
    { currency: 'transmutation', modIds: [prefix.id] },
    { currency: 'regal', modIds: [suffix.id] },
    {
      kind: 'desecrate',
      boneId: 'preserved_cranium',
      affixKind: 'prefix',
      directionOmen: 'sinistral_necromancy',
    },
  ]
  const pending = preparation.reduce(
    (state, step) => must(applyCraftStep(catalog, state, step)),
    initial,
  )
  const prepared = must(prepareLiquidEmotionCraft(catalog, pending, emotionId))
  const removed = prepared.removableAffixes[0]
  if (!removed) throw Error('缺少可移除词缀')
  const operation: CraftStep = {
    kind: 'liquid-emotion',
    emotionId,
    removeModId: removed.modId,
    values: [],
  }
  return { initial, preparation, pending, operation, mod: prepared.mod }
}

it.each([
  'Ruby',
  'Emerald',
  'Sapphire',
  'Time-Lost Ruby',
  'Time-Lost Emerald',
  'Time-Lost Sapphire',
  'Time-Lost Diamond',
])('%s 未固定候选时可保留占位补液态工艺，再完成揭示', (baseId) => {
  const { pending, operation, mod } = fixture(baseId)
  const original = structuredClone(pending)
  const crafted = must(applyCraftStep(catalog, pending, operation))
  expect(pending).toEqual(original)
  expect(crafted.pendingDesecration).toEqual(pending.pendingDesecration)
  expect(crafted.affixes.find((affix) => affix.modId === mod.id)).toMatchObject({ crafted: true })
  const ids = desecrationCandidates(catalog, crafted)
    .filter((entry) => entry.desecratedOnly)
    .slice(0, 3)
    .map((entry) => entry.id)
  const offered = must(
    applyCraftStep(catalog, crafted, {
      kind: 'desecration-offer',
      modIds: ids,
      revealOmen: 'abyssal_echoes',
    }),
  )
  const target = desecrationCandidates(catalog, offered).find((entry) => ids.includes(entry.id))
  if (!target) throw Error('缺少揭示候选')
  const ranges = must(inspectNumericLines(target.lines))
  const revealed = must(
    applyCraftStep(catalog, offered, {
      kind: 'desecration-reveal',
      modId: target.id,
      values: ranges.map((range) => range.min),
    }),
  )
  expect(revealed.pendingDesecration).toBeUndefined()
  expect(revealed.affixes.find((affix) => affix.modId === mod.id)?.crafted).toBe(true)
  expect(offered.pendingDesecration?.revealOmen).toBe('abyssal_echoes')
  expect(collectCraftCosts(catalog, [operation])).toMatchObject({ ok: true, value: [{ count: 1 }] })
})

it('固定首组后不放行再加工，其他通货与伪造占位移除也不放行', () => {
  const { pending, operation } = fixture()
  const ids = desecrationCandidates(catalog, pending)
    .slice(0, 3)
    .map((mod) => mod.id)
  const offered = must(applyCraftStep(catalog, pending, { kind: 'desecration-offer', modIds: ids }))
  if (!('kind' in operation) || operation.kind !== 'liquid-emotion') throw Error('缺少液态步骤')
  const action = { kind: 'liquid-emotion' as const, emotionId: operation.emotionId }
  expect(checkCraftStrategyAction(catalog, pending, action).ok).toBe(true)
  expect(checkCraftStrategyAction(catalog, offered, action).ok).toBe(false)
  expect(prepareLiquidEmotionCraft(catalog, offered, operation.emotionId).ok).toBe(false)
  expect(applyCraftStep(catalog, offered, operation).ok).toBe(false)
  expect(
    applyCraftStep(catalog, pending, { ...operation, removeModId: 'pendingDesecration' }).ok,
  ).toBe(false)
  expect(
    applyCraftStep(catalog, pending, {
      currency: 'annulment',
      modIds: [],
      removeModId: operation.removeModId,
    }).ok,
  ).toBe(false)
})

it('待揭示液态目标生成可直接执行的候选，并在旧版完整未来历史中拒绝新交互', () => {
  const { initial, preparation, pending, operation, mod } = fixture()
  const context = liquidRouteContext(catalog, pending, [[mod.id]], [])
  const candidates = [...context.candidates(pending)]
  expect(candidates.length).toBeGreaterThan(0)
  expect(candidates.every(({ operation }) => applyCraftStep(catalog, pending, operation).ok)).toBe(
    true,
  )
  const project = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    jewelSourceHash: JEWEL_SOURCE.sha256,
    desecrationSourceHash: DESECRATION_SOURCE.sha256,
    liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
    initialState: initial,
    operations: [...preparation, operation],
    cursor: 0,
  }
  expect(parseCraftProject(JSON.stringify(project), catalog, dictionary).ok).toBe(true)
  expect(
    parseCraftProject(
      JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-12-v71' }),
      catalog,
      dictionary,
    ).ok,
  ).toBe(false)
})
