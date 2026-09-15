import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { boneCatalog, boneState } from './boneTestFixture'
import { imported, catalog as primary } from './catalystTestFixture'
import { type CraftResult, createCraftState } from './rehearsal'
import {
  type CraftTargetDefinitions,
  createTargetDefinitions,
  type LegacyCraftTargetConfig,
  validateTargetDefinitions,
} from './targetDefinitions'

function value<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

function fixture() {
  const catalog = boneCatalog()
  const alternative = catalog.modifiers.find((entry) => entry.id === 'prefix2')
  if (!alternative) throw new Error('合成夹具缺失')
  alternative.group = 'prefix1'
  const state = boneState(['prefix1', 'suffix1'])
  const legacy: LegacyCraftTargetConfig = {
    targetModIds: ['suffix1', 'prefix1'],
    targetAlternatives: [{ targetModId: 'prefix1', modIds: ['prefix2'] }],
    targetValues: [
      { modId: 'prefix2', bounds: [{ index: 0, min: 7 }] },
      { modId: 'suffix1', bounds: [{ index: 0, max: 8 }] },
    ],
    targetFracturedModId: 'prefix1',
    minimumTargetCount: 1,
  }
  const definitions: CraftTargetDefinitions = {
    nextTargetId: 3,
    targets: [
      { targetId: 't1', modId: 'suffix1' },
      { targetId: 't2', modId: 'prefix1' },
    ],
    alternatives: [{ targetId: 't2', modIds: ['prefix2'] }],
    values: [
      { targetId: 't2', modId: 'prefix2', bounds: [{ index: 0, min: 7 }] },
      { targetId: 't1', modId: 'suffix1', bounds: [{ index: 0, max: 8 }] },
    ],
    fracturedTargetId: 't2',
    minimumTargetCount: 1,
  }
  return { catalog, state, legacy, definitions }
}

describe('独立目标定义', () => {
  it('完整验证 legacy 后按目标顺序分配，状态身份模式不改变目标身份', () => {
    const { catalog, state, legacy, definitions } = fixture()
    const before = structuredClone({ state, legacy })
    expect(createTargetDefinitions(catalog, state, legacy)).toEqual({
      ok: true,
      value: definitions,
    })
    expect(
      createTargetDefinitions(catalog, value(enableCraftAffixIdentity(catalog, state)), legacy),
    ).toEqual({ ok: true, value: definitions })
    expect({ state, legacy }).toEqual(before)
    expect(createTargetDefinitions(catalog, state, { targetModIds: [] })).toEqual({
      ok: true,
      value: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    })
  })

  it('校验保留稳定 ID、顺序与有空洞的游标并深拷贝所有关联', () => {
    const { catalog, state, definitions } = fixture()
    const input = { ...definitions, nextTargetId: 40 }
    const before = structuredClone(input)
    const checked = value(validateTargetDefinitions(catalog, state, input))
    expect(checked).toEqual(input)
    const alternative = checked.alternatives[0]
    const bound = checked.values[0]?.bounds[0]
    const target = checked.targets[0]
    if (!alternative || !bound || !target) throw new Error('缺少验证结果')
    alternative.modIds.push('changed')
    bound.min = 8
    target.modId = 'changed'
    expect(input).toEqual(before)
    const created = value(createTargetDefinitions(catalog, state, fixture().legacy))
    expect(created.values[0]?.bounds[0]?.min).toBe(7)
    const sparse: CraftTargetDefinitions = {
      nextTargetId: 40,
      targets: [{ targetId: 't27', modId: 'suffix1' }],
      alternatives: [],
      values: [],
    }
    expect(validateTargetDefinitions(catalog, state, sparse)).toEqual({ ok: true, value: sparse })
  })

  it('工厂拒绝未知字段、混入新根、显式 undefined 及无效旧输入', () => {
    const { catalog, state, legacy, definitions } = fixture()
    for (const input of [
      null,
      [],
      {},
      definitions,
      { ...legacy, extra: true },
      { ...legacy, nextTargetId: 3 },
      ...['targetValues', 'targetAlternatives', 'targetFracturedModId', 'minimumTargetCount'].map(
        (key) => ({ ...legacy, [key]: undefined }),
      ),
      { ...legacy, targetModIds: undefined },
      { ...legacy, targetValues: null },
      { ...legacy, targetAlternatives: null },
      {
        ...legacy,
        targetValues: [{ targetId: 't1', modId: 'prefix1', bounds: [{ index: 0, min: 2 }] }],
      },
    ])
      expect(createTargetDefinitions(catalog, state, input as LegacyCraftTargetConfig).ok).toBe(
        false,
      )
    expect(validateTargetDefinitions(catalog, state, legacy).ok).toBe(false)
  })

  it('严格拒绝游标、目标 ID 与所有层级额外字段', () => {
    const { catalog, state, definitions } = fixture()
    for (const cursor of [undefined, 0, -1, 2, 1.5, Number.MAX_SAFE_INTEGER + 1, '3'])
      expect(
        validateTargetDefinitions(catalog, state, { ...definitions, nextTargetId: cursor }).ok,
      ).toBe(false)
    for (const targetId of [undefined, 'a1', 't0', 't01', 't-1', 't3', 't9007199254740992'])
      expect(
        validateTargetDefinitions(catalog, state, {
          ...definitions,
          targets: [{ targetId, modId: 'suffix1' }, definitions.targets[1]],
        }).ok,
      ).toBe(false)
    for (const input of [
      null,
      [],
      { ...definitions, extra: true },
      { ...definitions, fracturedTargetId: undefined },
      { ...definitions, minimumTargetCount: undefined },
      {
        ...definitions,
        targets: [{ ...definitions.targets[0], extra: true }, definitions.targets[1]],
      },
      { ...definitions, targets: [definitions.targets[0], definitions.targets[0]] },
      { ...definitions, alternatives: [{ targetId: 't2', modIds: ['prefix2'], extra: true }] },
      { ...definitions, values: [{ ...definitions.values[0], extra: true }] },
      {
        ...definitions,
        values: [{ ...definitions.values[0], bounds: [{ index: 0, min: 7, extra: true }] }],
      },
      { ...definitions, values: undefined },
      { ...definitions, alternatives: undefined },
    ])
      expect(validateTargetDefinitions(catalog, state, input).ok).toBe(false)
  })

  it('拒绝悬空引用、重复关联和将另一目标的数值条件挂到当前目标', () => {
    const { catalog, state, definitions } = fixture()
    for (const input of [
      { ...definitions, alternatives: [{ targetId: 't9', modIds: ['prefix2'] }] },
      { ...definitions, alternatives: [...definitions.alternatives, ...definitions.alternatives] },
      { ...definitions, values: [{ ...definitions.values[0], targetId: 't9' }] },
      { ...definitions, values: [{ ...definitions.values[0], targetId: 't1' }] },
      { ...definitions, values: [...definitions.values, ...definitions.values] },
      { ...definitions, fracturedTargetId: 't9' },
    ])
      expect(validateTargetDefinitions(catalog, state, input).ok).toBe(false)
  })

  it('不放宽旧类型唯一、同组、容量、来源及破裂限制', () => {
    const { catalog, state } = fixture()
    for (const config of [
      { targetModIds: ['prefix1', 'prefix1'] },
      { targetModIds: ['prefix1', 'prefix2'] },
      { targetModIds: ['prefix1', 'prefix3', 'prefix4', 'prefix2'] },
      {
        targetModIds: ['suffix1'],
        targetAlternatives: [{ targetModId: 'suffix1', modIds: ['prefix1'] }],
      },
      { targetModIds: ['exclusive1'], targetFracturedModId: 'exclusive1' },
      { targetModIds: ['missing'] },
      {
        targetModIds: ['prefix1'],
        targetValues: [{ modId: 'prefix1', bounds: [{ index: 0, min: 20 }] }],
      },
    ])
      expect(createTargetDefinitions(catalog, state, config).ok).toBe(false)
    const untrusted = { ...catalog, _meta: { ...catalog._meta, sources: [] } }
    expect(createTargetDefinitions(untrusted, state, { targetModIds: ['exclusive1'] }).ok).toBe(
      false,
    )
    const duplicate = { ...state, affixes: [...state.affixes, ...state.affixes] }
    expect(createCraftState(catalog, duplicate).ok).toBe(false)
    expect(createTargetDefinitions(catalog, duplicate, { targetModIds: [] }).ok).toBe(false)
    for (const modId of ['prefix1', 'prefix2']) {
      expect(
        validateTargetDefinitions(catalog, state, {
          nextTargetId: 3,
          targets: [
            { targetId: 't1', modId: 'prefix1' },
            { targetId: 't2', modId },
          ],
          alternatives: [],
          values: [],
        }).ok,
      ).toBe(false)
    }
    expect(validateTargetDefinitions(catalog, duplicate, fixture().definitions).ok).toBe(false)
  })

  it('保留部分目标合法组合与必选目标约束', () => {
    const catalog = boneCatalog()
    const state = boneState()
    const targetModIds = ['prefix1', 'prefix2', 'prefix3', 'prefix4']
    expect(createTargetDefinitions(catalog, state, { targetModIds }).ok).toBe(false)
    const result = value(
      createTargetDefinitions(catalog, state, {
        targetModIds,
        minimumTargetCount: 3,
        targetFracturedModId: 'prefix4',
      }),
    )
    expect(result).toMatchObject({
      nextTargetId: 5,
      minimumTargetCount: 3,
      fracturedTargetId: 't4',
    })
    expect(validateTargetDefinitions(catalog, state, result).ok).toBe(true)
    expect(validateTargetDefinitions(catalog, state, { ...result, minimumTargetCount: 4 }).ok).toBe(
      false,
    )
  })

  it('有效值条件沿用当前状态投影与可信缩放资料', () => {
    const state = value(imported())
    const legacy: LegacyCraftTargetConfig = {
      targetModIds: ['IncreasedLife1'],
      targetValues: [
        { modId: 'IncreasedLife1', basis: 'effective', bounds: [{ index: 0, min: 22 }] },
      ],
    }
    const result = value(createTargetDefinitions(primary, state, legacy))
    expect(result.values).toEqual([{ ...legacy.targetValues?.[0], targetId: 't1' }])
    expect(validateTargetDefinitions(primary, state, result).ok).toBe(true)
    const untrusted = { ...primary, scalability: {} }
    expect(createTargetDefinitions(untrusted, state, legacy).ok).toBe(false)
  })
})
