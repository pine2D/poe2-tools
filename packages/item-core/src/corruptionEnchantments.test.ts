import { describe, expect, it } from 'vitest'
import catalogData from '../../../data/craft/catalog.json'
import type { CraftCatalog } from './catalog'
import { corruptionCandidates } from './corruptionEnchantments'
import { applyCraftStep } from './craftSteps'
import { type CraftState, createCraftState } from './rehearsal'

const catalog = catalogData as CraftCatalog
const bow: CraftState = {
  baseId: 'Crude Bow',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  affixes: [
    {
      modId: 'LocalIncreasedPhysicalDamagePercent1',
      lines: ['40(40-49)% increased Physical Damage'],
    },
  ],
  quality: 20,
  sockets: [],
}

describe('独立腐化强化层', () => {
  it('按有序资格筛选，不把弓视作其他双手武器，不纳入特殊腐化或珠宝', () => {
    const ids = corruptionCandidates(catalog, bow).map((m) => m.id)
    expect(ids).toContain('CorruptionLocalAddedFireDamage1')
    expect(ids).not.toContain('CorruptionLocalAddedFireDamageTwoHand1')
    expect(ids).not.toContain('SpecialCorruptionAreaOfEffect1')
    expect(corruptionCandidates(catalog, { ...bow, corrupted: true })).toEqual([])
    expect(corruptionCandidates(catalog, { ...bow, baseId: 'Ruby', affixes: [] })).toEqual([])
  })
  it('腐化同组物理词缀保留显式属性且不占容量，状态深拷贝', () => {
    const result = applyCraftStep(catalog, bow, {
      kind: 'vaal',
      outcome: 'enchant',
      modId: 'CorruptionLocalIncreasedPhysicalDamagePercent1',
      values: [20],
    })
    if (!result.ok) throw new Error(result.error)
    expect(result.value.affixes).toEqual(bow.affixes)
    expect(result.value.corruption).toEqual({
      modId: 'CorruptionLocalIncreasedPhysicalDamagePercent1',
      lines: ['20(15-25)% increased Physical Damage'],
    })
    expect(result.value.corrupted).toBe(true)
    const clone = createCraftState(catalog, result.value)
    if (!clone.ok) throw new Error(clone.error)
    clone.value.corruption?.lines.push('changed')
    expect(result.value.corruption?.lines).toHaveLength(1)
    expect(bow).not.toHaveProperty('corrupted')
  })
  it('拒绝缺少腐化标记、特殊域、未知掷值、错误范围和来源指纹', () => {
    const corruption = {
      modId: 'CorruptionLocalIncreasedPhysicalDamagePercent1',
      lines: ['20(15-25)% increased Physical Damage'],
    }
    expect(createCraftState(catalog, { ...bow, corruption }).ok).toBe(false)
    for (const patch of [
      null,
      undefined,
      { ...corruption, future: true },
      { ...corruption, lines: ['(15-25)% increased Physical Damage'] },
      { ...corruption, lines: ['26(15-25)% increased Physical Damage'] },
      { ...corruption, modId: 'SpecialCorruptionAreaOfEffect1' },
    ]) {
      expect(
        createCraftState(catalog, {
          ...bow,
          corrupted: true,
          corruption: patch,
        } as unknown as CraftState).ok,
      ).toBe(false)
    }
    expect(
      createCraftState(
        { ...catalog, _meta: { ...catalog._meta, sources: [] } },
        { ...bow, corrupted: true, corruption },
      ).ok,
    ).toBe(false)
  })
})
