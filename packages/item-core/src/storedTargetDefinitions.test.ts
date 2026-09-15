import { describe, expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import { validateCraftImplicitTargets, validateStoredCraftImplicitTargets } from './implicitTargets'
import { editTargetDefinitions } from './targetDefinitionEdits'
import {
  createStoredTargetDefinitions,
  createTargetDefinitions,
  validateStoredTargetDefinitions,
  validateTargetDefinitions,
} from './targetDefinitions'
import { validateCraftTargetValues, validateStoredCraftTargetValues } from './targets'

function fixture() {
  const catalog = boneCatalog()
  const mod = catalog.modifiers.find((entry) => entry.id === 'prefix1')
  if (!mod) throw Error('缺少测试词缀')
  mod.lines = ['Value (1-10)', 'Value (1-5)']
  const initial = { ...boneState(), affixes: [{ modId: 'prefix1', lines: ['Value 3', 'Value 4'] }] }
  const operation = {
    currency: 'chaos' as const,
    removeModId: 'prefix1',
    modIds: ['prefix1'],
    rolls: [{ modId: 'prefix1', values: [8, 4] }],
  }
  const after = applyCraftStep(catalog, initial, operation)
  if (!after.ok) throw Error(after.error)
  const config = {
    targetModIds: ['prefix1', 'suffix1'],
    targetValues: [
      { modId: 'prefix1', basis: 'effective' as const, bounds: [{ index: 0, min: 7 }] },
    ],
  }
  const created = createTargetDefinitions(catalog, after.value, config)
  if (!created.ok) throw Error(created.error)
  return { catalog, initial, after: after.value, config, definitions: created.value }
}

describe('目标存储资格与当前投影分离', () => {
  it('新存储入口拒绝继承字段及不可枚举缺省字段，不能清洗成合法配置', () => {
    const { catalog, initial, config, definitions } = fixture()
    expect(
      validateStoredTargetDefinitions(catalog, initial.baseId, Object.create(definitions)).ok,
    ).toBe(false)
    const hidden = Object.defineProperty(
      { targetId: 't1', modId: 'prefix1', bounds: [{ index: 0, min: 3 }] },
      'basis',
      { value: undefined, enumerable: false },
    )
    expect(
      validateStoredTargetDefinitions(catalog, initial.baseId, { ...definitions, values: [hidden] })
        .ok,
    ).toBe(false)
    const inheritedValue = Object.assign(Object.create({ modId: 'prefix1' }), {
      bounds: [{ index: 0, min: 3 }],
    })
    expect(
      validateStoredCraftTargetValues(catalog, initial.baseId, config.targetModIds, [
        inheritedValue,
      ]).ok,
    ).toBe(false)
    const base = catalog.bases[0]
    if (!base) throw Error('缺少基底')
    base.implicit = 'Implicit (1-10)'
    base.implicitTags = [[]]
    const implicit = Object.assign(Object.create({ lineIndex: 0 }), {
      bounds: [{ index: 0, min: 3 }],
    })
    expect(validateStoredCraftImplicitTargets(catalog, initial.baseId, [implicit]).ok).toBe(false)
    expect(createStoredTargetDefinitions(catalog, initial.baseId, Object.create(config)).ok).toBe(
      false,
    )
    expect(
      editTargetDefinitions(
        catalog,
        initial,
        definitions,
        Object.create({ kind: 'remove', targetId: 't1' }),
      ).ok,
    ).toBe(false)
  })

  it('新存储与编辑拒绝访问器且不读取，并将对象检查异常转成失败结果', () => {
    const { catalog, initial, definitions } = fixture()
    let reads = 0
    const getter = () => {
      reads += 1
      return 'effective'
    }
    const value = Object.defineProperty(
      { targetId: 't1', modId: 'prefix1', bounds: [{ index: 0, min: 3 }] },
      'basis',
      { get: getter, enumerable: true },
    )
    expect(
      validateStoredTargetDefinitions(catalog, initial.baseId, { ...definitions, values: [value] })
        .ok,
    ).toBe(false)
    const edit = Object.defineProperty({ kind: 'remove' }, 'targetId', {
      get: () => {
        reads += 1
        return 't1'
      },
      enumerable: true,
    })
    expect(editTargetDefinitions(catalog, initial, definitions, edit).ok).toBe(false)
    const proxy = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw Error('trap')
        },
      },
    )
    expect(validateStoredTargetDefinitions(catalog, initial.baseId, proxy).ok).toBe(false)
    expect(validateStoredCraftTargetValues(catalog, initial.baseId, ['prefix1'], proxy).ok).toBe(
      false,
    )
    expect(validateStoredCraftImplicitTargets(catalog, initial.baseId, proxy).ok).toBe(false)
    expect(editTargetDefinitions(catalog, initial, definitions, proxy).ok).toBe(false)
    expect(reads).toBe(0)
  })

  it('真实替换后创建的有效条件撤销后仍能保留，当前运行拒绝歧义', () => {
    const { catalog, initial, after, config, definitions } = fixture()
    expect(
      validateCraftTargetValues(
        catalog,
        initial.baseId,
        config.targetModIds,
        config.targetValues,
        [],
        initial,
      ).ok,
    ).toBe(false)
    expect(
      validateCraftTargetValues(
        catalog,
        after.baseId,
        config.targetModIds,
        config.targetValues,
        [],
        after,
      ).ok,
    ).toBe(true)
    expect(createTargetDefinitions(catalog, initial, config).ok).toBe(false)
    expect(validateTargetDefinitions(catalog, initial, definitions).ok).toBe(false)
    expect(
      validateStoredCraftTargetValues(
        catalog,
        initial.baseId,
        config.targetModIds,
        config.targetValues,
      ),
    ).toEqual({ ok: true, value: config.targetValues })
    expect(validateStoredTargetDefinitions(catalog, initial.baseId, definitions)).toEqual({
      ok: true,
      value: definitions,
    })
  })

  it('撤销与截断分支后仍可重排、删除和完整替换，不重编号或篡改输入', () => {
    const { catalog, initial, config, definitions } = fixture()
    const original = structuredClone({ initial, definitions })
    const reordered = editTargetDefinitions(catalog, initial, definitions, {
      kind: 'reorder',
      targetIds: ['t2', 't1'],
    })
    expect(reordered).toEqual({
      ok: true,
      value: { ...definitions, targets: [...definitions.targets].reverse() },
    })
    expect(
      editTargetDefinitions(catalog, initial, definitions, { kind: 'remove', targetId: 't1' }),
    ).toEqual({
      ok: true,
      value: {
        nextTargetId: 3,
        targets: [{ targetId: 't2', modId: 'suffix1' }],
        alternatives: [],
        values: [],
      },
    })
    const replacement = editTargetDefinitions(catalog, initial, definitions, {
      kind: 'replace',
      config,
    })
    expect(replacement).toEqual({
      ok: true,
      value: {
        nextTargetId: 5,
        targets: [
          { targetId: 't3', modId: 'prefix1' },
          { targetId: 't4', modId: 'suffix1' },
        ],
        alternatives: [],
        values: config.targetValues.map((entry) => ({ ...entry, targetId: 't3' })),
      },
    })
    const branched = applyCraftStep(catalog, initial, {
      currency: 'annulment',
      removeModId: 'prefix1',
      modIds: [],
    })
    if (!branched.ok) throw Error(branched.error)
    expect(
      editTargetDefinitions(catalog, branched.value, definitions, {
        kind: 'values',
        targetId: 't1',
        values: config.targetValues,
      }),
    ).toEqual({ ok: true, value: definitions })
    expect({ initial, definitions }).toEqual(original)
  })

  it('存储校验保留独立关联和深拷贝，拒绝坏字段、范围、重复同组与缺来源', () => {
    const { catalog, initial, definitions, config } = fixture()
    for (const values of [
      [{ ...config.targetValues[0], basis: undefined }],
      [{ ...config.targetValues[0], bounds: [{ index: 2, min: 7 }] }],
      [{ ...config.targetValues[0], bounds: [{ index: 0, min: Infinity }] }],
      [{ modId: 'prefix1', bounds: [{ index: 0, min: 11 }] }],
      [{ ...config.targetValues[0], bounds: [{ index: 0, min: 8, max: 7 }] }],
    ])
      expect(
        validateStoredCraftTargetValues(catalog, initial.baseId, config.targetModIds, values).ok,
      ).toBe(false)
    expect(
      validateStoredTargetDefinitions(catalog, initial.baseId, {
        ...definitions,
        targets: [
          { targetId: 't1', modId: 'prefix1' },
          { targetId: 't2', modId: 'prefix1' },
        ],
      }).ok,
    ).toBe(false)
    expect(
      validateStoredTargetDefinitions(catalog, initial.baseId, {
        ...definitions,
        values: definitions.values.map((entry) => ({ ...entry, targetId: 't2' })),
      }).ok,
    ).toBe(false)
    const untrusted = { ...catalog, _meta: { ...catalog._meta, sources: [] } }
    expect(
      validateStoredTargetDefinitions(untrusted, initial.baseId, {
        nextTargetId: 2,
        targets: [{ targetId: 't1', modId: 'exclusive1' }],
        alternatives: [],
        values: [],
      }).ok,
    ).toBe(false)
    const checked = validateStoredTargetDefinitions(catalog, initial.baseId, definitions)
    if (!checked.ok) throw Error(checked.error)
    checked.value.values[0]?.bounds.push({ index: 1, min: 2 })
    expect(definitions.values[0]?.bounds).toEqual([{ index: 0, min: 7 }])
  })

  it('固有有效条件依目录保留，当前重复文本映射仍严格拒绝', () => {
    const { catalog, initial } = fixture()
    const base = catalog.bases[0]
    if (!base) throw Error('缺少基底')
    base.implicit = 'Value (1-10)\nValue (1-5)'
    base.implicitTags = [[], []]
    const current = { ...initial, implicitLines: ['Value 3', 'Value 4'] }
    const values = [{ lineIndex: 0, basis: 'effective' as const, bounds: [{ index: 0, min: 7 }] }]
    expect(validateCraftImplicitTargets(catalog, current.baseId, values, current).ok).toBe(false)
    expect(validateStoredCraftImplicitTargets(catalog, current.baseId, values)).toEqual({
      ok: true,
      value: values,
    })
    for (const invalid of [
      [{ ...values[0], lineIndex: 2 }],
      [{ ...values[0], basis: undefined }],
      [{ ...values[0], bounds: [{ index: 1, min: 7 }] }],
      [{ ...values[0], bounds: [{ index: 0, min: NaN }] }],
    ])
      expect(validateStoredCraftImplicitTargets(catalog, current.baseId, invalid).ok).toBe(false)
    base.implicitTags = []
    expect(validateStoredCraftImplicitTargets(catalog, current.baseId, values).ok).toBe(false)
  })
})
