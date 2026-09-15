import { describe, expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { catalog as primary } from './catalystTestFixture'
import type { CraftState } from './rehearsal'
import {
  inspectCraftTargetInstances,
  lostCraftTargetIds,
  matchedCraftTargetIds,
} from './targetProgress'
import type { CraftTargetValues } from './targets'

const catalog = boneCatalog()
const goal: CraftTargetValues = { modId: 'prefix1', bounds: [{ index: 0, min: 7 }] }
function state(): CraftState {
  return {
    ...boneState(),
    nextAffixId: 3,
    affixes: [
      { modId: 'prefix1', affixId: 'a1', lines: ['prefix1 3'] },
      { modId: 'prefix1', affixId: 'a2', lines: ['prefix1 8'] },
    ],
  }
}

describe('目标逐实例纯评估（不开放重复状态准入）', () => {
  it('遍历同类型全部实例，返回真实达标实例及其完整数值', () => {
    const current = state()
    expect(matchedCraftTargetIds(catalog, current, ['prefix1'], [['prefix1']], [goal])).toEqual([
      'prefix1',
    ])
    expect(
      inspectCraftTargetInstances(catalog, current, 'prefix1', goal).map((entry) => ({
        index: entry.index,
        affixId: entry.affix.affixId,
        actual: entry.actual,
        matched: entry.matched,
      })),
    ).toEqual([
      { index: 0, affixId: 'a1', actual: [{ min: 3, max: 3 }], matched: false },
      { index: 1, affixId: 'a2', actual: [{ min: 8, max: 8 }], matched: true },
    ])
  })

  it('数值与破裂必须来自同一实例，反转顺序不改变结论', () => {
    const current = state()
    current.affixes = current.affixes.map((affix, index) =>
      index === 0 ? { ...affix, fractured: true } : affix,
    )
    for (const affixes of [current.affixes, [...current.affixes].reverse()]) {
      expect(
        matchedCraftTargetIds(
          catalog,
          { ...current, affixes },
          ['prefix1'],
          [['prefix1']],
          [goal],
          'prefix1',
        ),
      ).toEqual([])
    }
    current.affixes = current.affixes.map((affix) => ({ ...affix, lines: ['prefix1 8'] }))
    expect(
      matchedCraftTargetIds(catalog, current, ['prefix1'], [['prefix1']], [goal], 'prefix1'),
    ).toEqual(['prefix1'])
  })

  it('全部数值条件不能跨实例拼接，接受档位独立使用自身条件', () => {
    const multi = boneCatalog()
    const mod = multi.modifiers.find((entry) => entry.id === 'prefix1')
    if (!mod) throw new Error('夹具缺失')
    mod.lines = ['first (1-10)', 'second (1-10)']
    const current = state()
    current.affixes = current.affixes.map((affix, index) => ({
      ...affix,
      lines: index === 0 ? ['first 8', 'second 3'] : ['first 3', 'second 8'],
    }))
    const both: CraftTargetValues = {
      modId: 'prefix1',
      bounds: [
        { index: 0, min: 7 },
        { index: 1, min: 7 },
      ],
    }
    expect(matchedCraftTargetIds(multi, current, ['prefix1'], [['prefix1']], [both])).toEqual([])
    expect(
      inspectCraftTargetInstances(multi, current, 'prefix1', both).every((entry) => !entry.matched),
    ).toBe(true)
    expect(
      matchedCraftTargetIds(catalog, state(), ['prefix2'], [['prefix2', 'prefix1']], [goal]),
    ).toEqual(['prefix2'])
  })

  it('删除不达标副本不报损失，删除达标副本留下不达标副本仍报损失', () => {
    const before = state()
    const after = (index: number) => ({
      ...before,
      affixes: before.affixes.filter((_, position) => position !== index),
    })
    expect(
      lostCraftTargetIds(catalog, before, after(0), ['prefix1'], [['prefix1']], [goal]),
    ).toEqual([])
    expect(
      lostCraftTargetIds(catalog, before, after(1), ['prefix1'], [['prefix1']], [goal]),
    ).toEqual(['prefix1'])
    expect(before.affixes.map((affix) => affix.affixId)).toEqual(['a1', 'a2'])
  })

  it('损失报告使用真实接受档位并去重，未达标类型完全消失仍报告身份丢失', () => {
    const before = state()
    const empty = { ...before, affixes: [] }
    expect(
      lostCraftTargetIds(catalog, before, empty, ['prefix2'], [['prefix2', 'prefix1']], [goal]),
    ).toEqual(['prefix1'])
    const unmet = {
      ...before,
      affixes: before.affixes.map((affix) => ({ ...affix, lines: ['prefix1 3'] })),
    }
    expect(
      lostCraftTargetIds(catalog, unmet, empty, ['prefix2'], [['prefix2', 'prefix1']], [goal]),
    ).toEqual(['prefix1'])
    expect(
      lostCraftTargetIds(
        catalog,
        unmet,
        { ...unmet, affixes: unmet.affixes.slice(1) },
        ['prefix2'],
        [['prefix2', 'prefix1']],
        [goal],
      ),
    ).toEqual([])
  })

  it('有效值按每实例独立投影，品质消耗后的条件丢失仍报告', () => {
    const before: CraftState = {
      ...state(),
      baseId: 'Gold Ring',
      catalyst: { id: 'Flesh', quality: 20 },
      affixes: [
        { modId: 'IncreasedLife1', affixId: 'a1', lines: ['+18(10-19) to maximum Life'] },
        { modId: 'IncreasedLife1', affixId: 'a2', lines: ['+19(10-19) to maximum Life'] },
      ],
    }
    const goal: CraftTargetValues = {
      modId: 'IncreasedLife1',
      basis: 'effective',
      bounds: [{ index: 0, min: 22 }],
    }
    expect(
      inspectCraftTargetInstances(primary, before, goal.modId, goal).map((entry) => ({
        actual: entry.actual,
        matched: entry.matched,
      })),
    ).toEqual([
      { actual: [{ min: 21, max: 21 }], matched: false },
      { actual: [{ min: 22, max: 22 }], matched: true },
    ])
    expect(
      lostCraftTargetIds(
        primary,
        before,
        { ...before, catalyst: { id: 'Flesh', quality: 0 } },
        [goal.modId],
        [[goal.modId]],
        [goal],
      ),
    ).toEqual([goal.modId])
  })

  it('破裂损失仅在调用方要求完整条件时参与，数值保护保持原语义', () => {
    const after = state()
    const before = {
      ...after,
      affixes: after.affixes.map((affix, index) =>
        index === 1 ? { ...affix, fractured: true as const } : affix,
      ),
    }
    expect(lostCraftTargetIds(catalog, before, after, ['prefix1'], [['prefix1']], [goal])).toEqual(
      [],
    )
    expect(
      lostCraftTargetIds(catalog, before, after, ['prefix1'], [['prefix1']], [goal], 'prefix1'),
    ).toEqual(['prefix1'])
  })
})
