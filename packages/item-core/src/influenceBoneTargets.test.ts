import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { analyzeBoneTargets } from './boneAdvice'
import { desecrationCandidates } from './boneCraft'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { inspectItem } from './export'
import { inspectNumericLines } from './numeric'
import { parseItem } from './parse'
import {
  type CraftResult,
  type CraftState,
  craftCandidates,
  prepareCraftOperation,
} from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { planCraftTargetRoutes } from './targetRoutes'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const cases = [
  [
    'Vile Robe',
    "Medved's Tending",
    'body armour',
    'SoulInfluenceManaDefencesHybridEnergyShield',
    'preserved_rib',
  ],
  ['Adherent Cuffs', "Katla's Gloom", 'gloves', 'DecayInfluenceFasterLeech1', 'preserved_rib'],
  [
    'Wicker Tiara',
    "Vorana's Carnage",
    'helmet',
    'BerserkInfluenceRageCostEfficiency2',
    'preserved_rib',
  ],
  [
    'Wrapped Sandals',
    "Uhtred's Sidereus",
    'boots',
    'TimeInfluenceCooldownRecovery1',
    'preserved_rib',
  ],
  [
    'Adherent Cuffs',
    "Kolr's Hunt",
    'gloves',
    'MarksmanInfluenceProjectileDamage1',
    'preserved_rib',
  ],
  [
    'Crude Bow',
    "Thrud's Might",
    'weapon',
    'DestructionInfluenceSpeedModifierEffect',
    'preserved_jawbone',
  ],
] as const
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function prepare(entry: readonly [string, string, string, ...unknown[]]) {
  const [baseId, name, category] = entry
  let state: CraftState = {
    baseId,
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    sockets: [null],
    sourceText: null,
  }
  const operations: CraftStep[] = [
    {
      kind: 'socket',
      socketIndex: 0,
      augmentId: `pob2:augment:${JSON.stringify([name, category])}`,
    },
  ]
  state = must(applyCraftStep(catalog, state, operations[0] as CraftStep))
  for (const currency of ['transmutation', 'regal'] as const) {
    const mod = craftCandidates(
      catalog,
      must(prepareCraftOperation(catalog, state, currency)).state,
      currency,
    ).find((mod) => !mod.id.includes('Influence'))
    if (!mod) throw new Error('缺少普通候选')
    const step = { currency, modIds: [mod.id] }
    state = must(applyCraftStep(catalog, state, step))
    operations.push(step)
  }
  return { state, operations }
}
it.each(cases)('%s 来源骨骼建议与有限路线均可回放并保留已有目标', (...entry) => {
  const { state } = prepare(entry)
  const wanted = entry[3]
  const protectedId = state.affixes[0]?.modId
  if (!protectedId) throw new Error('缺少已有属性')
  const pending = must(
    applyCraftStep(catalog, state, {
      kind: 'desecrate',
      boneId: entry[4],
      affixKind: catalog.modifiers.find((mod) => mod.id === wanted)?.kind ?? 'prefix',
    }),
  )
  expect(desecrationCandidates(catalog, pending).some((mod) => mod.id === wanted)).toBe(true)
  const advice = must(analyzeBoneTargets(catalog, pending, [protectedId, wanted]))
  expect(advice.length).toBeGreaterThan(0)
  for (const step of advice) expect(applyCraftStep(catalog, pending, step.operation).ok).toBe(true)
  const routes = must(
    planCraftTargetRoutes(catalog, pending, [protectedId, wanted], [], [], {
      maxDepth: 2,
      maxStates: 12,
    }),
  )
  expect(routes.routes.length).toBeGreaterThan(0)
  for (const route of routes.routes) {
    let current = pending
    for (const step of route.steps) {
      current = must(applyCraftStep(catalog, current, step.operation))
      expect(current.affixes.some((affix) => affix.modId === protectedId)).toBe(true)
    }
    expect(current.pendingDesecration).toBeUndefined()
    expect(current.affixes.some((affix) => affix.modId === wanted && affix.desecrated)).toBe(true)
    expect(
      must(
        collectCraftCosts(
          catalog,
          route.steps.map((step) => step.operation),
        ),
      ),
    ).toEqual([])
  }
})
it.each(cases)('%s 三候选揭示后光明剥离并重新制作，骨骼与预兆不重复收费', (...entry) => {
  const prepared = prepare(entry)
  let current = prepared.state
  const wanted = entry[3]
  const operations = [...prepared.operations]
  const run = (step: CraftStep) => {
    const input = current
    const before = structuredClone(input)
    current = must(applyCraftStep(catalog, input, step))
    expect(input).toEqual(before)
    operations.push(step)
  }
  const kind = catalog.modifiers.find((mod) => mod.id === wanted)?.kind ?? 'prefix'
  run({
    kind: 'desecrate',
    boneId: entry[4],
    affixKind: kind,
    directionOmen: kind === 'prefix' ? 'sinistral_necromancy' : 'dextral_necromancy',
  })
  const pool = desecrationCandidates(catalog, current)
  const selected = pool.find((mod) => mod.id === wanted)
  if (!selected) throw new Error('来源词缀不在候选中')
  const others = pool
    .filter((mod) => mod.id !== wanted)
    .slice(0, 2)
    .map((mod) => mod.id)
  run({ kind: 'desecration-offer', modIds: [wanted, ...others] })
  const numbers = must(inspectNumericLines(selected.lines))
  run({ kind: 'desecration-reveal', modId: wanted, values: numbers.map((slot) => slot.min) })
  for (const locale of ['en', 'zh-CN', 'zh-TW'] as const) {
    const dictionary = createCraftItemDictionary(
      catalog,
      locale === 'en'
        ? {}
        : {
            items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
            stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
          },
    )
    const text = must(exportCraftItemText(catalog, current, { locale, dictionary })).text
    const parsed = parseItem(text)
    if (!parsed.ok) throw Error(parsed.error)
    const restored = must(
      importIdentifiedCraftState(
        catalog,
        current.baseId,
        parsed.item,
        inspectItem(parsed.item, dictionary),
        current.sockets,
        undefined,
        dictionary.stats?.entries,
      ),
    )
    expect(restored.affixes.find((affix) => affix.modId === wanted)).toMatchObject({
      desecrated: true,
      lines: current.affixes.find((affix) => affix.modId === wanted)?.lines,
    })
  }
  run({ currency: 'annulment', omen: 'light', modIds: [], removeModId: wanted })
  expect(current.affixes.some((affix) => affix.modId === wanted)).toBe(false)
  run({ kind: 'desecrate', boneId: entry[4], affixKind: kind })
  const costs = must(collectCraftCosts(catalog, operations))
  expect(costs).toContainEqual(expect.objectContaining({ id: `bone:${entry[4]}`, count: 2 }))
  expect(costs).toContainEqual(expect.objectContaining({ id: 'currency:annulment', count: 1 }))
})
