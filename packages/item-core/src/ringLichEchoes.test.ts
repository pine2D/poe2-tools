import { expect, it } from 'vitest'
import { analyzeBoneTargets } from './boneAdvice'
import { applyBoneCraft } from './boneCraft'
import type { BoneCraftOperation } from './boneRules'
import { boneCatalog, boneState } from './boneTestFixture'
import { serializeTargetCraftProject } from './craftProjectTargets'
import { DESECRATION_SOURCE } from './desecration'
import { planCraftTargetRoutes } from './targetRoutes'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

function fixture(type = 'Ring', lich: 'blackblooded' | 'liege' = 'blackblooded') {
  const catalog = boneCatalog(type)
  for (const mod of catalog.modifiers) {
    if (mod.desecratedOnly)
      mod.tags = ['unveiled_mod', lich === 'blackblooded' ? 'kurgal_mod' : 'amanamu_mod']
  }
  const seed = catalog.modifiers.find((mod) => mod.id === 'exclusive1')
  if (!seed) throw Error('合成词缀缺失')
  catalog.modifiers.push({ ...seed, id: 'fourth', group: 'fourth' })
  catalog.modifiers.push({
    ...seed,
    id: 'foreign',
    group: 'foreign',
    tags: ['unveiled_mod', 'ulaman_mod'],
  })
  const state = boneState()
  delete state.sockets
  return { catalog, state }
}
const steps: BoneCraftOperation[] = [
  {
    kind: 'desecrate',
    boneId: 'preserved_collarbone',
    affixKind: 'suffix',
    lichOmen: 'blackblooded',
  },
  {
    kind: 'desecration-offer',
    modIds: ['exclusive1', 'exclusive2', 'exclusive3'],
    revealOmen: 'abyssal_echoes',
  },
  { kind: 'desecration-reroll', modIds: ['exclusive1', 'exclusive3', 'fourth'] },
  { kind: 'desecration-reveal', modId: 'exclusive2', values: [7] },
]

it.each(['blackblooded', 'liege'] as const)(
  '%s戒指两组保持巫妖身份，跨组可重复且可选回首组',
  (lich) => {
    const { catalog, state } = fixture('Ring', lich)
    let current = state
    for (const input of steps) {
      const step = input.kind === 'desecrate' ? { ...input, lichOmen: lich } : input
      const result = applyBoneCraft(catalog, current, step)
      expect(result.ok, JSON.stringify(result)).toBe(true)
      if (!result.ok) return
      current = result.value
      if (step.kind === 'desecration-offer') {
        for (const id of ['foreign', 'suffix1']) {
          expect(
            applyBoneCraft(catalog, current, {
              kind: 'desecration-reroll',
              modIds: ['exclusive1', 'exclusive3', id],
            }).ok,
          ).toBe(false)
        }
      }
    }
    expect(current.affixes).toEqual([
      expect.objectContaining({ modId: 'exclusive2', desecrated: true }),
    ])
    expect(current.pendingDesecration).toBeUndefined()
    expect(state.affixes).toEqual([])
  },
)

it('v123 保存戒指回响完整未来，旧版只拒绝新组合', () => {
  const { catalog, state } = fixture()
  const input = {
    schemaVersion: 1,
    rulesVersion: 'basic-2026-09-18-v123',
    sourceCommit: catalog._meta.sourceCommit,
    desecrationSourceHash: DESECRATION_SOURCE.sha256,
    initialState: { ...state, rarity: 'normal', nextAffixId: 1 },
    operations: [
      { currency: 'transmutation', modIds: ['prefix1'] },
      { currency: 'regal', modIds: ['prefix2'] },
      ...steps,
    ],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
  for (let cursor = 0; cursor <= input.operations.length; cursor++) {
    const result = loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog)
    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (!result.ok) continue
    expect(result.value.states[5]?.pendingDesecration?.rerollOptions).toEqual([
      'exclusive1',
      'exclusive3',
      'fourth',
    ])
    const saved = serializeTargetCraftProject(result.value.project, catalog)
    expect(saved.ok).toBe(true)
    if (saved.ok) expect(JSON.parse(saved.value).rulesVersion).toBe(input.rulesVersion)
  }
  const old = { ...input, rulesVersion: 'basic-2026-09-18-v122' }
  expect(loadTargetWorkbenchProject(JSON.stringify(old), catalog)).toMatchObject({
    ok: false,
    error: expect.stringContaining('v123'),
  })
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...old, operations: input.operations.slice(0, 3) }),
      catalog,
    ).ok,
  ).toBe(true)
})

it.each(['Belt'])('尚未核实的%s黑血回响继续拒绝', (type) => {
  const { catalog, state } = fixture(type)
  const pending = applyBoneCraft(catalog, state, steps[0] as BoneCraftOperation)
  expect(pending.ok).toBe(true)
  if (pending.ok)
    expect(applyBoneCraft(catalog, pending.value, steps[1] as BoneCraftOperation).ok).toBe(false)
})

it('戒指回响建议和路线继续第二组并完成目标，不跨巫妖', () => {
  const { catalog, state } = fixture()
  const pending = {
    ...state,
    pendingDesecration: {
      boneId: 'preserved_collarbone' as const,
      kind: 'suffix' as const,
      lichOmen: 'blackblooded' as const,
      revealOmen: 'abyssal_echoes' as const,
      options: ['exclusive1', 'exclusive2', 'exclusive3'],
    },
  }
  const advice = analyzeBoneTargets(catalog, pending, ['fourth'], [], [])
  expect(advice.ok).toBe(true)
  if (advice.ok)
    expect(advice.value.some((entry) => entry.operation.kind === 'desecration-reroll')).toBe(true)
  const routes = planCraftTargetRoutes(catalog, pending, ['fourth'], [], [], {
    preserveMatched: true,
  })
  expect(routes.ok).toBe(true)
  if (!routes.ok) return
  expect(routes.value.routes.length).toBeGreaterThan(0)
  for (const route of routes.value.routes) {
    expect(route.finalState.pendingDesecration).toBeUndefined()
    expect(route.finalState.affixes.some((affix) => affix.modId === 'fourth')).toBe(true)
    expect(route.finalState.affixes.some((affix) => affix.modId === 'foreign')).toBe(false)
  }
})
