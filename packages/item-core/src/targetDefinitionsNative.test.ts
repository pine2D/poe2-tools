import { describe, expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import type { CraftCatalog } from './catalog'
import { catalog as primaryCatalog } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import { catalog, conflictingCatalog, state } from './partialTargetFixture'
import type { CraftResult, CraftState } from './rehearsal'
import {
  type CraftTargetDefinitions,
  createTargetDefinitions,
  type LegacyCraftTargetConfig,
  validateStoredTargetDefinitions,
  validateTargetDefinitions,
} from './targetDefinitions'

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
/** 独立建立测试输入，故意使用反序稀疏 ID；不调用生产格式投影。 */
function native(config: LegacyCraftTargetConfig): CraftTargetDefinitions {
  const targets = config.targetModIds.map((modId, index) => ({
    targetId: `t${60 - index * 7}`,
    modId,
  }))
  const owner = (modId: string) => {
    const target = targets.find(
      (target) =>
        target.modId === modId ||
        config.targetAlternatives?.some(
          (entry) => entry.targetModId === target.modId && entry.modIds.includes(modId),
        ),
    )
    if (!target) throw Error('测试值缺少所属目标')
    return target.targetId
  }
  return {
    nextTargetId: 64,
    targets,
    alternatives: (config.targetAlternatives ?? []).map((entry) => ({
      targetId: owner(entry.targetModId),
      modIds: [...entry.modIds],
    })),
    values: (config.targetValues ?? []).map((entry) => ({
      ...entry,
      targetId: owner(entry.modId),
      bounds: entry.bounds.map((bound) => ({ ...bound })),
    })),
    ...(config.minimumTargetCount === undefined
      ? {}
      : { minimumTargetCount: config.minimumTargetCount }),
    ...(config.targetFracturedModId === undefined
      ? {}
      : { fracturedTargetId: owner(config.targetFracturedModId) }),
  }
}
function compare(
  data: CraftCatalog,
  item: CraftState,
  config: LegacyCraftTargetConfig,
  valid: boolean,
) {
  const input = native(config)
  const original = structuredClone({ item, config, input })
  const old = createTargetDefinitions(data, item, config)
  const current = validateTargetDefinitions(data, item, input)
  const stored = validateStoredTargetDefinitions(data, item.baseId, input)
  expect(old.ok).toBe(valid)
  expect(current.ok).toBe(old.ok)
  expect(stored.ok).toBe(old.ok)
  if (old.ok) {
    const factoryIds = new Map(
      input.targets.map((target, index) => [target.targetId, `t${index + 1}`]),
    )
    const factoryId = (id: string) => {
      const mapped = factoryIds.get(id)
      if (mapped === undefined) throw Error('缺少测试工厂身份映射')
      return mapped
    }
    expect(old.value).toEqual({
      ...input,
      nextTargetId: input.targets.length + 1,
      targets: input.targets.map((target) => ({ ...target, targetId: factoryId(target.targetId) })),
      alternatives: input.alternatives.map((entry) => ({
        ...entry,
        targetId: factoryId(entry.targetId),
      })),
      values: input.values.map((entry) => ({ ...entry, targetId: factoryId(entry.targetId) })),
      ...(input.fracturedTargetId === undefined
        ? {}
        : { fracturedTargetId: factoryId(input.fracturedTargetId) }),
    })
  }
  if (current.ok) expect(current.value).toEqual(input)
  if (stored.ok) expect(stored.value).toEqual(input)
  expect({ item, config, input }).toEqual(original)
}

describe('原生目标 reader 独立资格对照', () => {
  it.each([
    { name: '空目标', config: { targetModIds: [] }, valid: true },
    { name: '普通前后缀', config: { targetModIds: ['p1', 's1'] }, valid: true },
    { name: '重复类型', config: { targetModIds: ['p1', 'p1'] }, valid: false },
    {
      name: '同组不同类型部分目标',
      config: { targetModIds: ['p1', 'high'], minimumTargetCount: 1 },
      valid: false,
    },
    { name: '四前缀要求全部', config: { targetModIds: ['p1', 'p2', 'p3', 'p4'] }, valid: false },
    {
      name: '四前缀要求三组',
      config: { targetModIds: ['p1', 'p2', 'p3', 'p4'], minimumTargetCount: 3 },
      valid: true,
    },
    { name: '数量越界', config: { targetModIds: ['p1'], minimumTargetCount: 2 }, valid: false },
    {
      name: '替代逐项而非同时共存',
      config: {
        targetModIds: ['p1', 's1'],
        targetAlternatives: [{ targetModId: 'p1', modIds: ['high'] }],
      },
      valid: true,
    },
    {
      name: '替代错误冲突组',
      config: {
        targetModIds: ['p1', 's1'],
        targetAlternatives: [{ targetModId: 'p1', modIds: ['p2'] }],
      },
      valid: false,
    },
    {
      name: '空替代',
      config: { targetModIds: ['p1'], targetAlternatives: [{ targetModId: 'p1', modIds: [] }] },
      valid: false,
    },
    {
      name: '重复替代',
      config: {
        targetModIds: ['p1'],
        targetAlternatives: [{ targetModId: 'p1', modIds: ['high', 'high'] }],
      },
      valid: false,
    },
  ])('$name 保持旧工厂准入且不改变稀疏身份', ({ config, valid }) => {
    compare(catalog(), state(), config, valid)
  })

  it('部分数量与必选破裂联合检查，不能凭另一组合法组合通过', () => {
    for (const [minimumTargetCount, valid] of [
      [1, true],
      [2, false],
    ] as const)
      compare(
        conflictingCatalog(),
        state(),
        { targetModIds: ['ess', 'fire', 'cold'], minimumTargetCount, targetFracturedModId: 'ess' },
        valid,
      )
    compare(
      conflictingCatalog(),
      state(),
      { targetModIds: ['ess', 'fire', 'cold'], minimumTargetCount: 2 },
      true,
    )
  })

  it('反序数值、范围顺序、替代破裂保留完整关联并深拷贝，不拿当前物等限制目标档位', () => {
    const data = catalog()
    const mod = data.modifiers.find((entry) => entry.id === 'p1')
    if (!mod) throw Error('缺少测试词缀')
    data.modifiers = data.modifiers.map((entry) =>
      entry === mod ? { ...entry, lines: ['A (1-10)', 'B (1-20)'] } : entry,
    )
    const config: LegacyCraftTargetConfig = {
      targetModIds: ['p1', 's1'],
      targetAlternatives: [{ targetModId: 'p1', modIds: ['high'] }],
      targetValues: [
        { modId: 'high', bounds: [{ index: 0, min: 7 }] },
        { modId: 's1', bounds: [{ index: 0, max: 8 }] },
        {
          modId: 'p1',
          bounds: [
            { index: 1, min: 12 },
            { index: 0, max: 5 },
          ],
        },
      ],
      minimumTargetCount: 1,
      targetFracturedModId: 'p1',
    }
    compare(data, state(), config, true)
    const input = native(config)
    const original = structuredClone(input)
    const checked = must(validateTargetDefinitions(data, state(), input))
    expect(checked.values.map((entry) => [entry.targetId, entry.modId])).toEqual([
      ['t60', 'high'],
      ['t53', 's1'],
      ['t60', 'p1'],
    ])
    const target = checked.targets[0],
      alternative = checked.alternatives[0],
      bound = checked.values[0]?.bounds[0]
    if (!target || !alternative || !bound) throw Error('缺少返回关联')
    target.modId = 'mutated'
    alternative.modIds.push('mutated')
    bound.min = 2
    expect(input).toEqual(original)
  })

  it('接受档位为亵渎专属时不能要求破裂，不能只看主档位', () => {
    const data = boneCatalog()
    data.modifiers = data.modifiers.map((mod) =>
      mod.id === 'exclusive1' ? { ...mod, group: 'suffix1' } : mod,
    )
    const config = {
      targetModIds: ['prefix1', 'suffix1'],
      targetAlternatives: [{ targetModId: 'suffix1', modIds: ['exclusive1'] }],
    }
    compare(data, boneState(), config, true)
    compare(data, boneState(), { ...config, targetFracturedModId: 'suffix1' }, false)
  })

  it.each([
    { baseId: 'Gold Ring', modId: 'EssenceIncreasedManaPercent1', source: 'src/Data/Essence.lua' },
    { baseId: 'Ruby', modId: 'CraftedJewelPrefixEffect', source: 'src/Data/LiquidEmotions.lua' },
    { baseId: 'Ruby', modId: 'CraftedJewelPrefixEffect', source: 'src/Data/ModJewel.lua' },
  ])('真实目录 $modId 缺少 $source 时原生与旧工厂都拒绝', ({ baseId, modId, source }) => {
    const item: CraftState = {
      baseId,
      itemLevel: 86,
      rarity: 'normal',
      sourceText: null,
      affixes: [],
    }
    compare(primaryCatalog, item, { targetModIds: [modId] }, true)
    const missing = {
      ...primaryCatalog,
      _meta: {
        ...primaryCatalog._meta,
        sources: primaryCatalog._meta.sources.filter((entry) => entry.path !== source),
      },
    }
    compare(missing, item, { targetModIds: [modId] }, false)
  })

  it('空值列表也校验真实状态，stored 原树先拒绝隐藏缺省字段且不执行 getter', () => {
    const data = catalog(),
      input = native({ targetModIds: [] })
    const broken = { ...state(), affixes: [{ modId: 'missing', lines: [] }] }
    expect(createTargetDefinitions(data, broken, { targetModIds: [] }).ok).toBe(false)
    expect(validateTargetDefinitions(data, broken, input).ok).toBe(false)
    expect(validateStoredTargetDefinitions(data, state().baseId, input)).toEqual({
      ok: true,
      value: input,
    })
    const populated = native({ targetModIds: ['p1'] })
    let reads = 0
    const hidden = Object.defineProperty(
      { targetId: 't60', modId: 'p1', bounds: [{ index: 0, min: 2 }] },
      'basis',
      {
        get() {
          reads++
          return 'effective'
        },
        enumerable: false,
      },
    )
    expect(
      validateStoredTargetDefinitions(data, state().baseId, { ...populated, values: [hidden] }).ok,
    ).toBe(false)
    expect(reads).toBe(0)
    expect(validateStoredTargetDefinitions(data, state().baseId, Object.create(populated)).ok).toBe(
      false,
    )
  })

  it('真实混沌前后仅 runtime 资格随歧义变化，stored 完整保留 effective 与身份', () => {
    const data = boneCatalog()
    data.modifiers = data.modifiers.map((mod) =>
      mod.id === 'prefix1' ? { ...mod, lines: ['Value (1-10)', 'Value (1-5)'] } : mod,
    )
    const initial = {
      ...boneState(),
      affixes: [{ modId: 'prefix1', lines: ['Value 3', 'Value 4'] }],
    }
    const after = must(
      applyCraftStep(data, initial, {
        currency: 'chaos',
        removeModId: 'prefix1',
        modIds: ['prefix1'],
        rolls: [{ modId: 'prefix1', values: [8, 4] }],
      }),
    )
    const config: LegacyCraftTargetConfig = {
      targetModIds: ['prefix1'],
      targetValues: [{ modId: 'prefix1', basis: 'effective', bounds: [{ index: 0, min: 7 }] }],
    }
    const input = native(config)
    expect(createTargetDefinitions(data, initial, config).ok).toBe(false)
    expect(validateTargetDefinitions(data, initial, input).ok).toBe(false)
    expect(validateStoredTargetDefinitions(data, initial.baseId, input)).toEqual({
      ok: true,
      value: input,
    })
    compare(data, after, config, true)
  })
})
