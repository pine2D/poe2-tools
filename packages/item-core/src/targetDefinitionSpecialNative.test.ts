import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { alloyTestFixture } from './alloyTestFixture'
import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import { analyzeEssenceTargetContext } from './essenceAdvice'
import { prepareFluxCraft } from './fluxCraft'
import type { FluxCatalog } from './fluxes'
import { inspectNumericLines, renderNumericLines } from './numeric'
import type { CraftResult, CraftState } from './rehearsal'
import {
  analyzeAlloyTargetDefinitions,
  analyzeBoneTargetDefinitions,
  analyzeEssencePreparationDefinitions,
  analyzeEssenceTargetDefinitions,
} from './targetDefinitionSpecialAdvice'
import type { CraftTargetDefinitions } from './targetDefinitions'
import { evaluateTargetDefinitions } from './targetProgress'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) as FluxCatalog,
  alloys: alloyTestFixture(),
}
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function state(): CraftState {
  return must(
    enableCraftAffixIdentity(catalog, {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'rare',
      sourceText: null,
      affixes: ['FireResist4', 'ColdResist5', 'IncreasedLife1'].map((modId) => {
        const mod = catalog.modifiers.find((mod) => mod.id === modId)
        if (!mod) throw Error(modId)
        return {
          modId,
          lines: must(
            renderNumericLines(
              mod.lines,
              must(inspectNumericLines(mod.lines)).map((range) => range.min),
            ),
          ),
        }
      }),
    }),
  )
}
const definitions = (extra: string): CraftTargetDefinitions => ({
  nextTargetId: 10,
  targets: [
    { targetId: 't2', modId: 'ChaosResist4' },
    { targetId: 't7', modId: 'ChaosResist4' },
    { targetId: 't9', modId: extra },
  ],
  alternatives: [],
  values: [
    { targetId: 't2', modId: 'ChaosResist4', bounds: [{ index: 0, min: 16 }] },
    { targetId: 't7', modId: 'ChaosResist4', bounds: [{ index: 0, min: 19 }] },
  ],
})
function converted() {
  return must(
    applyCraftStep(catalog, state(), {
      kind: 'flux',
      fluxId: 'Metadata/Items/Currency/CurrencyArcaneFluxChaos',
      rolls: [
        { affixId: 'a1', modId: 'ChaosResist4', values: [16] },
        { affixId: 'a2', modId: 'ChaosResist4', values: [19] },
      ],
    }),
  )
}

describe('特殊建议原生重复目标', () => {
  it('同一结果类型的两个条件分别生成数值选项，共用候选预算而不合并阈值', () => {
    const essence = catalog.essences?.find((entry) =>
      entry.id.endsWith('CurrencyPerfectEssenceMana'),
    )
    if (!essence) throw Error('缺少材料夹具')
    // 仅合成材料结果映射；真实基底、抗性范围、身份和转换族规则不放宽。
    const synthetic = { ...catalog, essences: [{ ...essence, mods: { Ring: 'ChaosResist4' } }] }
    const before = state(),
      config = definitions('IncreasedLife1')
    const steps = must(analyzeEssenceTargetDefinitions(synthetic, before, config))
    expect([...new Set(steps.map((step) => JSON.stringify(step.operation.values)))].sort()).toEqual(
      ['[16]', '[19]'],
    )
    for (const step of steps)
      expect(applyCraftStep(synthetic, before, step.operation).ok).toBe(true)
    let spent = 0
    const bounded = must(
      analyzeEssenceTargetContext(
        synthetic,
        before,
        config.targets.map((target) => target.modId),
        [],
        [],
        {
          consumeCandidate: () => {
            if (spent >= 2) return false
            spent += 1
            return true
          },
        },
        config,
      ),
    )
    expect(spent).toBe(2)
    expect(bounded.length).toBe(2)
    expect(bounded.map((step) => step.operation)).toEqual(
      ['a1', 'a2'].map((affixId, index) => ({
        kind: 'essence',
        essenceId: essence.id,
        removeModId: index === 0 ? 'FireResist4' : 'ColdResist5',
        removeAffixId: affixId,
        values: [16],
      })),
    )
  })
  it('部分数量达成按两个真实实例计算，缺一实例不能被同类型存在性短路', () => {
    const config = { ...definitions('EssenceIncreasedManaPercent1'), minimumTargetCount: 2 }
    expect(must(analyzeEssenceTargetDefinitions(catalog, converted(), config))).toEqual([])
    const before = converted()
    const removed = must(
      applyCraftStep(catalog, before, {
        currency: 'annulment',
        modIds: [],
        removeModId: 'ChaosResist4',
        removeAffixId: 'a2',
      }),
    )
    expect(evaluateTargetDefinitions(catalog, removed, config).satisfied).toBe(false)
    expect(must(analyzeEssenceTargetDefinitions(catalog, removed, config)).length).toBeGreaterThan(
      0,
    )
  })
  it('精华从完整分配生成候选，分别移除同类型实例只丢对应条件目标', () => {
    const before = converted(),
      config = definitions('EssenceIncreasedManaPercent1'),
      original = structuredClone({ before, config })
    const steps = must(analyzeEssenceTargetDefinitions(catalog, before, config))
    expect(steps.length).toBeGreaterThan(0)
    const a1 = steps.find((step) => step.operation.removeAffixId === 'a1'),
      a2 = steps.find((step) => step.operation.removeAffixId === 'a2')
    expect(a1?.lostTargetIds).toEqual(['t7'])
    expect(a2?.lostTargetIds).toEqual(['t7'])
    for (const step of steps) {
      const after = must(applyCraftStep(catalog, before, step.operation))
      expect(step.matchedTargetIds).toEqual(
        evaluateTargetDefinitions(catalog, after, config).matches.map((match) => match.targetId),
      )
    }
    expect(steps.some((step) => step.gainedTargetIds.includes('t9'))).toBe(true)
    expect({ before, config }).toEqual(original)
  })
  it('骨骼、合金和精华准备接受完整重复目标，不重新进入旧唯一类型门禁', () => {
    const before = converted()
    expect(
      analyzeBoneTargetDefinitions(
        catalog,
        before,
        definitions('AbyssModArmourJewelleryKurgalSuffixColdChaosResistance'),
      ).ok,
    ).toBe(true)
    const alloys = must(
      analyzeAlloyTargetDefinitions(catalog, before, definitions('AlloyMaximumRunicWard1')),
    )
    expect(alloys.length).toBeGreaterThan(0)
    for (const step of alloys) expect(applyCraftStep(catalog, before, step.operation).ok).toBe(true)
    expect(
      analyzeEssencePreparationDefinitions(
        catalog,
        before,
        definitions('EssenceIncreasedManaPercent1'),
      ).ok,
    ).toBe(true)
  })
  it('骨骼可先补受映射亵渎源，再由溶剂到达混沌目标，不能只搜索最终类型', () => {
    const before = converted(),
      config = definitions('ChaosResist6')
    const steps = must(analyzeBoneTargetDefinitions(catalog, before, config))
    expect(steps.length).toBeGreaterThan(0)
    expect(
      steps.some((step) =>
        step.targetModIds.some((id) => id.startsWith('AbyssModArmourJewellery')),
      ),
    ).toBe(true)
    expect(steps.some((step) => step.targetIds.includes('t9'))).toBe(true)
    for (const step of steps) expect(applyCraftStep(catalog, before, step.operation).ok).toBe(true)
    const first = steps.find((step) =>
      step.targetModIds.some((id) => id.startsWith('AbyssModArmourJewellery')),
    )
    if (!first) throw Error('缺少骨骼源步骤')
    let current = must(applyCraftStep(catalog, before, first.operation))
    for (let stage = 0; stage < 2; stage++) {
      const next = must(analyzeBoneTargetDefinitions(catalog, current, config)).find((step) =>
        step.targetIds.includes('t9'),
      )
      if (!next) throw Error('缺少后续候选')
      expect(next.gainedTargetIds).not.toContain('t9')
      current = must(applyCraftStep(catalog, current, next.operation))
    }
    const flux = must(
      prepareFluxCraft(catalog, current, 'Metadata/Items/Currency/CurrencyArcaneFluxChaos'),
    )
    const final = must(
      applyCraftStep(catalog, current, {
        kind: 'flux',
        fluxId: flux.flux.id,
        rolls: flux.changes.map(({ affix, toMod }) => ({
          affixId: affix.affixId,
          modId: toMod.id,
          values: must(inspectNumericLines(toMod.lines)).map((range) => range.min),
        })),
      }),
    )
    expect(evaluateTargetDefinitions(catalog, final, config).satisfied).toBe(true)
    expect(final.affixes.at(-1)).toMatchObject({ modId: 'ChaosResist6', desecrated: true })
  })
})
