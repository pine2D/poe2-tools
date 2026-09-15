import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { boneCatalog, boneState } from './boneTestFixture'
import { catalog } from './catalystTestFixture'
import { applyCraftStep, type CraftStep } from './craftSteps'
import type { CraftResult, CraftState } from './rehearsal'

const value = <T>(result: CraftResult<T>): T => {
  if (!result.ok) throw Error(result.error)
  return result.value
}
const bow: CraftState = {
  baseId: 'Crude Bow',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  sockets: [],
  affixes: [
    {
      modId: 'LocalIncreasedPhysicalDamagePercent1',
      lines: ['40(40-49)% increased Physical Damage'],
    },
  ],
}

describe('全部制作分发保留词缀实例', () => {
  it('亵渎分发按实例替换，固定候选后揭示仅分配一次', () => {
    const catalog = boneCatalog()
    const initial = value(
      enableCraftAffixIdentity(
        catalog,
        boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3']),
      ),
    )
    const snapshot = structuredClone(initial)
    const pending = value(
      applyCraftStep(catalog, initial, {
        kind: 'desecrate',
        boneId: 'preserved_rib',
        affixKind: 'suffix',
        removeModId: 'suffix2',
        removeAffixId: 'a5',
      }),
    )
    const offered = value(
      applyCraftStep(catalog, pending, {
        kind: 'desecration-offer',
        modIds: ['exclusive1', 'exclusive2', 'exclusive3'],
      }),
    )
    const revealed = value(
      applyCraftStep(catalog, offered, {
        kind: 'desecration-reveal',
        modId: 'exclusive2',
        values: [7],
      }),
    )
    expect(pending.nextAffixId).toBe(7)
    expect(offered.nextAffixId).toBe(7)
    expect(revealed.nextAffixId).toBe(8)
    expect(revealed.affixes.map((a) => a.affixId)).toEqual(['a1', 'a2', 'a3', 'a4', 'a6', 'a7'])
    expect(initial).toEqual(snapshot)
  })

  it('瓦尔顺序替换经统一分发分配实例并标记腐化', () => {
    const initial = value(
      enableCraftAffixIdentity(catalog, {
        baseId: 'Gold Ring',
        itemLevel: 86,
        rarity: 'rare',
        sourceText: null,
        affixes: [{ modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] }],
      }),
    )
    const step: CraftStep = {
      kind: 'vaal',
      outcome: 'reroll',
      replacements: [
        {
          removeModId: 'IncreasedLife1',
          removeAffixId: 'a1',
          modId: 'IncreasedLife2',
          values: [25],
        },
        {
          removeModId: 'IncreasedLife2',
          removeAffixId: 'a2',
          modId: 'IncreasedLife3',
          values: [35],
        },
      ],
    }
    const result = value(applyCraftStep(catalog, initial, step))
    expect(result.affixes).toEqual([
      { modId: 'IncreasedLife3', affixId: 'a3', lines: ['+35(30-39) to maximum Life'] },
    ])
    expect(result.nextAffixId).toBe(4)
    expect(result.corrupted).toBe(true)
    expect(initial.nextAffixId).toBe(2)
  })

  it.each<Extract<CraftStep, { kind: 'vaal' }>>([
    { kind: 'vaal', outcome: 'unchanged' },
    { kind: 'vaal', outcome: 'socket' },
    {
      kind: 'vaal',
      outcome: 'enchant',
      modId: 'CorruptionLocalIncreasedPhysicalDamagePercent1',
      values: [20],
    },
  ])('腐化 $outcome 不改变显式词缀身份，建筑师摧毁保留历史快照', (step) => {
    const initial = value(enableCraftAffixIdentity(catalog, bow))
    const snapshot = structuredClone(initial)
    const result = value(applyCraftStep(catalog, initial, step))
    expect(result.affixes).toEqual(initial.affixes)
    expect(result.nextAffixId).toBe(2)
    if (step.kind === 'vaal' && step.outcome === 'enchant')
      expect(result.corruption).not.toHaveProperty('affixId')
    const destroyed = value(
      applyCraftStep(catalog, result, { kind: 'architect', outcome: 'destroy' }),
    )
    expect(destroyed.destroyed).toBe(true)
    expect(destroyed.affixes).toEqual(initial.affixes)
    expect(destroyed.nextAffixId).toBe(2)
    expect(initial).toEqual(snapshot)
  })
})
