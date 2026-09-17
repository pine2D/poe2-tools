import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { desecrationCandidates, prepareDesecration } from './boneCraft'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { inspectItem } from './export'
import { inspectNumericLines } from './numeric'
import { parseItem } from './parse'
import { preparePutrefaction } from './putrefaction'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { planCraftTargetRoutes } from './targetRoutes'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const cases = [
  [
    'Vile Robe',
    "Medved's Tending",
    'body armour',
    'SoulInfluenceManaDefencesHybridEnergyShield',
    'prefix',
  ],
  ['Adherent Cuffs', "Katla's Gloom", 'gloves', 'DecayInfluenceFasterLeech1', 'suffix'],
  ['Wicker Tiara', "Vorana's Carnage", 'helmet', 'BerserkInfluenceRageCostEfficiency2', 'prefix'],
] as const
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function start(baseId: string, name: string, category: string): CraftState {
  return {
    baseId,
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    affixes: [],
    sockets: [`pob2:augment:${JSON.stringify([name, category])}`],
    nextAffixId: 1,
  }
}
function reveal(state: CraftState, target: string): CraftState {
  const pool = desecrationCandidates(catalog, state)
  const wanted = pool.find((mod) => mod.id === target)
  if (!wanted) throw Error(`缺少候选 ${target}`)
  const others = pool.filter((mod) => mod.id !== target).slice(0, 2)
  const offered = must(
    applyCraftStep(catalog, state, {
      kind: 'desecration-offer',
      modIds: [target, ...others.map((mod) => mod.id)],
    }),
  )
  return must(
    applyCraftStep(catalog, offered, {
      kind: 'desecration-reveal',
      modId: target,
      values: must(inspectNumericLines(wanted.lines)).map((value) => value.min),
    }),
  )
}
it.each(cases)(
  '%s 普通骨骼、三语高级回读与光明重试保持真实来源',
  (baseId, name, category, target, kind) => {
    const initial = start(baseId, name, category)
    const before = structuredClone(initial)
    const pending = must(
      applyCraftStep(catalog, initial, {
        kind: 'desecrate',
        boneId: 'ancient_rib',
        affixKind: kind,
      }),
    )
    const completed = reveal(pending, target)
    expect(completed.affixes[0]).toMatchObject({ modId: target, desecrated: true })
    expect(createCraftState(catalog, { ...completed, sockets: [null] }).ok).toBe(false)
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
      const text = must(exportCraftItemText(catalog, completed, { locale, dictionary })).text
      const parsed = parseItem(text)
      if (!parsed.ok) throw Error(parsed.error)
      const imported = must(
        importIdentifiedCraftState(
          catalog,
          baseId,
          parsed.item,
          inspectItem(parsed.item, dictionary),
          completed.sockets,
          undefined,
          dictionary.stats?.entries,
        ),
      )
      expect(imported.affixes[0]).toMatchObject({
        modId: target,
        desecrated: true,
        lines: completed.affixes[0]?.lines,
      })
    }
    const cleared = must(
      applyCraftStep(catalog, completed, {
        currency: 'annulment',
        omen: 'light',
        modIds: [],
        removeModId: target,
      }),
    )
    expect(prepareDesecration(catalog, cleared, 'preserved_rib').ok).toBe(true)
    expect(initial).toEqual(before)
  },
)

it('Vorana 腐烂六槽连续揭示可以包含专属属性，保留绑定且只计一次材料', () => {
  const initial = start('Wicker Tiara', "Vorana's Carnage", 'helmet')
  let current = initial
  const operations: CraftStep[] = []
  const run = (step: CraftStep) => {
    const before = structuredClone(current)
    const input = current
    current = must(applyCraftStep(catalog, current, step))
    expect(input).toEqual(before)
    operations.push(step)
  }
  run({ kind: 'putrefy', boneId: 'preserved_rib' })
  expect(current).toMatchObject({
    corrupted: true,
    pendingDesecration: { putrefaction: { prefix: 3, suffix: 3 } },
  })
  for (let slot = 0; slot < 6; slot++) {
    const pool = desecrationCandidates(catalog, current)
    expect(pool.some((mod) => mod.desecratedOnly)).toBe(false)
    const wanted =
      slot === 0 ? pool.find((mod) => mod.id === 'BerserkInfluenceRageCostEfficiency2') : pool[0]
    if (!wanted) throw Error('缺少揭示候选')
    run({
      kind: 'desecration-offer',
      modIds: [
        wanted.id,
        ...pool
          .filter((mod) => mod.id !== wanted.id)
          .slice(0, 2)
          .map((mod) => mod.id),
      ],
    })
    run({
      kind: 'desecration-reveal',
      modId: wanted.id,
      values: must(inspectNumericLines(wanted.lines)).map((slot) => slot.min),
    })
  }
  expect(current.affixes).toHaveLength(6)
  expect(current.affixes.every((affix) => !affix.desecrated)).toBe(true)
  expect(current.pendingDesecration).toBeUndefined()
  expect(current.sockets).toEqual(initial.sockets)
  expect(current.affixes[0]?.modId).toBe('BerserkInfluenceRageCostEfficiency2')
  expect(createCraftState(catalog, { ...current, sockets: [null] }).ok).toBe(false)
  expect(prepareDesecration(catalog, current, 'preserved_rib').ok).toBe(false)
  const costs = must(collectCraftCosts(catalog, operations))
  expect(costs).toHaveLength(2)
  expect(costs.every((cost) => cost.count === 1)).toBe(true)
})

it('其余影响腐烂、巫妖和回响不因普通来源开放而放行', () => {
  for (const [baseId, name, category] of cases.slice(0, 2))
    expect(preparePutrefaction(catalog, start(baseId, name, category), 'preserved_rib').ok).toBe(
      false,
    )
  for (const [baseId, name, category, , kind] of cases) {
    const initial = start(baseId, name, category)
    expect(prepareDesecration(catalog, initial, 'preserved_rib', { lichOmen: 'liege' }).ok).toBe(
      false,
    )
    expect(
      createCraftState(catalog, {
        ...initial,
        pendingDesecration: {
          boneId: 'preserved_rib',
          kind,
          revealOmen: 'abyssal_echoes',
        },
      }).ok,
    ).toBe(false)
  }
})

it('Vorana 腐烂保留破裂目标，真实目录路线完成剩余五槽而非提前结束', () => {
  const initial = start('Wicker Tiara', "Vorana's Carnage", 'helmet')
  const target = 'BerserkInfluenceRageCostEfficiency2'
  const affix = {
    modId: target,
    affixId: 'a1',
    lines: ['35(35-60)% increased Rage Cost Efficiency'],
    fractured: true as const,
  }
  const prepared = must(createCraftState(catalog, { ...initial, affixes: [affix], nextAffixId: 2 }))
  const pending = must(
    applyCraftStep(catalog, prepared, { kind: 'putrefy', boneId: 'preserved_rib' }),
  )
  expect(pending.pendingDesecration?.putrefaction).toEqual({ prefix: 2, suffix: 3 })
  const result = must(planCraftTargetRoutes(catalog, pending, [target], [], [], { maxStates: 24 }))
  expect(result.alreadyMatched).toBe(false)
  expect(result.routes.length).toBeGreaterThan(0)
  for (const route of result.routes) {
    expect(route.steps).toHaveLength(10)
    let current = pending
    for (const step of route.steps) {
      current = must(applyCraftStep(catalog, current, step.operation))
      expect(current.affixes.find((entry) => entry.modId === target)).toEqual(affix)
    }
    expect(current.pendingDesecration).toBeUndefined()
    expect(current.affixes).toHaveLength(6)
  }
})
