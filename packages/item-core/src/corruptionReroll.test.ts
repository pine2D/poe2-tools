import { describe, expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { collectCraftCosts } from './craftCosts'
import { applyCraftStep, type CraftStep } from './craftSteps'
import type { CraftState } from './rehearsal'

const ring: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'magic',
  sourceText: null,
  implicitLines: ['10(6-15)% increased Rarity of Items found'],
  affixes: [
    { modId: 'IncreasedLife1', lines: ['+19(10-19) to maximum Life'] },
    { modId: 'FireResist1', lines: ['+10(6-10)% to Fire Resistance'] },
  ],
}
const replacement = { removeModId: 'IncreasedLife1', modId: 'IncreasedLife2', values: [25] }
const step = (replacements: unknown): CraftStep =>
  ({ kind: 'vaal', outcome: 'reroll', replacements }) as CraftStep

describe('瓦尔顺序替换', () => {
  it('三次连续替换同一位置，保留魔法稀有度与未动属性，只计一颗瓦尔', () => {
    const operation = step([
      replacement,
      { removeModId: 'IncreasedLife2', modId: 'IncreasedLife3', values: [35] },
      { removeModId: 'IncreasedLife3', modId: 'IncreasedLife1', values: [10] },
    ])
    const result = applyCraftStep(catalog, ring, operation)
    if (!result.ok) throw Error(result.error)
    expect(result.value).toEqual({
      ...ring,
      corrupted: true,
      affixes: [
        ring.affixes[1],
        { modId: 'IncreasedLife1', lines: ['+10(10-19) to maximum Life'] },
      ],
    })
    expect(ring.affixes[0]?.lines[0]).toBe('+19(10-19) to maximum Life')
    expect(ring).not.toHaveProperty('corrupted')
    expect(collectCraftCosts(catalog, [operation])).toEqual({
      ok: true,
      value: [{ id: 'currency:vaal', name: 'Vaal Orb', count: 1 }],
    })
  })
  it('逐次检查容量、组冲突及物等，不让批量最终状态掩盖非法中间状态', () => {
    for (const replacements of [
      [{ ...replacement, modId: 'ColdResist1', values: [10] }],
      [replacement, { ...replacement, modId: 'IncreasedMana1', values: [12] }],
      [{ ...replacement, values: [30] }],
      [{ ...replacement, values: [] }],
      [{ ...replacement, modId: 'FireResist1', values: [10] }],
    ])
      expect(applyCraftStep(catalog, ring, step(replacements)).ok).toBe(false)
    expect(applyCraftStep(catalog, { ...ring, itemLevel: 1 }, step([replacement])).ok).toBe(false)
  })
  it('特殊来源与空词缀拒绝此分支，保留催化品质及实际数值', () => {
    const rare: CraftState = { ...ring, rarity: 'rare', catalyst: { id: 'Flesh', quality: 20 } }
    const result = applyCraftStep(catalog, rare, step([replacement]))
    if (!result.ok) throw Error(result.error)
    expect(result.value.catalyst).toEqual(rare.catalyst)
    for (const marker of ['fractured', 'crafted', 'desecrated']) {
      expect(
        applyCraftStep(
          catalog,
          {
            ...rare,
            affixes: rare.affixes.map((a, i) => (i === 0 ? { ...a, [marker]: true } : a)),
          },
          step([replacement]),
        ).ok,
      ).toBe(false)
    }
    for (const state of [
      { ...ring, affixes: [] },
      { ...ring, corrupted: true as const },
      { ...ring, baseId: 'Ruby', affixes: [], implicitLines: undefined },
    ])
      expect(applyCraftStep(catalog, state as CraftState, step([replacement])).ok).toBe(false)
  })
  it('拒绝空、多于三次和未知字段，不忽略后续畸形步骤', () => {
    for (const replacements of [
      [],
      null,
      [replacement, replacement, replacement, replacement],
      [{ ...replacement, omen: 'whittling' }],
      [replacement, null],
      [{ ...replacement, values: [NaN] }],
      [{ ...replacement, removeModId: '' }],
    ])
      expect(applyCraftStep(catalog, ring, step(replacements)).ok).toBe(false)
    expect(
      applyCraftStep(catalog, ring, {
        ...step([replacement]),
        omen: 'corruption',
      } as unknown as CraftStep).ok,
    ).toBe(false)
  })
})
