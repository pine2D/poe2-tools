import { describe, expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import type {
  CraftTargetDefinition,
  CraftTargetDefinitionAlternative,
  CraftTargetDefinitionValues,
} from './targetDefinitions'
import { readTargetDefinitionValues } from './targetDefinitionValues'

const targets: CraftTargetDefinition[] = [
  { targetId: 't9', modId: 'prefix1' },
  { targetId: 't2', modId: 'prefix1' },
]
const alternatives: CraftTargetDefinitionAlternative[] = [
  { targetId: 't9', modIds: ['prefix2'] },
  { targetId: 't2', modIds: ['prefix2'] },
]

describe('独立数值条件集合（不授权目标共存）', () => {
  it('同类型的不同目标保留各自主档、替代档阈值及输入顺序', () => {
    const input: CraftTargetDefinitionValues[] = [
      { targetId: 't2', modId: 'prefix2', bounds: [{ index: 0, max: 4 }] },
      { targetId: 't9', modId: 'prefix1', bounds: [{ index: 0, min: 8 }] },
      { targetId: 't2', modId: 'prefix1', bounds: [{ index: 0, min: 2 }] },
      { targetId: 't9', modId: 'prefix2', bounds: [{ index: 0, min: 7 }] },
    ]
    const checked = readTargetDefinitionValues(
      boneCatalog(),
      'Synthetic Base',
      targets,
      alternatives,
      input,
    )
    expect(checked).toEqual({ ok: true, value: input })
    if (!checked.ok) throw Error(checked.error)
    const bound = checked.value[0]?.bounds[0]
    if (!bound) throw Error('缺少数值条件')
    bound.max = 3
    expect(input[0]?.bounds[0]?.max).toBe(4)
    expect(checked.value[1]?.targetId).toBe('t9')
  })

  it('替代档只属于选定目标，拒绝跨目标关联、重复二元键及悬空目标', () => {
    const owned = [{ targetId: 't9', modIds: ['prefix2'] }]
    const valid = { targetId: 't9', modId: 'prefix2', bounds: [{ index: 0, min: 3 }] }
    for (const input of [
      [valid, valid],
      [{ ...valid, targetId: 't2' }],
      [{ ...valid, targetId: 't3' }],
      [{ ...valid, modId: 'suffix1' }],
      [{ ...valid, extra: true }],
      [{ ...valid, basis: undefined }],
    ])
      expect(
        readTargetDefinitionValues(boneCatalog(), 'Synthetic Base', targets, owned, input).ok,
      ).toBe(false)
  })

  it('共同核对基础阈值与数值范围，不因已有tN跳过数值门禁', () => {
    for (const bounds of [
      [],
      [{ index: 0, min: 11 }],
      [{ index: 0, min: Number.NaN }],
      [{ index: 1, min: 2 }],
      [{ index: 0, min: 5, max: 2 }],
      [
        { index: 0, min: 2 },
        { index: 0, max: 4 },
      ],
      [{ index: 0, min: 2, extra: true }],
    ])
      expect(
        readTargetDefinitionValues(
          boneCatalog(),
          'Synthetic Base',
          targets,
          [],
          [{ targetId: 't9', modId: 'prefix1', bounds }],
        ).ok,
      ).toBe(false)
  })

  it('当前投影歧义仍可存储，运行检查保持失败且不改写effective条件', () => {
    const catalog = boneCatalog()
    const mod = catalog.modifiers.find((entry) => entry.id === 'prefix1')
    if (!mod) throw Error('缺少词缀')
    mod.lines = ['Value (1-10)', 'Value (1-5)']
    const state = { ...boneState(), affixes: [{ modId: 'prefix1', lines: ['Value 3', 'Value 4'] }] }
    const input = [
      { targetId: 't9', modId: 'prefix1', basis: 'effective', bounds: [{ index: 0, min: 7 }] },
    ]
    expect(readTargetDefinitionValues(catalog, state.baseId, targets, [], input)).toEqual({
      ok: true,
      value: input,
    })
    expect(
      readTargetDefinitionValues(catalog, state.baseId, targets, [], input, { state }).ok,
    ).toBe(false)
    expect(input[0]?.basis).toBe('effective')
  })
})
