import { describe, expect, it, vi } from 'vitest'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  MAX_CRAFT_PROJECT_BYTES,
  parseCraftProject,
} from './craftProject'
import { IDENTITY_CRAFT_RULES_VERSION, upgradeCraftProjectIdentity } from './craftProjectIdentity'
import { catalog as makeCatalog } from './partialTargetFixture'
import * as operationIdentity from './projectOperationIdentity'

const catalog = makeCatalog()
function project(): CraftProject {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: CRAFT_RULES_VERSION,
    initialState: {
      baseId: 'Focus',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
    },
    operations: [
      { currency: 'transmutation', modIds: ['p1'], rolls: [{ modId: 'p1', values: [5] }] },
      { currency: 'augmentation', modIds: ['s1'], rolls: [{ modId: 's1', values: [5] }] },
      { currency: 'regal', modIds: ['p2'], rolls: [{ modId: 'p2', values: [5] }] },
      { currency: 'exalted', modIds: ['s2'], rolls: [{ modId: 's2', values: [5] }] },
      {
        currency: 'chaos',
        removeModId: 'p1',
        modIds: ['p1'],
        rolls: [{ modId: 'p1', values: [7] }],
      },
      { kind: 'fracture', modId: 'p1' },
    ],
    cursor: 2,
    targetModIds: ['p1'],
    targetValues: [{ modId: 'p1', bounds: [{ index: 0, min: 7 }] }],
    targetAlternatives: [{ targetModId: 'p1', modIds: ['high'] }],
    minimumTargetCount: 1,
    targetFracturedModId: 'p1',
    pricing: { unit: 'divine', prices: {}, baseCost: 2 },
    strategy: {
      maxSteps: 20,
      flow: { entryStageId: 'first', stages: [{ id: 'first', name: '第一阶段' }] },
      rules: [
        {
          stageId: 'first',
          conditions: [{ kind: 'selected-targets', modIds: ['p1'], min: 1, value: true }],
          action: { kind: 'stop' },
        },
      ],
    },
    strategyStartStep: 1,
  }
}
function plain(state: { nextAffixId?: number; affixes: { affixId?: string }[] }) {
  const { nextAffixId: _, affixes, ...rest } = state
  return { ...rest, affixes: affixes.map(({ affixId: _, ...affix }) => affix) }
}
describe('旧项目完整历史显式迁移实例身份', () => {
  it('输入未超限但新增身份使输出超出项目大小限制时拒绝升级', () => {
    const value = {
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: CRAFT_RULES_VERSION,
      initialState: { ...project().initialState, baseId: '' },
      operations: [],
      cursor: 0,
    }
    const baseId = 'x'.repeat(MAX_CRAFT_PROJECT_BYTES - JSON.stringify(value).length)
    value.initialState.baseId = baseId
    const localCatalog = makeCatalog(undefined, { id: baseId })
    const text = JSON.stringify(value)
    expect(new TextEncoder().encode(text).byteLength).toBe(MAX_CRAFT_PROJECT_BYTES)
    const legacy = parseCraftProject(text, localCatalog)
    expect(legacy.ok, legacy.ok ? '' : legacy.error).toBe(true)
    expect(upgradeCraftProjectIdentity(text, localCatalog)).toEqual({
      ok: false,
      error: '实例升级后的项目超过 2 MB 限制。',
    })
  })
  it.each([0, 1, 2])('保留建筑师摧毁终止快照，游标 %s 不影响完整迁移', (cursor) => {
    const value = {
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: CRAFT_RULES_VERSION,
      initialState: project().initialState,
      operations: [
        { kind: 'vaal', outcome: 'unchanged' },
        { kind: 'architect', outcome: 'destroy' },
      ],
      cursor,
    }
    const text = JSON.stringify(value)
    const legacy = parseCraftProject(text, catalog)
    expect(legacy.ok, legacy.ok ? '' : legacy.error).toBe(true)
    const result = upgradeCraftProjectIdentity(text, catalog)
    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    if (!result.ok || !legacy.ok) return
    expect(result.value.project.cursor).toBe(cursor)
    expect(result.value.states.map(plain)).toEqual(legacy.value.states)
    expect(result.value.states[2]).toMatchObject({
      nextAffixId: 1,
      destroyed: true,
      corrupted: true,
    })
    expect(
      upgradeCraftProjectIdentity(
        JSON.stringify({
          ...value,
          operations: [...value.operations, { kind: 'vaal', outcome: 'unchanged' }],
        }),
        catalog,
      ).ok,
    ).toBe(false)
  })
  it('全部历史双回放一致，游标之后也迁移；所有非身份项目配置保留', () => {
    const text = JSON.stringify(project())
    const legacy = parseCraftProject(text, catalog)
    expect(legacy.ok, legacy.ok ? '' : legacy.error).toBe(true)
    const result = upgradeCraftProjectIdentity(text, catalog)
    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    if (!result.ok || !legacy.ok) return
    const { initialState: _, operations: __, rulesVersion: ___, ...metadata } = result.value.project
    const {
      initialState: a,
      operations: b,
      rulesVersion: c,
      ...originalMetadata
    } = legacy.value.project
    expect(metadata).toEqual(originalMetadata)
    expect(result.value.project.rulesVersion).toBe(IDENTITY_CRAFT_RULES_VERSION)
    expect(result.value.states.map(plain)).toEqual(legacy.value.states)
    expect(result.value.states).toHaveLength(7)
    expect(result.value.project.initialState).toMatchObject({ nextAffixId: 1, affixes: [] })
    expect(result.value.project.operations[4]).toMatchObject({
      removeAffixId: 'a1',
      rolls: [{ modId: 'p1', affixId: 'a5', values: [7] }],
    })
    expect(result.value.project.operations[5]).toMatchObject({ affixId: 'a5' })
    expect(result.value.states[6]).toMatchObject({ nextAffixId: 6 })
    expect(result.value.states[6]?.affixes.find((a) => a.modId === 'p1')).toMatchObject({
      affixId: 'a5',
      fractured: true,
    })
    expect(JSON.stringify(project())).toBe(text)
  })
  it('先验证原始版本，不能改成新版绕过旧版数值操作限制', () => {
    const value = {
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: 'basic-2026-09-12-v2',
      initialState: project().initialState,
      operations: [{ currency: 'transmutation', modIds: ['p1'] }],
      cursor: 0,
    }
    expect(upgradeCraftProjectIdentity(JSON.stringify(value), catalog).ok).toBe(true)
    const injected = { ...value, operations: [project().operations[0]] }
    expect(upgradeCraftProjectIdentity(JSON.stringify(injected), catalog).ok).toBe(false)
    expect(
      upgradeCraftProjectIdentity(
        JSON.stringify({ ...injected, rulesVersion: CRAFT_RULES_VERSION }),
        catalog,
      ).ok,
    ).toBe(true)
  })
  it('即使每步仍是合法装备，迁移改变词缀顺序也必须拒绝', () => {
    const original = operationIdentity.upgradeProjectOperationIdentity
    const spy = vi
      .spyOn(operationIdentity, 'upgradeProjectOperationIdentity')
      .mockImplementation((...args) => {
        const result = original(...args)
        if (result.ok) result.value.afterState.affixes.reverse()
        return result
      })
    try {
      expect(upgradeCraftProjectIdentity(JSON.stringify(project()), catalog)).toEqual({
        ok: false,
        error: '第 2 步迁移前后的装备状态不一致。',
      })
    } finally {
      spy.mockRestore()
    }
  })
  it('拒绝游标后坏操作、新身份注入、外来派生状态和错误快照', () => {
    const variants = [
      { ...project(), sourceCommit: 'b'.repeat(40) },
      { ...project(), states: [] },
      {
        ...project(),
        operations: [...project().operations, { currency: 'annulment', removeModId: 'missing' }],
      },
      {
        ...project(),
        operations: [...project().operations, { kind: 'fracture', modId: 'p1', affixId: 'a1' }],
      },
      { ...project(), initialState: { ...project().initialState, nextAffixId: 1 } },
    ]
    for (const value of variants)
      expect(upgradeCraftProjectIdentity(JSON.stringify(value), catalog).ok).toBe(false)
    expect(upgradeCraftProjectIdentity('{bad', catalog).ok).toBe(false)
  })
  it('空白起点可以升级，升级输出不由旧版解析器自动接收', () => {
    const value = project()
    value.operations = []
    value.cursor = 0
    delete value.strategyStartStep
    delete value.strategy
    const result = upgradeCraftProjectIdentity(JSON.stringify(value), catalog)
    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    if (!result.ok) return
    expect(result.value.states).toHaveLength(1)
    expect(parseCraftProject(JSON.stringify(result.value.project), catalog).ok).toBe(false)
    expect(upgradeCraftProjectIdentity(JSON.stringify(result.value.project), catalog).ok).toBe(
      false,
    )
  })
})
