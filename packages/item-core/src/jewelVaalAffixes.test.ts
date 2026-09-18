import { expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { catalog } from './catalystTestFixture'
import {
  applyVaalJewelAffixChange,
  type VaalJewelAffixChange,
  vaalJewelAffixCandidates,
} from './jewelVaalAffixes'
import { LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { inspectNumericLines } from './numeric'
import {
  addCraftAffix,
  type CraftResult,
  type CraftState,
  craftCandidates,
  createCraftState,
} from './rehearsal'

const must = <T>(result: CraftResult<T>): T => {
  if (!result.ok) throw Error(result.error)
  return result.value
}

it('普通腐化第五条不依赖液态材料；未腐化的五词缀历史仍要求原来源', () => {
  const state = fullJewel()
  const limited = {
    ...catalog,
    liquidEmotions: [],
    _meta: {
      ...catalog._meta,
      sources: catalog._meta.sources.filter((s) => s.path !== LIQUID_EMOTION_SOURCE.path),
    },
  }
  const mod = must(vaalJewelAffixCandidates(limited, state))[0]
  if (!mod) throw Error('缺少瓦尔新增候选：不应依赖液态来源')
  const values = must(inspectNumericLines(mod.lines)).map((range) => range.min)
  const next = must(
    applyVaalJewelAffixChange(limited, state, { outcome: 'add', modId: mod.id, values }),
  )
  expect(createCraftState(limited, next).ok).toBe(true)
  const { corrupted: _, ...withoutCorruption } = next
  expect(createCraftState(limited, withoutCorruption).ok).toBe(false)
  expect(
    createCraftState(limited, {
      ...next,
      affixes: next.affixes.map((a, i) => (i === 0 ? { ...a, fractured: true as const } : a)),
    }).ok,
  ).toBe(false)
})
function fullJewel(baseId = 'Sapphire'): CraftState {
  let state: CraftState = { baseId, itemLevel: 86, rarity: 'rare', affixes: [], sourceText: null }
  for (const kind of ['prefix', 'prefix', 'suffix', 'suffix']) {
    const candidate = craftCandidates(catalog, state).find((mod) => mod.kind === kind)
    if (!candidate) throw Error('合成珠宝缺少可用词缀')
    state = must(addCraftAffix(catalog, state, candidate.id))
  }
  return must(enableCraftAffixIdentity(catalog, state))
}

it.each(['Ruby', 'Emerald', 'Sapphire', 'Diamond'])(
  '%s 从四词缀新增第五条，保留身份与普通容量',
  (baseId) => {
    const state = fullJewel(baseId)
    expect(craftCandidates(catalog, state)).toEqual([])
    const candidates = must(vaalJewelAffixCandidates(catalog, state))
    expect(new Set(candidates.map((mod) => mod.kind))).toEqual(new Set(['prefix', 'suffix']))
    for (const kind of ['prefix', 'suffix']) {
      const mod = candidates.find((entry) => entry.kind === kind)
      if (!mod) throw Error('缺少对应侧别')
      const values = must(inspectNumericLines(mod.lines)).map((range) => range.min)
      const next = must(
        applyVaalJewelAffixChange(catalog, state, { outcome: 'add', modId: mod.id, values }),
      )
      expect(next.corrupted).toBe(true)
      expect(next.affixes).toHaveLength(5)
      expect(next.affixes.slice(0, 4)).toEqual(state.affixes)
      expect(next.affixes[4]?.affixId).toBe('a5')
      expect(next.nextAffixId).toBe(6)
      expect(craftCandidates(catalog, next)).toEqual([])
      expect(addCraftAffix(catalog, state, mod.id).ok).toBe(false)
      expect(
        applyVaalJewelAffixChange(catalog, next, { outcome: 'remove', removeModId: mod.id }).ok,
      ).toBe(false)
    }
    expect(state.affixes).toHaveLength(4)
    expect(state.corrupted).toBeUndefined()
  },
)

it('按实例移除一组，保留其他值和游标，并拒绝错误类型身份组合', () => {
  const state = fullJewel()
  const selected = state.affixes[1]
  if (!selected?.affixId) throw Error('缺少合成实例')
  const next = must(
    applyVaalJewelAffixChange(catalog, state, {
      outcome: 'remove',
      removeModId: selected.modId,
      removeAffixId: selected.affixId,
    }),
  )
  expect(next.affixes).toEqual(state.affixes.filter((_, i) => i !== 1))
  expect(next.nextAffixId).toBe(state.nextAffixId)
  expect(next.corrupted).toBe(true)
  expect(
    applyVaalJewelAffixChange(catalog, state, {
      outcome: 'remove',
      removeModId: selected.modId,
      removeAffixId: 'a1',
    }).ok,
  ).toBe(false)
})

it('拒绝已有同组、错误数值及不属于珠宝池的新增', () => {
  const state = fullJewel()
  const candidate = must(vaalJewelAffixCandidates(catalog, state))[0]
  const existing = state.affixes[0]
  if (!candidate || !existing) throw Error('缺少合成词缀')
  for (const change of [
    { outcome: 'add' as const, modId: existing.modId, values: [1] },
    { outcome: 'add' as const, modId: candidate.id, values: [Number.MAX_SAFE_INTEGER] },
    { outcome: 'add' as const, modId: candidate.id, values: [] },
    { outcome: 'add' as const, modId: 'IncreasedLife1', values: [10] },
  ])
    expect(applyVaalJewelAffixChange(catalog, state, change).ok).toBe(false)
})

it('未核实的稀有度、特殊来源和已增容起点不开放', () => {
  const state = fullJewel()
  const selected = state.affixes[0]
  if (!selected) throw Error('缺少合成词缀')
  const change = { outcome: 'remove' as const, removeModId: selected.modId }
  for (const input of [
    { ...state, baseId: 'Time-Lost Sapphire' },
    { ...state, rarity: 'magic' as const },
    { ...state, baseId: 'Gold Ring' },
    ...['fractured', 'crafted', 'desecrated'].map((marker) => ({
      ...state,
      affixes: state.affixes.map((a, i) => (i === 0 ? { ...a, [marker]: true } : a)),
    })),
  ]) {
    expect(vaalJewelAffixCandidates(catalog, input).ok).toBe(false)
    expect(applyVaalJewelAffixChange(catalog, input, change).ok).toBe(false)
  }
  const mod = must(vaalJewelAffixCandidates(catalog, state))[0]
  if (!mod) throw Error('缺少合成候选')
  const values = must(inspectNumericLines(mod.lines)).map((range) => range.min)
  const five = must(
    applyVaalJewelAffixChange(catalog, state, { outcome: 'add', modId: mod.id, values }),
  )
  const { corrupted: _, ...uncorruptedFive } = five
  expect(applyVaalJewelAffixChange(catalog, uncorruptedFive, change).ok).toBe(false)
})

it('拒绝未知字段、非法结果和非有限数值，不忽略项目夹带字段', () => {
  const state = fullJewel()
  const selected = state.affixes[0]
  if (!selected) throw Error('缺少合成词缀')
  for (const change of [
    null,
    { outcome: 'remove', removeModId: selected.modId, ignored: true },
    { outcome: 'remove', removeModId: selected.modId, removeAffixId: undefined },
    { outcome: 'add', modId: selected.modId, values: [Infinity] },
    { outcome: 'surprise', removeModId: selected.modId },
  ])
    expect(applyVaalJewelAffixChange(catalog, state, change as VaalJewelAffixChange).ok).toBe(false)
})
