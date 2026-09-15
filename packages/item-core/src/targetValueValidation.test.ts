import { describe, expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { imported, catalog as primaryCatalog } from './catalystTestFixture'
import { applyCraftOperation, type CraftResult } from './rehearsal'
import { validateCraftTargetValues, validateStoredCraftTargetValues } from './targets'
import { readCraftTargetValue } from './targetValueValidation'

function value<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

const goal = { modId: 'prefix1', bounds: [{ index: 0, min: 4.5, max: 8 }] }

describe('单条目标数值校验', () => {
  it('保留基础阈值与条件顺序，结果深拷贝且不分配目标身份', () => {
    const catalog = boneCatalog()
    const original = structuredClone(goal)
    const result = value(readCraftTargetValue(catalog, 'Synthetic Base', goal))
    expect(result).toEqual(goal)
    expect(result).not.toBe(goal)
    expect(result.bounds).not.toBe(goal.bounds)
    expect(result.bounds[0]).not.toBe(goal.bounds[0])
    result.bounds[0] = { index: 0, min: 9 }
    expect(goal).toEqual(original)
    expect(
      value(
        readCraftTargetValue(catalog, 'Synthetic Base', {
          modId: 'prefix1',
          bounds: [{ index: 0, min: 7 }],
        }),
      ).bounds,
    ).toEqual([{ index: 0, min: 7 }])
  })

  it('拒绝无效字段、basis、空条件、显式undefined和未知类型', () => {
    const catalog = boneCatalog()
    for (const input of [
      null,
      [],
      {},
      { ...goal, targetId: 't1' },
      { ...goal, basis: undefined },
      { ...goal, basis: 'base' },
      { ...goal, modId: undefined },
      { ...goal, bounds: [] },
      { ...goal, bounds: Array.from({ length: 33 }, (_, index) => ({ index, min: 1 })) },
    ])
      expect(readCraftTargetValue(catalog, 'Synthetic Base', input).ok).toBe(false)
    expect(readCraftTargetValue(catalog, 'Synthetic Base', { ...goal, modId: 'missing' })).toEqual({
      ok: false,
      error: '数值目标词缀不在制作目录中。',
    })
  })

  it('索引、有限值、基础范围和上下限顺序保持原规则', () => {
    const catalog = boneCatalog()
    for (const bounds of [
      [{ index: -1, min: 2 }],
      [{ index: 0.5, min: 2 }],
      [{ index: 1, min: 2 }],
      [
        { index: 0, min: 2 },
        { index: 0, max: 8 },
      ],
      [{ index: 0 }],
      [{ index: 0, min: undefined }],
      [{ index: 0, min: NaN }],
      [{ index: 0, max: Infinity }],
      [{ index: 0, min: 0 }],
      [{ index: 0, max: 11 }],
      [{ index: 0, min: 8, max: 7 }],
      [{ index: 0, min: 2, extra: true }],
    ]) {
      const input = { modId: 'prefix1', bounds }
      const original = structuredClone(input)
      expect(readCraftTargetValue(catalog, 'Synthetic Base', input).ok).toBe(false)
      expect(input).toEqual(original)
    }
    expect(
      readCraftTargetValue(catalog, 'Synthetic Base', {
        modId: 'prefix1',
        bounds: [{ index: 0, min: 1, max: 10 }],
      }).ok,
    ).toBe(true)
  })

  it('存储effective不受基础范围限制，运行effective必须提供同基底当前状态', () => {
    const catalog = boneCatalog()
    const input = { ...goal, basis: 'effective' as const, bounds: [{ index: 0, min: 100 }] }
    expect(readCraftTargetValue(catalog, 'Synthetic Base', input)).toEqual({
      ok: true,
      value: input,
    })
    for (const state of [undefined, { ...boneState(), baseId: 'other' }]) {
      expect(readCraftTargetValue(catalog, 'Synthetic Base', input, { state })).toEqual({
        ok: false,
        error: '有效值目标需要当前装备状态。',
      })
    }
    expect(readCraftTargetValue(catalog, 'Synthetic Base', input, { state: boneState() })).toEqual({
      ok: true,
      value: input,
    })
  })

  it('存储保留歧义实际行的条件；真实替换后才具备运行投影', () => {
    const catalog = boneCatalog()
    const mod = catalog.modifiers.find((entry) => entry.id === 'prefix1')
    if (!mod) throw new Error('缺少夹具')
    mod.lines = ['Value (1-10)', 'Value (1-5)']
    const state = { ...boneState(), affixes: [{ modId: 'prefix1', lines: ['Value 3', 'Value 4'] }] }
    const input = { modId: 'prefix1', basis: 'effective' as const, bounds: [{ index: 0, min: 7 }] }
    const before = structuredClone({ catalog, state, input })
    expect(readCraftTargetValue(catalog, state.baseId, input)).toEqual({ ok: true, value: input })
    expect(readCraftTargetValue(catalog, state.baseId, input, { state }).ok).toBe(false)
    const next = value(
      applyCraftOperation(catalog, state, {
        currency: 'chaos',
        removeModId: 'prefix1',
        modIds: ['prefix1'],
        rolls: [{ modId: 'prefix1', values: [8, 4] }],
      }),
    )
    expect(readCraftTargetValue(catalog, next.baseId, input, { state: next })).toEqual({
      ok: true,
      value: input,
    })
    expect({ catalog, state, input }).toEqual(before)
  })

  it('逐实例尝试effective投影，无该类型时使用目录投影，不负责重复状态准入', () => {
    const catalog = boneCatalog()
    const mod = catalog.modifiers.find((entry) => entry.id === 'prefix1')
    if (!mod) throw new Error('缺少夹具')
    mod.lines = ['Value (1-10)', 'Value (1-5)']
    const affixes = [
      { modId: 'prefix1', affixId: 'a1', lines: ['Value 3', 'Value 4'] },
      { modId: 'prefix1', affixId: 'a2', lines: ['Value 8', 'Value 4'] },
    ]
    const input = { modId: 'prefix1', basis: 'effective' as const, bounds: [{ index: 0, min: 7 }] }
    for (const selected of [affixes, [...affixes].reverse(), []]) {
      const state = { ...boneState(), nextAffixId: 3, affixes: selected }
      expect(readCraftTargetValue(catalog, state.baseId, input, { state })).toEqual({
        ok: true,
        value: input,
      })
    }
  })

  it('多范围条件保持输入顺序，真实催化条件依赖完整缩放资料', () => {
    const catalog = boneCatalog()
    const mod = catalog.modifiers.find((entry) => entry.id === 'prefix1')
    if (!mod) throw new Error('缺少夹具')
    mod.lines = ['first (1-10)', 'second (20-30)']
    const input = {
      modId: 'prefix1',
      bounds: [
        { index: 1, max: 25 },
        { index: 0, min: 3.5 },
      ],
    }
    expect(readCraftTargetValue(catalog, 'Synthetic Base', input)).toEqual({
      ok: true,
      value: input,
    })
    const state = value(imported())
    const effective = {
      modId: 'IncreasedLife1',
      basis: 'effective' as const,
      bounds: [{ index: 0, min: 21, max: 22 }],
    }
    expect(readCraftTargetValue(primaryCatalog, state.baseId, effective, { state })).toEqual({
      ok: true,
      value: effective,
    })
    const missing = { ...primaryCatalog, scalability: { ...primaryCatalog.scalability } }
    delete missing.scalability['+(10-19) to maximum Life']
    expect(readCraftTargetValue(missing, state.baseId, effective, { state }).ok).toBe(false)
    expect(readCraftTargetValue(missing, state.baseId, effective)).toEqual({
      ok: true,
      value: effective,
    })
  })

  it('旧数组入口保留目标关联、全局类型唯一与错误优先级', () => {
    const catalog = boneCatalog()
    const baseId = 'Synthetic Base'
    for (const validate of [validateCraftTargetValues, validateStoredCraftTargetValues]) {
      expect(validate(catalog, baseId, ['prefix1'], [goal])).toEqual({ ok: true, value: [goal] })
      expect(
        validate(
          catalog,
          baseId,
          ['prefix1'],
          [goal, { ...goal, bounds: [{ index: -1, min: 5 }] }],
        ),
      ).toEqual({ ok: false, error: '数值目标必须关联唯一的已选词缀，并包含 1–32 个条件。' })
      expect(validate(catalog, baseId, ['prefix1'], [{ ...goal, modId: 'prefix2' }])).toEqual({
        ok: false,
        error: '数值目标必须关联唯一的已选词缀，并包含 1–32 个条件。',
      })
      expect(validate(catalog, baseId, ['prefix1', 'prefix1'], [goal])).toEqual({
        ok: false,
        error: '制作目标不能包含重复词缀 ID。',
      })
      expect(
        validate(
          catalog,
          baseId,
          ['prefix1'],
          [goal],
          [{ targetModId: 'prefix1', modIds: ['suffix1'] }],
        ),
      ).toEqual({ ok: false, error: '替代档位必须与主目标属于同一词缀类型和冲突组。' })
    }
  })
})
