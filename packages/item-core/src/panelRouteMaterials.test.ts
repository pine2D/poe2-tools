import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { catalog as primary } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import { type CraftPanelGoal, evaluateCraftPanelGoals } from './panelGoals'
import { panelRouteCandidates } from './panelRouteCandidates'
import type { CraftState } from './rehearsal'
import { socketStrategyCatalog, socketStrategyState } from './socketStrategyFixture'
import { planTargetDefinitionRoutes } from './targetDefinitionRoutes'

it.each([
  [1, 100, ['masterwork', 'masterwork', 'masterwork']],
  [100, 1, ['socket']],
] as const)(
  '面板目标按实际报价比较原孔升级与直接替换（%s/%s）',
  (upgradePrice, perfectPrice, expected) => {
    const catalog = {
      ...primary,
      modifiers: [],
      essences: [],
      augments: (primary.augments ?? []).filter(
        (a) =>
          a.category === 'armour' &&
          (a.name.endsWith('Desert Rune') || a.name === 'Masterwork Rune'),
      ),
    }
    const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
    const state: CraftState = {
      baseId: 'Adherent Cuffs',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      quality: 0,
      sockets: [id('Lesser Desert Rune')],
    }
    const definitions = {
      nextTargetId: 1,
      targets: [],
      alternatives: [],
      values: [],
      panelGoals: [
        { kind: 'item-property' as const, property: 'fireResistance' as const, min: 22 },
      ],
    }
    const result = planTargetDefinitionRoutes(catalog, state, definitions, {
      maxDepth: 3,
      maxStates: 32,
      pricing: {
        unit: 'divine',
        baseCost: 0,
        prices: {
          'augment:Masterwork Rune': upgradePrice,
          'augment:Perfect Desert Rune': perfectPrice,
          'augment:Desert Rune': 100,
          'augment:Greater Desert Rune': 100,
        },
      },
    })
    if (!result.ok) throw Error(result.error)
    const route = result.value.routes[0]
    expect(
      route?.steps.map(({ operation }) =>
        'kind' in operation ? operation.kind : operation.currency,
      ),
    ).toEqual(expected)
    let current = state
    for (const step of route?.steps ?? []) {
      const applied = applyCraftStep(catalog, current, step.operation)
      if (!applied.ok) throw Error(applied.error)
      current = applied.value
    }
    expect(current.sockets).toEqual([id('Perfect Desert Rune')])
    expect(evaluateCraftPanelGoals(catalog, current, definitions.panelGoals).satisfied).toBe(true)
  },
)

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
