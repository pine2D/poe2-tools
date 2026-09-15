import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { catalog } from './catalystTestFixture'
import { prepareVaalReplacement, replayVaalReplacements } from './corruptionReroll'
import { isVaalCraftOperation, isVaalReplacement, type VaalReplacement } from './corruptionRules'
import { type CraftResult, type CraftState, craftCandidates } from './rehearsal'

const must = <T>(result: CraftResult<T>): T => {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
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
const replacements: [VaalReplacement, VaalReplacement, VaalReplacement] = [
  { removeModId: 'IncreasedLife1', removeAffixId: 'a1', modId: 'IncreasedLife2', values: [25] },
  { removeModId: 'IncreasedLife2', removeAffixId: 'a9', modId: 'IncreasedLife3', values: [35] },
  { removeModId: 'IncreasedLife3', removeAffixId: 'a10', modId: 'IncreasedLife1', values: [10] },
]
const identified = () => ({ ...must(enableCraftAffixIdentity(catalog, ring)), nextAffixId: 9 })

describe('瓦尔替换实例生命周期', () => {
  it('替换条目支持移除实例，严格拒绝显式空身份及额外字段', () => {
    expect(isVaalReplacement(replacements[0])).toBe(true)
    expect(isVaalCraftOperation({ kind: 'vaal', outcome: 'reroll', replacements })).toBe(true)
    for (const patch of [
      { removeAffixId: undefined },
      { removeAffixId: '' },
      { removeAffixId: null },
      { removeAffixId: 1 },
      { extra: true },
    ]) {
      const invalid = { ...replacements[0], ...patch }
      expect(isVaalReplacement(invalid)).toBe(false)
      expect(replayVaalReplacements(catalog, identified(), [invalid as VaalReplacement]).ok).toBe(
        false,
      )
    }
  })

  it('旧字符串与实例选择产生相同候选，预备移除不分配或重置游标', () => {
    const input = identified()
    const legacy = must(prepareVaalReplacement(catalog, ring, 'IncreasedLife1'))
    const prepared = must(
      prepareVaalReplacement(catalog, input, { modId: 'IncreasedLife1', affixId: 'a1' }),
    )
    expect(prepared).toEqual({ ...input, affixes: [input.affixes[1]] })
    expect(craftCandidates(catalog, prepared).map((mod) => mod.id)).toEqual(
      craftCandidates(catalog, legacy).map((mod) => mod.id),
    )
    expect(craftCandidates(catalog, prepared).some((mod) => mod.id === 'IncreasedLife2')).toBe(true)
    expect(prepareVaalReplacement(catalog, input, 'IncreasedLife1')).toEqual({
      ok: true,
      value: prepared,
    })
  })

  it.each([
    [1, 'IncreasedLife2', '+25(20-29) to maximum Life', 'a9', 10],
    [2, 'IncreasedLife3', '+35(30-39) to maximum Life', 'a10', 11],
    [3, 'IncreasedLife1', '+10(10-19) to maximum Life', 'a11', 12],
  ] as const)(
    '%i 次替换只给新增实例写入数值，下一次可选择上次新 ID',
    (count, modId, line, id, cursor) => {
      const input = identified()
      const before = structuredClone(input)
      const sequence = replacements.slice(0, count)
      const preview = replayVaalReplacements(catalog, input, sequence)
      expect(preview).toEqual({
        ok: true,
        value: {
          ...input,
          nextAffixId: cursor,
          affixes: [input.affixes[1], { modId, affixId: id, lines: [line] }],
        },
      })
      expect(replayVaalReplacements(catalog, input, sequence)).toEqual(preview)
      expect(input).toEqual(before)
      const legacy = sequence.map(({ removeAffixId: _, ...entry }) => entry)
      expect(replayVaalReplacements(catalog, input, legacy)).toEqual(preview)
      expect(replayVaalReplacements(catalog, ring, legacy)).toEqual({
        ok: true,
        value: { ...ring, affixes: [ring.affixes[1], { modId, lines: [line] }] },
      })
    },
  )

  it('缺失、过期与类型不一致的 ID 不回退，旧状态不能指定实例', () => {
    const input = identified()
    for (const selector of [
      { modId: 'IncreasedLife1', affixId: 'a99' },
      { modId: 'IncreasedLife1', affixId: 'a2' },
      { modId: 'FireResist1', affixId: 'a1' },
    ]) {
      expect(prepareVaalReplacement(catalog, input, selector).ok).toBe(false)
    }
    expect(replayVaalReplacements(catalog, ring, replacements.slice(0, 1)).ok).toBe(false)
    for (const removeAffixId of ['a1', 'a2', 'a99']) {
      expect(
        replayVaalReplacements(catalog, input, [
          replacements[0],
          { ...replacements[1], removeAffixId },
        ]).ok,
      ).toBe(false)
    }
    const first = must(replayVaalReplacements(catalog, input, replacements.slice(0, 1)))
    expect(
      prepareVaalReplacement(catalog, first, { modId: 'IncreasedLife2', affixId: 'a1' }).ok,
    ).toBe(false)
  })

  it('实例不会放宽特殊来源、容量、物等及实际值限制', () => {
    const input = identified()
    for (const marker of ['fractured', 'crafted', 'desecrated'] as const) {
      const state = {
        ...input,
        affixes: input.affixes.map((affix, index) =>
          index === 0 ? { ...affix, [marker]: true as const } : affix,
        ),
      }
      expect(replayVaalReplacements(catalog, state, replacements.slice(0, 1)).ok).toBe(false)
    }
    for (const patch of [
      { modId: 'ColdResist1', values: [10] },
      { modId: 'FireResist1', values: [10] },
      { values: [30] },
      { values: [] },
    ]) {
      expect(replayVaalReplacements(catalog, input, [{ ...replacements[0], ...patch }]).ok).toBe(
        false,
      )
    }
    expect(
      replayVaalReplacements(catalog, { ...input, itemLevel: 1 }, replacements.slice(0, 1)).ok,
    ).toBe(false)
  })
})
