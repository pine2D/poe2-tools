import { describe, expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { minimumCraftTargetRolls, projectTargetValues } from './effectiveTargetValues'
import { scaleStatValueBounds } from './statScalability'

describe('催化有效值闭区间', () => {
  it('保留全部内部逆像的显示边界，不用中点代表实际值', () => {
    expect(scaleStatValueBounds(1.4, ['per_minute_to_per_second'], 20)).toEqual({
      ok: true,
      value: { min: 1.6, max: 1.7 },
    })
    expect(scaleStatValueBounds(-1.4, ['per_minute_to_per_second', 'negate'], 20)).toEqual({
      ok: true,
      value: { min: -1.7, max: -1.6 },
    })
    expect(scaleStatValueBounds(6.65, ['divide_by_one_hundred'], 20)).toEqual({
      ok: true,
      value: { min: 7.98, max: 7.98 },
    })
    expect(scaleStatValueBounds(1, [], 41).ok).toBe(false)
  })

  it('22生命阈值对应基础19；21对应18，零品质与不命中标签保持原值', () => {
    const result = projectTargetValues(
      catalog,
      { id: 'Flesh', quality: 20 },
      ['+(10-19) to maximum Life'],
      [['life']],
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.value.ranges[0]).toMatchObject({ min: 12, max: 22 })
    expect(result.value.baseBounds([{ index: 0, min: 22 }])).toEqual({
      ok: true,
      value: [{ index: 0, min: 19, max: 19 }],
    })
    expect(result.value.baseBounds([{ index: 0, min: 21, max: 21 }])).toEqual({
      ok: true,
      value: [{ index: 0, min: 18, max: 18 }],
    })
    expect(result.value.read(['+19(10-19) to maximum Life'])).toEqual({
      ok: true,
      value: [{ min: 22, max: 22 }],
    })
    for (const quality of [undefined, { id: 'Neural', quality: 20 }, { id: 'Flesh', quality: 0 }]) {
      const plain = projectTargetValues(catalog, quality, ['+(10-19) to maximum Life'], [['life']])
      if (!plain.ok) throw new Error(plain.error)
      expect(plain.value.ranges[0]).toMatchObject({ min: 10, max: 19 })
    }
  })

  it('取整导致有效值空洞时报告无基础解，不放宽用户边界', () => {
    const result = projectTargetValues(
      catalog,
      { id: 'Flesh', quality: 20 },
      ['+(10-19) to maximum Life'],
      [['life']],
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.value.baseBounds([{ index: 0, min: 17, max: 17 }])).toEqual({
      ok: true,
      value: null,
    })
    expect(result.value.baseBounds([{ index: 0, min: 21.00000000001, max: 22 }])).toEqual({
      ok: true,
      value: [{ index: 0, min: 19, max: 19 }],
    })
  })

  it('小数显示歧义只在整个区间满足阈值时允许制作，并支持原文不可缩放', () => {
    const line = '(1.1-1.9) Life Regeneration per second'
    const source = {
      ...catalog,
      scalability: {
        ...catalog.scalability,
        [line]: [{ scalable: true, formats: ['per_minute_to_per_second'] }],
      },
    }
    const result = projectTargetValues(source, { id: 'Flesh', quality: 20 }, [line], [['life']])
    if (!result.ok) throw new Error(result.error)
    expect(result.value.read(['1.4(1.1-1.9) Life Regeneration per second'])).toEqual({
      ok: true,
      value: [{ min: 1.6, max: 1.7 }],
    })
    expect(result.value.baseBounds([{ index: 0, min: 1.7 }])).toMatchObject({
      ok: true,
      value: [{ index: 0, min: 1.5 }],
    })
    const fixed = projectTargetValues(
      source,
      { id: 'Flesh', quality: 20 },
      [line],
      [['life']],
      ['1.4(1.1-1.9) Life Regeneration per second (unscalable)'],
    )
    if (!fixed.ok) throw new Error(fixed.error)
    expect(fixed.value.ranges[0]).toMatchObject({ min: 1.1, max: 1.9 })
  })

  it('缺缩放元数据与不支持的格式拒绝有效值目标，不使用显示网格猜算', () => {
    const line = '+(10-19) to maximum Life'
    for (const scalar of [undefined, [{ scalable: true, formats: ['unsupported'] }]]) {
      const source = { ...catalog, scalability: { ...catalog.scalability, [line]: scalar } }
      expect(
        projectTargetValues(
          source as typeof catalog,
          { id: 'Flesh', quality: 20 },
          [line],
          [['life']],
        ).ok,
      ).toBe(false)
    }
  })
})

it('乱序混合词缀按目录身份读取不可缩放尾注，不串到另一行', () => {
  const lines = ['+(10-19) to maximum Life', '+(10-19) to maximum Mana']
  const source = {
    ...catalog,
    scalability: {
      ...catalog.scalability,
      ...Object.fromEntries(lines.map((line) => [line, [{ scalable: true, formats: [] }]])),
    },
  }
  const actual = ['+10(10-19) to maximum Mana', '+10(10-19) to maximum Life (unscalable)']
  const projected = projectTargetValues(
    source,
    { id: 'Flesh', quality: 20 },
    lines,
    [
      ['life', 'mana'],
      ['life', 'mana'],
    ],
    actual,
  )
  if (!projected.ok) throw new Error(projected.error)
  expect(projected.value.read(actual)).toEqual({
    ok: true,
    value: [
      { min: 10, max: 10 },
      { min: 12, max: 12 },
    ],
  })
  expect(projected.value.ranges.map((range) => [range.min, range.max])).toEqual([
    [10, 19],
    [12, 22],
  ])
})

it('内部每分钟网格在两位小数中有空档，反解跳过无逆像显示值仍找到合法结果', () => {
  const line = 'Life Flasks gain (0.13-0.27) charges per Second'
  const source = {
    ...catalog,
    scalability: {
      ...catalog.scalability,
      [line]: [{ scalable: true, formats: ['per_minute_to_per_second_2dp_if_required'] }],
    },
  }
  const projected = projectTargetValues(source, { id: 'Flesh', quality: 20 }, [line], [['life']])
  if (!projected.ok) throw new Error(projected.error)
  expect(projected.value.baseBounds([{ index: 0, min: 0.3 }])).toEqual({
    ok: true,
    value: [{ index: 0, min: 0.25, max: 0.27 }],
  })
  expect(projected.value.baseBounds([{ index: 0, min: 0.2, max: 0.2 }])).toEqual({
    ok: true,
    value: [{ index: 0, min: 0.17, max: 0.17 }],
  })
})

it('稀疏正负网格及细分目录精度的反解，与逐点枚举结果一致', () => {
  for (const line of ['Life (-0.27-0.27)', 'Life (-0.270000-0.270000)']) {
    const source = {
      ...catalog,
      scalability: {
        ...catalog.scalability,
        [line]: [{ scalable: true, formats: ['per_minute_to_per_second_2dp_if_required'] }],
      },
    }
    const projected = projectTargetValues(source, { id: 'Flesh', quality: 20 }, [line], [['life']])
    if (!projected.ok) throw new Error(projected.error)
    const valid = Array.from({ length: 55 }, (_, index) => (index - 27) / 100).flatMap((value) => {
      const scaled = scaleStatValueBounds(value, ['per_minute_to_per_second_2dp_if_required'], 20)
      return scaled.ok ? [{ value, ...scaled.value }] : []
    })
    for (let lower = -35; lower <= 35; lower += 5) {
      for (let upper = lower; upper <= 35; upper += 5) {
        const accepted = valid.filter(
          (value) => value.min >= lower / 100 && value.max <= upper / 100,
        )
        expect(
          projected.value.baseBounds([{ index: 0, min: lower / 100, max: upper / 100 }]),
        ).toEqual({
          ok: true,
          value: accepted.length
            ? [{ index: 0, min: accepted[0]?.value, max: accepted.at(-1)?.value }]
            : null,
        })
      }
    }
  }
})

it('神圣不能因原值落在反解闭区间内就保留没有内部逆像的显示值', () => {
  const line = 'Life Flasks gain (0.13-0.27) charges per Second'
  const source = {
    ...catalog,
    scalability: {
      ...catalog.scalability,
      [line]: [{ scalable: true, formats: ['per_minute_to_per_second_2dp_if_required'] }],
    },
  }
  const original = catalog.modifiers.find((mod) => mod.id === 'IncreasedLife1')
  if (!original) throw new Error('缺少测试词缀')
  const mod = { ...original, lines: [line] }
  const state = {
    baseId: 'Gold Ring',
    itemLevel: 86,
    rarity: 'rare' as const,
    sourceText: null,
    affixes: [],
    catalyst: { id: 'Flesh', quality: 20, declared: true as const },
  }
  const goal = {
    modId: mod.id,
    basis: 'effective' as const,
    bounds: [{ index: 0, min: 0.15, max: 0.32 }],
  }
  expect(
    minimumCraftTargetRolls(source, state, mod, goal, [
      'Life Flasks gain 0.16(0.13-0.27) charges per Second',
    ]),
  ).toEqual([0.13])
})
