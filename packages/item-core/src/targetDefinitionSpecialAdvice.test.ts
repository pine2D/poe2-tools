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
import type { CraftResult } from './rehearsal'
import {
  analyzeAlloyTargetDefinitions,
  analyzeBoneTargetDefinitions,
  analyzeEssencePreparationDefinitions,
  analyzeEssenceTargetDefinitions,
} from './targetDefinitionSpecialAdvice'
import type { CraftTargetDefinitions } from './targetDefinitions'
import { evaluateTargetDefinitions } from './targetProgress'

const value = <T>(result: CraftResult<T>): T => {
  if (!result.ok) throw Error(result.error)
  return result.value
}
const definitions = (ids: string[]): CraftTargetDefinitions => ({
  nextTargetId: 50,
  targets: ids.map((modId, i) => ({ targetId: `t${27 + i}`, modId })),
  alternatives: [],
  values: [],
})
function essenceCatalog() {
  const catalog = boneCatalog()
  catalog._meta.sources.push({ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' })
  catalog.essences = [
    {
      id: 'Metadata/Items/Currency/CurrencyPerfectEssenceLife',
      name: 'Perfect Essence of Life',
      type: 'Life',
      tierLevel: 1,
      mods: { Helmet: 'prefix1' },
    },
  ]
  return catalog
}

describe('特殊建议独立目标定义', () => {
  it('精华保留操作和实例选择，已失配档位被移除不误报目标丢失', () => {
    const catalog = essenceCatalog()
    const state = value(enableCraftAffixIdentity(catalog, boneState(['prefix2', 'suffix1'])))
    const config = definitions(['prefix1', 'suffix1'])
    config.values = [{ targetId: 't28', modId: 'suffix1', bounds: [{ index: 0, min: 8 }] }]
    const input = structuredClone({ state, config })
    const legacy = value(
      analyzeEssenceTargets(
        catalog,
        state,
        ['prefix1', 'suffix1'],
        [{ modId: 'suffix1', bounds: [{ index: 0, min: 8 }] }],
      ),
    )
    const steps = value(analyzeEssenceTargetDefinitions(catalog, state, config))
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.map((step) => step.operation)).toEqual(legacy.map((step) => step.operation))
    const removed = steps.find((step) => step.operation.removeAffixId === 'a2')
    expect(removed).toMatchObject({
      targetIds: ['t27'],
      affectedModIds: ['suffix1'],
      lostTargetIds: [],
      atRiskTargetIds: ['t28'],
      atRiskModIds: ['suffix1'],
      gainedTargetIds: ['t27'],
    })
    for (const step of steps) {
      const after = value(applyCraftStep(catalog, state, step.operation))
      expect(step.matchedTargetIds).toEqual(
        evaluateTargetDefinitions(catalog, after, config).matches.map((match) => match.targetId),
      )
    }
    expect({ state, config }).toEqual(input)
  })

  it('合金实际结果计算 tN 得失且随机风险保留真实档位', () => {
    const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
    const catalog = { ...primary, alloys: alloyTestFixture() }
    const state = value(
      enableCraftAffixIdentity(catalog, {
        baseId: 'Gold Ring',
        itemLevel: 86,
        rarity: 'rare',
        sourceText: null,
        affixes: [
          { modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] },
          { modId: 'FireResist1', lines: ['+9% to Fire Resistance'] },
        ],
      }),
    )
    const config = definitions(['AlloyMaximumRunicWard1', 'FireResist1'])
    const legacy = value(
      analyzeAlloyTargets(
        catalog,
        state,
        config.targets.map((t) => t.modId),
      ),
    )
    const steps = value(analyzeAlloyTargetDefinitions(catalog, state, config))
    expect(steps.map((step) => step.operation)).toEqual(legacy.map((step) => step.operation))
    expect(steps.find((step) => step.operation.removeAffixId === 'a2')).toMatchObject({
      gainedTargetIds: ['t27'],
      lostTargetIds: ['t28'],
      affectedModIds: ['FireResist1'],
    })
    for (const step of steps) expect(applyCraftStep(catalog, state, step.operation).ok).toBe(true)
  })

  it('骨骼三阶段只在实际揭示后获得目标；待揭示不虚构达成', () => {
    const catalog = boneCatalog()
    let state = value(enableCraftAffixIdentity(catalog, boneState()))
    const config = definitions(['exclusive1'])
    for (let stage = 0; stage < 3; stage++) {
      const legacy = value(analyzeBoneTargets(catalog, state, ['exclusive1']))
      const steps = value(analyzeBoneTargetDefinitions(catalog, state, config))
      expect(steps.map((step) => step.operation)).toEqual(legacy.map((step) => step.operation))
      const step =
        steps.find(
          (step) =>
            stage !== 2 ||
            (step.operation.kind === 'desecration-reveal' && step.operation.modId === 'exclusive1'),
        ) ?? steps[0]
      if (!step) throw Error('缺少骨骼步骤')
      expect(step.gainedTargetIds).toEqual(stage === 2 ? ['t27'] : [])
      const next = value(applyCraftStep(catalog, state, step.operation))
      if (next.nextAffixId === undefined) throw Error('实例模式丢失')
      state = {
        ...next,
        nextAffixId: next.nextAffixId,
        affixes: next.affixes.map((affix) => {
          if (!affix.affixId) throw Error('缺少身份')
          return { ...affix, affixId: affix.affixId }
        }),
      }
    }
    expect(evaluateTargetDefinitions(catalog, state, config).satisfied).toBe(true)
  })

  it('准备路线保留预算与真实追加 rolls 身份，完整路径与最终步骤变化分别计算', () => {
    const catalog = essenceCatalog()
    const state = value(enableCraftAffixIdentity(catalog, { ...boneState(), rarity: 'normal' }))
    const config = definitions(['prefix1', 'suffix1'])
    const old = value(analyzeEssencePreparation(catalog, state, ['prefix1', 'suffix1']))
    const result = value(analyzeEssencePreparationDefinitions(catalog, state, config))
    expect(result.examinedStates).toBe(old.examinedStates)
    expect(result.truncated).toBe(old.truncated)
    expect(result.routes.length).toBeGreaterThan(0)
    for (const [index, route] of result.routes.entries()) {
      expect(route.preparations).toEqual(old.routes[index]?.preparations)
      expect(route.final.operation).toEqual(old.routes[index]?.final.operation)
      let current = state as import('./rehearsal').CraftState
      for (const operation of [...route.preparations, route.final.operation])
        current = value(applyCraftStep(catalog, current, operation))
      expect(route.gainedTargetIds).toEqual(['t27', 't28'])
      expect(route.final.gainedTargetIds).toEqual(['t27'])
      expect(evaluateTargetDefinitions(catalog, current, config).satisfied).toBe(true)
      expect(route.preparations[0]?.rolls?.[0]?.affixId).toBe('a1')
    }
  })

  it('所有入口先拒绝坏定义，不因缺材料或无候选静默通过', () => {
    const catalog = boneCatalog()
    const malformed = { ...definitions(['prefix1']), nextTargetId: 27 }
    for (const analyze of [
      analyzeBoneTargetDefinitions,
      analyzeEssenceTargetDefinitions,
      analyzeAlloyTargetDefinitions,
      analyzeEssencePreparationDefinitions,
    ]) {
      expect(analyze(catalog, boneState(), malformed).ok).toBe(false)
      expect(
        analyze(catalog, boneState(), {
          ...definitions(['prefix1']),
          targets: [
            { targetId: 't27', modId: 'prefix1' },
            { targetId: 't28', modId: 'prefix1' },
          ],
        }).ok,
      ).toBe(false)
    }
  })
})

it('旧无实例输入保留原候选、数值与破裂数量条件，不向操作添加 undefined 身份字段', () => {
  const catalog = essenceCatalog()
  const state = boneState(['prefix2', 'suffix1'])
  const affix = state.affixes[1]
  if (!affix) throw Error('缺少夹具')
  affix.fractured = true
  const config = {
    ...definitions(['prefix1', 'suffix1']),
    fracturedTargetId: 't28',
    minimumTargetCount: 2,
  }
  const original = structuredClone({ state, config })
  const legacy = value(
    analyzeEssenceTargets(catalog, state, ['prefix1', 'suffix1'], [], [], {
      fracturedTargetId: 'suffix1',
      minimumTargetCount: 2,
    }),
  )
  const steps = value(analyzeEssenceTargetDefinitions(catalog, state, config))
  expect(steps.length).toBeGreaterThan(0)
  expect(steps.map((step) => step.operation)).toEqual(legacy.map((step) => step.operation))
  for (const step of steps) {
    expect(Object.hasOwn(step.operation, 'removeAffixId')).toBe(false)
    expect(step.matchedTargetIds).toEqual(['t27', 't28'])
    expect(step.lostTargetIds).toEqual([])
  }
  expect(
    value(analyzeEssenceTargetDefinitions(catalog, state, { ...config, minimumTargetCount: 1 })),
  ).toEqual([])
  expect({ state, config }).toEqual(original)
})
