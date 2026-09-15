import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { boneCatalog, boneState } from './boneTestFixture'
import type { CraftResult } from './rehearsal'
import { editTargetDefinitions } from './targetDefinitionEdits'
import {
  type CraftTargetDefinitions,
  createTargetDefinitions,
  projectTargetDefinitions,
} from './targetDefinitions'

function value<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

function fixture() {
  const catalog = boneCatalog()
  const alternate = catalog.modifiers.find((mod) => mod.id === 'prefix2')
  if (!alternate) throw Error('缺少替代档位')
  alternate.group = 'prefix1'
  const state = boneState(['prefix1', 'suffix1'])
  const definitions: CraftTargetDefinitions = {
    nextTargetId: 40,
    targets: [
      { targetId: 't7', modId: 'suffix1' },
      { targetId: 't21', modId: 'prefix1' },
    ],
    alternatives: [{ targetId: 't21', modIds: ['prefix2'] }],
    values: [
      { targetId: 't21', modId: 'prefix2', bounds: [{ index: 0, min: 7 }] },
      { targetId: 't7', modId: 'suffix1', bounds: [{ index: 0, max: 8 }] },
    ],
    fracturedTargetId: 't21',
    minimumTargetCount: 2,
  }
  return { catalog, state, definitions }
}

describe('稳定目标编辑', () => {
  it('投影保留独立关联顺序与可选要求且没有共享嵌套引用', () => {
    const { definitions } = fixture()
    const before = structuredClone(definitions)
    const projected = projectTargetDefinitions(definitions)
    expect(projected).toEqual({
      targetModIds: ['suffix1', 'prefix1'],
      targetAlternatives: [{ targetModId: 'prefix1', modIds: ['prefix2'] }],
      targetValues: [
        { modId: 'prefix2', bounds: [{ index: 0, min: 7 }] },
        { modId: 'suffix1', bounds: [{ index: 0, max: 8 }] },
      ],
      targetFracturedModId: 'prefix1',
      minimumTargetCount: 2,
    })
    projected.targetAlternatives?.[0]?.modIds.push('changed')
    const bound = projected.targetValues?.[0]?.bounds[0]
    if (!bound) throw Error('缺少数值')
    bound.min = 9
    expect(definitions).toEqual(before)
  })

  it('删除清理全部所属关联和破裂并夹紧最低数量，重加不复用 ID', () => {
    const { catalog, state, definitions } = fixture()
    const removed = value(
      editTargetDefinitions(catalog, state, definitions, {
        kind: 'remove',
        targetId: 't21',
      }),
    )
    expect(removed).toEqual({
      nextTargetId: 40,
      targets: [{ targetId: 't7', modId: 'suffix1' }],
      alternatives: [],
      values: [{ targetId: 't7', modId: 'suffix1', bounds: [{ index: 0, max: 8 }] }],
      minimumTargetCount: 1,
    })
    const added = value(
      editTargetDefinitions(catalog, state, removed, {
        kind: 'add',
        modId: 'prefix1',
      }),
    )
    expect(added.targets).toEqual([
      { targetId: 't7', modId: 'suffix1' },
      { targetId: 't40', modId: 'prefix1' },
    ])
    expect(added.nextTargetId).toBe(41)
    const empty = value(
      editTargetDefinitions(catalog, state, removed, {
        kind: 'remove',
        targetId: 't7',
      }),
    )
    expect(empty).toEqual({ nextTargetId: 40, targets: [], alternatives: [], values: [] })
  })

  it('重排只接受完整排列，身份与所有关联不随位置改变', () => {
    const { catalog, state, definitions } = fixture()
    const reordered = value(
      editTargetDefinitions(catalog, state, definitions, {
        kind: 'reorder',
        targetIds: ['t21', 't7'],
      }),
    )
    expect(reordered).toEqual({
      ...definitions,
      targets: [definitions.targets[1], definitions.targets[0]],
    })
    for (const targetIds of [['t7'], ['t7', 't7'], ['t7', 't30'], []])
      expect(
        editTargetDefinitions(catalog, state, definitions, { kind: 'reorder', targetIds }).ok,
      ).toBe(false)
  })

  it('替代档位删除会清理失效数值，数值编辑只替换所属目标并维持 ID', () => {
    const { catalog, state, definitions } = fixture()
    const changed = value(
      editTargetDefinitions(catalog, state, definitions, {
        kind: 'alternatives',
        targetId: 't21',
        modIds: [],
      }),
    )
    expect(changed.alternatives).toEqual([])
    expect(changed.values).toEqual([
      { targetId: 't7', modId: 'suffix1', bounds: [{ index: 0, max: 8 }] },
    ])
    const values = [{ modId: 'prefix1', bounds: [{ index: 0, min: 6 }] }]
    const edited = value(
      editTargetDefinitions(catalog, state, changed, {
        kind: 'values',
        targetId: 't21',
        values,
      }),
    )
    expect(edited.targets).toEqual(definitions.targets)
    expect(edited.nextTargetId).toBe(40)
    expect(edited.values).toEqual([
      { targetId: 't7', modId: 'suffix1', bounds: [{ index: 0, max: 8 }] },
      { targetId: 't21', modId: 'prefix1', bounds: [{ index: 0, min: 6 }] },
    ])
    expect(
      editTargetDefinitions(catalog, state, changed, {
        kind: 'values',
        targetId: 't21',
        values: [{ modId: 'suffix1', bounds: [{ index: 0, min: 2 }] }],
      }).ok,
    ).toBe(false)
  })

  it('明确设置与清除破裂和最低数量，不改变身份', () => {
    const { catalog, state, definitions } = fixture()
    const changed = value(
      editTargetDefinitions(catalog, state, definitions, {
        kind: 'fractured',
        targetId: 't7',
      }),
    )
    expect(changed.fracturedTargetId).toBe('t7')
    const cleared = value(
      editTargetDefinitions(catalog, state, changed, {
        kind: 'fractured',
        targetId: null,
      }),
    )
    expect(Object.hasOwn(cleared, 'fracturedTargetId')).toBe(false)
    const minimum = value(
      editTargetDefinitions(catalog, state, cleared, { kind: 'minimum', count: 1 }),
    )
    expect(minimum.minimumTargetCount).toBe(1)
    const all = value(
      editTargetDefinitions(catalog, state, minimum, { kind: 'minimum', count: null }),
    )
    expect(Object.hasOwn(all, 'minimumTargetCount')).toBe(false)
    expect(all.targets).toEqual(definitions.targets)
    expect(all.nextTargetId).toBe(40)
  })

  it('完整替换按当前游标分配并重建关联，清空不重置游标', () => {
    const { catalog, state, definitions } = fixture()
    const replaced = value(
      editTargetDefinitions(catalog, state, definitions, {
        kind: 'replace',
        config: {
          targetModIds: ['prefix1', 'suffix2'],
          targetAlternatives: [{ targetModId: 'prefix1', modIds: ['prefix2'] }],
          targetValues: [{ modId: 'prefix2', bounds: [{ index: 0, min: 3 }] }],
          targetFracturedModId: 'suffix2',
          minimumTargetCount: 1,
        },
      }),
    )
    expect(replaced).toEqual({
      nextTargetId: 42,
      targets: [
        { targetId: 't40', modId: 'prefix1' },
        { targetId: 't41', modId: 'suffix2' },
      ],
      alternatives: [{ targetId: 't40', modIds: ['prefix2'] }],
      values: [{ targetId: 't40', modId: 'prefix2', bounds: [{ index: 0, min: 3 }] }],
      fracturedTargetId: 't41',
      minimumTargetCount: 1,
    })
    expect(
      value(
        editTargetDefinitions(catalog, state, replaced, {
          kind: 'replace',
          config: { targetModIds: [] },
        }),
      ),
    ).toEqual({ nextTargetId: 42, targets: [], alternatives: [], values: [] })
  })

  it('分配不能越过安全整数，耗尽游标仍允许不分配的编辑', () => {
    const { catalog, state, definitions } = fixture()
    const last = { ...definitions, nextTargetId: Number.MAX_SAFE_INTEGER - 1 }
    const added = value(
      editTargetDefinitions(catalog, state, last, { kind: 'add', modId: 'suffix2' }),
    )
    expect(added.nextTargetId).toBe(Number.MAX_SAFE_INTEGER)
    expect(added.targets.at(-1)?.targetId).toBe('t9007199254740990')
    expect(editTargetDefinitions(catalog, state, added, { kind: 'add', modId: 'suffix3' }).ok).toBe(
      false,
    )
    expect(
      editTargetDefinitions(catalog, state, last, {
        kind: 'replace',
        config: { targetModIds: ['prefix1', 'suffix1'] },
      }).ok,
    ).toBe(false)
    expect(editTargetDefinitions(catalog, state, added, { kind: 'minimum', count: 1 }).ok).toBe(
      true,
    )
  })

  it('成功与失败均不修改原状态、定义和编辑值，结果独立深拷贝', () => {
    const { catalog, state, definitions } = fixture()
    const edit = {
      kind: 'values' as const,
      targetId: 't21',
      values: [{ modId: 'prefix1', bounds: [{ index: 0, min: 6 }] }],
    }
    const before = structuredClone({ state, definitions, edit })
    const changed = value(editTargetDefinitions(catalog, state, definitions, edit))
    const bound = changed.values.at(-1)?.bounds[0]
    if (!bound) throw Error('缺少数值')
    bound.min = 9
    const target = changed.targets[0]
    const alternative = changed.alternatives[0]
    if (!target || !alternative) throw Error('缺少关联结果')
    target.modId = 'changed'
    alternative.modIds.push('changed')
    expect(
      editTargetDefinitions(catalog, state, definitions, { kind: 'add', modId: 'prefix1' }).ok,
    ).toBe(false)
    expect({ state, definitions, edit }).toEqual(before)
    expect(
      editTargetDefinitions(
        catalog,
        value(enableCraftAffixIdentity(catalog, state)),
        definitions,
        edit,
      ),
    ).toEqual(editTargetDefinitions(catalog, state, definitions, edit))
  })

  it('原配置必须先合法，编辑不修复伪造配置且不放开重复同组与来源', () => {
    const { catalog, state, definitions } = fixture()
    for (const modId of ['prefix1', 'prefix2', 'missing'])
      expect(editTargetDefinitions(catalog, state, definitions, { kind: 'add', modId }).ok).toBe(
        false,
      )
    expect(
      editTargetDefinitions(
        catalog,
        state,
        { ...definitions, nextTargetId: 1 },
        { kind: 'replace', config: { targetModIds: [] } },
      ).ok,
    ).toBe(false)
    expect(
      editTargetDefinitions(
        catalog,
        { ...state, affixes: [...state.affixes, ...state.affixes] },
        definitions,
        { kind: 'remove', targetId: 't21' },
      ).ok,
    ).toBe(false)
    const untrusted = { ...catalog, _meta: { ...catalog._meta, sources: [] } }
    expect(
      editTargetDefinitions(untrusted, state, definitions, { kind: 'add', modId: 'exclusive1' }).ok,
    ).toBe(false)
    const partial = value(
      createTargetDefinitions(boneCatalog(), boneState(), {
        targetModIds: ['prefix1', 'prefix2', 'prefix3', 'prefix4'],
        minimumTargetCount: 3,
      }),
    )
    expect(
      editTargetDefinitions(boneCatalog(), boneState(), partial, { kind: 'minimum', count: null })
        .ok,
    ).toBe(false)
  })

  it('拒绝未知动作字段、显式 undefined、错误关联及伪造嵌套字段', () => {
    const { catalog, state, definitions } = fixture()
    const edits: unknown[] = [
      null,
      [],
      {},
      { kind: 'unknown' },
      { kind: 'add', modId: 'suffix2', extra: undefined },
      { kind: 'remove', targetId: undefined },
      { kind: 'minimum', count: undefined },
      { kind: 'minimum', count: 0 },
      { kind: 'fractured', targetId: undefined },
      { kind: 'fractured', targetId: 't99' },
      { kind: 'values', targetId: 't7', values: undefined },
      { kind: 'alternatives', targetId: 't99', modIds: [] },
      {
        kind: 'values',
        targetId: 't7',
        values: [{ modId: 'suffix1', basis: undefined, bounds: [{ index: 0, min: 2 }] }],
      },
      {
        kind: 'values',
        targetId: 't7',
        values: [{ targetId: 't21', modId: 'suffix1', bounds: [{ index: 0, min: 2 }] }],
      },
      { kind: 'replace', config: { targetModIds: [], targetValues: undefined } },
      { kind: 'replace', config: { targetModIds: [], nextTargetId: 1 } },
    ]
    for (const edit of edits) {
      const before = structuredClone({ definitions, edit })
      expect(editTargetDefinitions(catalog, state, definitions, edit).ok).toBe(false)
      expect({ definitions, edit }).toEqual(before)
    }
  })
})
