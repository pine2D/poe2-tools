import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { catalog as primary } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import { type CraftPanelGoal, evaluateCraftPanelGoals } from './panelGoals'
import { panelRouteCandidates } from './panelRouteCandidates'
import type { CraftState } from './rehearsal'
import { socketStrategyCatalog, socketStrategyState } from './socketStrategyFixture'
import { planTargetDefinitionRoutes } from './targetDefinitionRoutes'

it('纯面板保留先打孔再镶嵌的准备步骤', () => {
  const catalog = socketStrategyCatalog()
  catalog.modifiers = []
  const state = { ...socketStrategyState(), sockets: [], quality: 0 }
  const panelGoals: CraftPanelGoal[] = [
    { kind: 'item-property', property: 'fireResistance', min: 12 },
  ]
  const result = planTargetDefinitionRoutes(catalog, state, {
    nextTargetId: 1,
    targets: [],
    alternatives: [],
    values: [],
    panelGoals,
  })
  if (!result.ok) throw Error(result.error)
  expect(result.value.routes.length).toBeGreaterThan(0)
  expect(
    result.value.routes[0]?.steps.map(({ operation }) =>
      'kind' in operation ? operation.kind : operation.currency,
    ),
  ).toEqual(['artificer', 'socket'])
  for (const route of result.value.routes)
    expect(evaluateCraftPanelGoals(catalog, route.finalState, panelGoals).satisfied).toBe(true)
})

it.each(['alloy', 'flux', 'runeforge', 'liquid-emotion'] as const)(
  '面板生成器复用%s准备与合法实际步骤',
  (kind) => {
    const catalog = {
      ...primary,
      alloys: JSON.parse(readFileSync('data/craft/alloys.json', 'utf8')),
      fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
      runeforging: JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8')),
    }
    const state: CraftState =
      kind === 'runeforge'
        ? {
            baseId: 'Adherent Cuffs',
            itemLevel: 86,
            rarity: 'normal',
            quality: 0,
            sockets: [],
            affixes: [],
            sourceText: null,
          }
        : {
            baseId: 'Gold Ring',
            itemLevel: 86,
            rarity: 'rare',
            nextAffixId: 3,
            affixes: [
              { affixId: 'a1', modId: 'FireResist1', lines: ['+10% to Fire Resistance'] },
              { affixId: 'a2', modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] },
            ],
            sourceText: null,
          }
    if (kind === 'liquid-emotion') {
      state.baseId = 'Sapphire'
      state.affixes = [
        {
          affixId: 'a1',
          modId: 'JewelAilmentChance',
          lines: ['10% increased chance to inflict Ailments'],
        },
        {
          affixId: 'a2',
          modId: 'JewelAilmentEffect',
          lines: ['10% increased Magnitude of Ailments you inflict'],
        },
      ]
    }
    let applications = 0
    let found = false
    for (const candidate of panelRouteCandidates(
      catalog,
      state,
      [{ kind: 'item-property', property: 'fireResistance', min: 20 }],
      () => applications++ < 1024,
      () => {},
    )) {
      if ('kind' in candidate.operation && candidate.operation.kind === kind) {
        expect(applyCraftStep(catalog, state, candidate.operation).ok).toBe(true)
        found = true
        break
      }
    }
    expect(found).toBe(true)
    expect(applications).toBeLessThanOrEqual(1025)
  },
)
