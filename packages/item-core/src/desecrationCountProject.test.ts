import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { boneCatalog } from './boneTestFixture'
import type { CraftCatalog } from './catalog'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { requiresDesecrationCountProjectVersion } from './desecrationCountProjectVersion'
import { fluxCatalogSignature } from './fluxes'
import type { CraftResult } from './rehearsal'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
const strategy = {
  maxSteps: 20,
  rules: [
    {
      conditions: [
        {
          kind: 'not',
          condition: { kind: 'desecrated-count', source: 'unrevealed', min: 0, max: 4 },
        },
      ],
      action: { kind: 'stop' },
    },
  ],
}
function project(catalog: CraftCatalog, baseId = 'Synthetic Base') {
  return {
    schemaVersion: 1,
    rulesVersion: 'basic-2026-09-17-v92',
    sourceCommit: catalog._meta.sourceCommit,
    initialState: {
      baseId,
      itemLevel: 64,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
    },
    operations: [],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
}
it('v2–v91 有效基线均拒绝嵌套未执行新条件', () => {
  const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
  catalog.fluxes = JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8'))
  for (let n = 2; n <= 91; n++) {
    const { targetDefinitions, orphanedTargets, ...base } = project(catalog, 'Adherent Cuffs')
    const { nextAffixId: _, ...legacy } = base.initialState
    const input = {
      ...base,
      rulesVersion: `basic-2026-09-${n >= 76 ? '16' : '12'}-v${n}`,
      initialState: n >= 73 ? base.initialState : legacy,
      ...(n >= 74 ? { targetDefinitions, orphanedTargets } : {}),
      ...(n === 75 ? { fluxCatalogSignature: fluxCatalogSignature(catalog) } : {}),
    }
    const read =
      n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
    expect(read(JSON.stringify(input), catalog).ok, `v${n} 基线`).toBe(true)
    expect(read(JSON.stringify({ ...input, strategy }), catalog), `v${n}`).toMatchObject({
      ok: false,
      error: expect.stringContaining('v92'),
    })
  }
})
it('真实多槽完整未来逐游标保存，沿用新条件升级且沿用旧方案不降级', () => {
  const catalog = boneCatalog()
  const operations = [
    { currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'] },
    { kind: 'putrefy', boneId: 'preserved_rib' },
    { kind: 'desecration-offer', modIds: ['prefix1', 'prefix2', 'prefix3'] },
    { kind: 'desecration-reveal', modId: 'prefix1', values: [5] },
  ]
  const base = project(catalog)
  for (const cursor of [0, 1, 2, 3, 4]) {
    const input = {
      ...base,
      operations,
      cursor,
      strategy,
      desecrationSourceHash: catalog._meta.sources[0]?.sha256,
    }
    const restored = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
    expect(restored.project).toEqual(input)
    expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(input)
    expect(restored.states.at(-1)?.pendingDesecration?.putrefaction).toEqual({
      prefix: 2,
      suffix: 3,
    })
    const old = {
      ...base,
      rulesVersion: 'basic-2026-09-16-v91',
      strategy: {
        maxSteps: 20,
        rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
      },
    }
    const kept = must(reuseTargetCraftPlan(JSON.stringify(input), JSON.stringify(old), catalog))
    expect(kept.project.rulesVersion).toBe(base.rulesVersion)
    expect(kept.project.operations).toEqual(operations)
    expect(kept.project.cursor).toBe(cursor)
    const upgraded = must(
      reuseTargetCraftPlan(JSON.stringify(old), JSON.stringify({ ...base, strategy }), catalog),
    )
    expect(upgraded.project.rulesVersion).toBe(base.rulesVersion)
    expect(upgraded.project.strategy).toEqual(strategy)
  }
})
it('能力检查不读取 getter、不把原文当条件，循环输入可终止', () => {
  const hostile = {
    get kind() {
      throw Error('不能调用')
    },
  }
  const cycle: { self?: unknown; strategy: unknown } = { strategy: hostile }
  cycle.self = cycle
  expect(requiresDesecrationCountProjectVersion(cycle)).toBe(false)
  expect(requiresDesecrationCountProjectVersion({ sourceText: JSON.stringify(strategy) })).toBe(
    false,
  )
  expect(requiresDesecrationCountProjectVersion({ strategy })).toBe(true)
})
