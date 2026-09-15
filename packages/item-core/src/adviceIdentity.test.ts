import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { analyzeAlloyTargets } from './alloyAdvice'
import { alloyTestFixture } from './alloyTestFixture'
import { analyzeBoneTargets } from './boneAdvice'
import { boneCatalog, boneState } from './boneTestFixture'
import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import { analyzeEssenceTargets } from './essenceAdvice'
import { analyzeEssencePreparation } from './essencePreparation'
import type { CraftResult, CraftState } from './rehearsal'
import { analyzeCraftTargets } from './targets'

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

// 身份之外的完整旧输出仍须一致，包括候选次序、风险、数值和预算。
function semantic(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, entry) =>
      ['affixId', 'removeAffixId', 'nextAffixId'].includes(key) ? undefined : entry,
    ),
  )
}

function essenceCatalog(): CraftCatalog {
  const catalog = boneCatalog()
  return {
    ...catalog,
    _meta: {
      ...catalog._meta,
      sources: [
        ...catalog._meta.sources,
        { path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' },
      ],
    },
    essences: [
      {
        id: 'Metadata/Items/Currency/CurrencyPerfectEssenceLife',
        name: 'Perfect Essence of Life',
        type: 'Life',
        tierLevel: 1,
        mods: { Helmet: 'prefix4' },
      },
    ],
  }
}

describe('制作建议保留真实词缀实例', () => {
  it('合金同时改变多个有效值目标时，legacy 损失与风险沿目标顺序排列', () => {
    const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
    const catalog = { ...primary, alloys: alloyTestFixture() }
    const legacy: CraftState = {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'rare',
      sourceText: null,
      affixes: [
        { modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] },
        { modId: 'FireResist1', lines: ['+9% to Fire Resistance'] },
        { modId: 'ColdResist1', lines: ['+8% to Cold Resistance'] },
      ],
    }
    const ids = ['AlloyEffectOfResistanceMods1', 'ColdResist1', 'FireResist1']
    const values = [
      { modId: 'ColdResist1', basis: 'effective' as const, bounds: [{ index: 0, min: 8, max: 8 }] },
      { modId: 'FireResist1', basis: 'effective' as const, bounds: [{ index: 0, min: 9, max: 9 }] },
    ]
    for (const state of [legacy, must(enableCraftAffixIdentity(catalog, legacy))]) {
      const step = must(analyzeAlloyTargets(catalog, state, ids, values)).find(
        (entry) =>
          entry.operation.alloyId === 'Metadata/Items/Currency/CurrencyVerisiumAlloy9' &&
          entry.operation.removeModId === 'IncreasedLife1' &&
          entry.operation.values[0] === 20,
      )
      expect(step).toMatchObject({
        lostTargetIds: ['ColdResist1', 'FireResist1'],
        atRiskTargetIds: ['ColdResist1', 'FireResist1'],
      })
    }
  })

  it('精华建议携带移除实例并可回放，完整旧语义与保护目标一致', () => {
    const catalog = essenceCatalog()
    const legacy = boneState(['prefix1', 'suffix1'])
    const state = must(enableCraftAffixIdentity(catalog, legacy))
    const snapshot = structuredClone(state)
    const ids = ['prefix4', 'suffix1']
    const values = [{ modId: 'prefix4', bounds: [{ index: 0, min: 8 }] }]
    const advice = must(analyzeEssenceTargets(catalog, state, ids, values))
    expect(advice.length).toBeGreaterThan(0)
    expect(semantic(advice)).toEqual(must(analyzeEssenceTargets(catalog, legacy, ids, values)))
    for (const entry of advice) {
      expect(entry.operation.removeAffixId).toBe(
        entry.operation.removeModId === 'prefix1' ? 'a1' : 'a2',
      )
      const next = must(applyCraftStep(catalog, state, entry.operation))
      const targets = must(analyzeCraftTargets(catalog, next, ids, values)).targets
      expect(targets[0]?.matched).toBe(true)
      expect(targets[1]?.matched).toBe(entry.operation.removeModId !== 'suffix1')
      expect(entry.lostTargetIds).toEqual(
        entry.operation.removeModId === 'suffix1' ? ['suffix1'] : [],
      )
    }
    expect(state).toEqual(snapshot)
  })

  it('精华准备取每次真实追加实例构造 rolls，游标有空洞也能完整回放', () => {
    const catalog = essenceCatalog()
    const legacy: CraftState = { ...boneState(), rarity: 'normal' }
    const state = { ...must(enableCraftAffixIdentity(catalog, legacy)), nextAffixId: 19 }
    const snapshot = structuredClone(state)
    const values = [{ modId: 'prefix4', bounds: [{ index: 0, min: 8 }] }]
    const result = must(analyzeEssencePreparation(catalog, state, ['prefix4'], values))
    expect(semantic(result)).toEqual(
      must(analyzeEssencePreparation(catalog, legacy, ['prefix4'], values)),
    )
    expect(result.routes).toHaveLength(1)
    const route = result.routes[0]
    if (!route) throw new Error('缺少准备路线')
    let current: CraftState = state
    for (const operation of route.preparations) {
      const next = must(applyCraftStep(catalog, current, operation))
      const added = next.affixes.at(-1)
      expect(operation.rolls?.[0]?.affixId).toBe(added?.affixId)
      expect(operation.rolls?.[0]?.affixId).toMatch(/^a(?:19|20)$/)
      current = next
    }
    expect(route.final.operation.removeAffixId).toMatch(/^a(?:19|20)$/)
    const final = must(applyCraftStep(catalog, current, route.final.operation))
    expect(must(analyzeCraftTargets(catalog, final, ['prefix4'], values)).targets[0]?.matched).toBe(
      true,
    )
    expect(final.nextAffixId).toBe(22)
    expect(state).toEqual(snapshot)
  })

  it('合金建议按候选实例指定移除，实际结果满足独立目标并保留旧风险', () => {
    const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
    const catalog = { ...primary, alloys: alloyTestFixture() }
    const legacy: CraftState = {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'rare',
      sourceText: null,
      affixes: [
        { modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] },
        { modId: 'FireResist1', lines: ['+9% to Fire Resistance'] },
      ],
    }
    const state = must(enableCraftAffixIdentity(catalog, legacy))
    const ids = ['AlloyMaximumRunicWard1', 'FireResist1']
    const values = [{ modId: 'AlloyMaximumRunicWard1', bounds: [{ index: 0, min: 45 }] }]
    const advice = must(analyzeAlloyTargets(catalog, state, ids, values))
    expect(advice).toHaveLength(2)
    expect(semantic(advice)).toEqual(must(analyzeAlloyTargets(catalog, legacy, ids, values)))
    for (const entry of advice) {
      expect(entry.operation.removeAffixId).toBe(
        entry.operation.removeModId === 'IncreasedLife1' ? 'a1' : 'a2',
      )
      const final = must(applyCraftStep(catalog, state, entry.operation))
      expect(must(analyzeCraftTargets(catalog, final, ids, values)).targets[0]?.matched).toBe(true)
    }
  })

  it('满容量骨骼建议明确移除实例，后续候选及揭示仍可达成目标', () => {
    const catalog = boneCatalog()
    const legacy = boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])
    const state = must(enableCraftAffixIdentity(catalog, legacy))
    const snapshot = structuredClone(state)
    const ids = ['prefix1', 'exclusive1']
    const values = [{ modId: 'exclusive1', bounds: [{ index: 0, min: 8 }] }]
    const advice = must(analyzeBoneTargets(catalog, state, ids, values))
    expect(advice.length).toBeGreaterThan(0)
    expect(semantic(advice)).toEqual(must(analyzeBoneTargets(catalog, legacy, ids, values)))
    for (const entry of advice) {
      const operation = entry.operation
      if (operation.kind !== 'desecrate') throw new Error('缺少骨骼操作')
      expect(operation.removeAffixId).toBe(
        state.affixes.find((affix) => affix.modId === operation.removeModId)?.affixId,
      )
      expect(operation.removeAffixId).toBeDefined()
      expect(applyCraftStep(catalog, state, operation).ok).toBe(true)
    }
    const first = advice[0]
    if (!first) throw new Error('缺少骨骼建议')
    let current = must(applyCraftStep(catalog, state, first.operation))
    for (let index = 0; index < 2; index++) {
      const next = must(analyzeBoneTargets(catalog, current, ids, values)).find((entry) =>
        entry.targetModIds.includes('exclusive1'),
      )
      if (!next) throw new Error('缺少达成目标的后续建议')
      current = must(applyCraftStep(catalog, current, next.operation))
    }
    expect(must(analyzeCraftTargets(catalog, current, ids, values)).targets[1]?.matched).toBe(true)
    expect(state).toEqual(snapshot)
  })
})
