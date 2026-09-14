import { describe, expect, it } from 'vitest'
import { catalog, imported } from './catalystTestFixture'
import { collectCraftCosts } from './craftCosts'
import { applyCraftStep } from './craftSteps'
import { type CraftOmen, craftOmenDescription } from './omens'
import {
  type CraftCurrency,
  type CraftState,
  craftCandidates,
  prepareCraftOperation,
} from './rehearsal'

const omen = 'catalysing_exaltation' as CraftOmen
function initial(): CraftState {
  const result = imported()
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('催化崇高的实际品质消耗', () => {
  it.each(['exalted', 'greater_exalted', 'perfect_exalted'] as const)(
    '%s 消耗品质但保留全部合法标签及通货等级要求',
    (currency) => {
      const state = initial()
      const snapshot = JSON.stringify(state)
      const prepared = prepareCraftOperation(catalog, state, currency, undefined, omen)
      if (!prepared.ok) throw new Error(prepared.error)
      expect(prepared.value.state.catalyst).toEqual({ id: 'Flesh', quality: 0 })
      expect(prepared.value.count).toBe(1)
      const pool = craftCandidates(catalog, prepared.value.state, currency, omen)
      expect(pool.map((mod) => mod.id)).toEqual(
        craftCandidates(catalog, state, currency).map((mod) => mod.id),
      )
      const nonLife = pool.find((mod) => mod.tags.includes('fire') && !mod.tags.includes('life'))
      if (!nonLife) throw new Error('缺少未命中催化标签的合法结果')
      const operation = { currency, omen, modIds: [nonLife.id] }
      const result = applyCraftStep(catalog, state, operation)
      if (!result.ok) throw new Error(result.error)
      expect(result.value.catalyst).toEqual({ id: 'Flesh', quality: 0 })
      expect(result.value.affixes[0]).toEqual(state.affixes[0])
      expect(result.value.affixes.at(-1)?.modId).toBe(nonLife.id)
      expect(JSON.stringify(state)).toBe(snapshot)
      expect(prepareCraftOperation(catalog, result.value, currency, undefined, omen).ok).toBe(false)
      expect(collectCraftCosts(catalog, [operation])).toMatchObject({
        ok: true,
        value: [
          { id: `currency:${currency}`, count: 1 },
          { id: 'omen:Omen of Catalysing Exaltation', count: 1 },
        ],
      })
    },
  )

  it('不支持无品质、零品质、魔法起点、珠宝或非崇高步骤，拒绝时不消费', () => {
    const state = initial()
    const noQuality = { ...state }
    delete noQuality.catalyst
    noQuality.sourceText = null
    for (const input of [
      noQuality,
      { ...state, catalyst: { id: 'Flesh', quality: 0 } },
      { ...state, rarity: 'magic' as const },
      {
        baseId: 'Ruby',
        itemLevel: 86,
        rarity: 'rare' as const,
        sourceText: null,
        affixes: [],
        catalyst: { id: 'Flesh', quality: 20 },
      },
    ]) {
      const snapshot = JSON.stringify(input)
      expect(prepareCraftOperation(catalog, input, 'exalted', undefined, omen).ok).toBe(false)
      expect(JSON.stringify(input)).toBe(snapshot)
    }
    for (const currency of ['augmentation', 'regal', 'chaos', 'divine'] as CraftCurrency[])
      expect(prepareCraftOperation(catalog, state, currency, undefined, omen).ok).toBe(false)
    expect(
      applyCraftStep(catalog, state, { currency: 'exalted', omen, modIds: ['not-a-mod'] }).ok,
    ).toBe(false)
    expect(state.catalyst?.quality).toBe(20)
  })

  it('说明消耗、概率未知与非保证命中，不能说成后缀限定', () => {
    expect(craftOmenDescription(omen)).toContain('全部催化品质')
    expect(craftOmenDescription(omen)).toContain('不保证')
    expect(craftOmenDescription(omen)).not.toContain('仅新增后缀')
  })

  it('满词缀、缺缩放来源和通货物等不足均拒绝；无预兆崇高仍保留品质', () => {
    const state = initial()
    let filled = state
    while (filled.affixes.length < 6) {
      const mod = craftCandidates(catalog, filled, 'exalted')[0]
      if (!mod) throw new Error('缺少填充词缀')
      const added = applyCraftStep(catalog, filled, { currency: 'exalted', modIds: [mod.id] })
      if (!added.ok) throw new Error(added.error)
      filled = added.value
      expect(filled.catalyst?.quality).toBe(20)
    }
    const snapshot = JSON.stringify(filled)
    expect(prepareCraftOperation(catalog, filled, 'exalted', undefined, omen).ok).toBe(false)
    expect(JSON.stringify(filled)).toBe(snapshot)
    const missingSource = {
      ...catalog,
      _meta: {
        ...catalog._meta,
        sources: catalog._meta.sources.filter(
          (source) => source.path !== 'src/Data/ModScalability.lua',
        ),
      },
    }
    expect(prepareCraftOperation(missingSource, state, 'exalted', undefined, omen).ok).toBe(false)
    expect(
      prepareCraftOperation(catalog, { ...state, itemLevel: 1 }, 'perfect_exalted', undefined, omen)
        .ok,
    ).toBe(false)
  })
})
