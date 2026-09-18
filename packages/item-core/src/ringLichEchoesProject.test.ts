import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { applyBoneCraft, desecrationCandidates } from './boneCraft'
import type { BoneCraftOperation } from './boneRules'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts } from './craftCosts'
import { type CraftProject, serializeCraftProject } from './craftProject'
import { serializeTargetCraftProject } from './craftProjectTargets'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { DESECRATION_SOURCE } from './desecration'
import { inspectNumericLines } from './numeric'
import type { CraftState } from './rehearsal'
import { requiresRingLichEchoesProjectVersion } from './ringLichEchoesProjectVersion'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
it('旧版导出拒绝巫妖回响，不能生成无法恢复的历史', () => {
  expect(() =>
    serializeCraftProject(fixture('Amethyst Ring', 'liege') as unknown as CraftProject),
  ).toThrow('v123')
})
function fixture(baseId = 'Amethyst Ring', lichOmen: 'blackblooded' | 'liege' = 'blackblooded') {
  const initialState: CraftState = {
    baseId,
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
    nextAffixId: 1,
  }
  const bone: BoneCraftOperation = {
    kind: 'desecrate',
    boneId: 'preserved_collarbone',
    affixKind: 'suffix',
    directionOmen: 'dextral_necromancy',
    lichOmen,
  }
  const setup: CraftStep[] = [
    { currency: 'transmutation', modIds: ['IncreasedLife1'] },
    { currency: 'regal', modIds: ['IncreasedMana1'] },
  ]
  let state = initialState
  for (const operation of setup) {
    const applied = applyCraftStep(catalog, state, operation)
    if (!applied.ok) throw Error(applied.error)
    state = applied.value
  }
  const pending = applyBoneCraft(catalog, state, bone)
  if (!pending.ok) throw Error(pending.error)
  const mods = desecrationCandidates(catalog, pending.value)
  const first = mods[0]
  if (!first || mods.length < 5) throw Error('目录缺少预期候选')
  const inspected = inspectNumericLines(first.lines)
  if (!inspected.ok) throw Error(inspected.error)
  const operations: CraftStep[] = [
    ...setup,
    bone,
    {
      kind: 'desecration-offer',
      modIds: mods.slice(0, 3).map((m) => m.id),
      revealOmen: 'abyssal_echoes',
    },
    { kind: 'desecration-reroll', modIds: [first.id, ...mods.slice(3, 5).map((m) => m.id)] },
    { kind: 'desecration-reveal', modId: first.id, values: inspected.value.map((v) => v.min) },
  ]
  return {
    schemaVersion: 1,
    rulesVersion: 'basic-2026-09-18-v123',
    sourceCommit: catalog._meta.sourceCommit,
    desecrationSourceHash: DESECRATION_SOURCE.sha256,
    initialState,
    operations,
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
}
it.each(['Amethyst Ring', 'Breach Ring'])(
  '%s 两族真实目录、单次材料及所有历史位置回放',
  (baseId) => {
    for (const lich of ['blackblooded', 'liege'] as const) {
      const project = fixture(baseId, lich)
      for (let cursor = 0; cursor <= project.operations.length; cursor++) {
        const loaded = loadTargetWorkbenchProject(JSON.stringify({ ...project, cursor }), catalog)
        if (!loaded.ok) throw Error(loaded.error)
        expect(loaded.value.states.at(-1)?.pendingDesecration).toBeUndefined()
        expect(loaded.value.states.at(-1)?.affixes).toHaveLength(3)
        expect(serializeTargetCraftProject(loaded.value.project, catalog).ok).toBe(true)
      }
      const costs = collectCraftCosts(catalog, project.operations)
      if (!costs.ok) throw Error(costs.error)
      const counts = Object.fromEntries(costs.value.map((m) => [m.id, m.count]))
      expect(counts['omen:Omen of Abyssal Echoes']).toBe(1)
      expect(counts['bone:preserved_collarbone']).toBe(1)
      expect(
        counts[lich === 'liege' ? 'omen:Omen of the Liege' : 'omen:Omen of the Blackblooded'],
      ).toBe(1)
      expect(counts['omen:Omen of Dextral Necromancy']).toBe(1)
      expect(requiresRingLichEchoesProjectVersion(project, catalog)).toBe(true)
      expect(
        loadTargetWorkbenchProject(
          JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-18-v122' }),
          catalog,
        ),
      ).toMatchObject({ ok: false, error: expect.stringContaining('v123') })
    }
  },
)
it('独立骨骼指引保持旧版，沿用保留全部未来，空v123不降版', () => {
  const project = fixture()
  const strategy = {
    maxSteps: 10,
    rules: [
      {
        conditions: [{ kind: 'always' }],
        action: {
          kind: 'desecrate',
          boneId: 'preserved_collarbone',
          lichOmen: 'liege',
          directionOmen: 'dextral_necromancy',
        },
      },
    ],
  }
  const source = { ...project, operations: [], strategy }
  const old = { ...source, rulesVersion: 'basic-2026-09-18-v122' }
  expect(loadTargetWorkbenchProject(JSON.stringify(old), catalog).ok).toBe(true)
  expect(requiresRingLichEchoesProjectVersion(old, catalog)).toBe(false)
  const reused = reuseTargetCraftPlan(JSON.stringify(project), JSON.stringify(source), catalog)
  if (!reused.ok) throw Error(reused.error)
  expect(reused.value.project.operations).toEqual(project.operations)
  expect(reused.value.project.rulesVersion).toBe(project.rulesVersion)
  const empty = { ...project, operations: [] }
  const read = loadTargetWorkbenchProject(JSON.stringify(empty), catalog)
  if (!read.ok) throw Error(read.error)
  const saved = serializeTargetCraftProject(read.value.project, catalog)
  if (!saved.ok) throw Error(saved.error)
  expect(JSON.parse(saved.value).rulesVersion).toBe(project.rulesVersion)
})
it('检测不执行访问器、不解释原文，不将黑血项链或独立材料价格当作新能力', () => {
  const project = fixture()
  expect(
    requiresRingLichEchoesProjectVersion(
      { ...project, initialState: { ...project.initialState, baseId: 'Gold Amulet' } },
      catalog,
    ),
  ).toBe(false)
  expect(
    requiresRingLichEchoesProjectVersion(
      {
        get initialState() {
          throw Error('不应读取')
        },
      },
      catalog,
    ),
  ).toBe(false)
  expect(
    requiresRingLichEchoesProjectVersion(
      {
        ...project,
        operations: [],
        sourceText: JSON.stringify(project),
        pricing: { unit: 'divine', prices: { 'omen:blackblooded': 1 } },
      },
      catalog,
    ),
  ).toBe(false)
})
