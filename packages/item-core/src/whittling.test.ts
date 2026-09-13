import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { applyCraftStep } from './craftSteps'
import { craftOmenError } from './omens'
import { craftCandidates, prepareCraftOperation, removableCraftAffixes } from './rehearsal'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('缺少测试项')
  return value
}

function fixture() {
  const catalog = boneCatalog()
  for (const mod of catalog.modifiers) mod.level = mod.id === 'suffix1' ? 10 : 30
  return { catalog, state: boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2']) }
}

it('按目录出现等级筛选整组，数值高低与位置不改变最低组', () => {
  const { catalog, state } = fixture()
  required(state.affixes[2]).lines = ['suffix1 10']
  expect(removableCraftAffixes(catalog, state, 'chaos', 'whittling')).toMatchObject({
    ok: true,
    value: [{ modId: 'suffix1', lines: ['suffix1 10'] }],
  })
  expect(
    applyCraftStep(catalog, state, {
      currency: 'chaos',
      omen: 'whittling',
      removeModId: 'prefix1',
      modIds: ['prefix3'],
      rolls: [{ modId: 'prefix3', values: [5] }],
    }).ok,
  ).toBe(false)
})

it('并列最低等级保留全部候选，不按行序或前后缀打破平局', () => {
  const { catalog, state } = fixture()
  required(catalog.modifiers.find((m) => m.id === 'prefix1')).level = 10
  const result = removableCraftAffixes(catalog, state, 'chaos', 'whittling')
  expect(result).toMatchObject({ ok: true, value: [{ modId: 'prefix1' }, { modId: 'suffix1' }] })
})

it('先排除破裂组，再求未锁定词缀最低等级，未知实值不妨碍等级判断', () => {
  const { catalog, state } = fixture()
  required(state.affixes[2]).fractured = true
  required(state.affixes[0]).lines = ['prefix1 (1-10)']
  expect(removableCraftAffixes(catalog, state, 'chaos', 'whittling')).toMatchObject({
    ok: true,
    value: [{ modId: 'prefix1' }, { modId: 'prefix2' }, { modId: 'suffix2' }],
  })
})

it('混沌移除后仍可新增另一侧，保留其他来源与数值', () => {
  const { catalog, state } = fixture()
  required(state.affixes[0]).crafted = true
  const prepared = prepareCraftOperation(catalog, state, 'chaos', 'suffix1', 'whittling')
  expect(prepared.ok).toBe(true)
  if (!prepared.ok) return
  expect(
    craftCandidates(catalog, prepared.value.state, 'chaos', 'whittling').some(
      (m) => m.id === 'prefix3',
    ),
  ).toBe(true)
  const applied = applyCraftStep(catalog, state, {
    currency: 'chaos',
    omen: 'whittling',
    removeModId: 'suffix1',
    modIds: ['prefix3'],
    rolls: [{ modId: 'prefix3', values: [7] }],
  })
  expect(applied).toMatchObject({
    ok: true,
    value: {
      affixes: expect.arrayContaining([
        { ...state.affixes[0] },
        { modId: 'prefix3', lines: ['prefix3 7(1-10)'] },
      ]),
    },
  })
})

it('只支持单枚搭配基础混沌，其他通货和组合仍拒绝', () => {
  expect(craftOmenError('whittling', 'chaos')).toBeNull()
  for (const currency of ['annulment', 'greater_chaos', 'perfect_chaos', 'exalted'] as const)
    expect(craftOmenError('whittling', currency)).not.toBeNull()
  expect(craftOmenError(['whittling', 'sinistral_erasure'], 'chaos')).not.toBeNull()
})

it('目标建议只从真实最低组移除，展示并列池风险', () => {
  const { catalog, state } = fixture()
  required(catalog.modifiers.find((m) => m.id === 'prefix1')).level = 10
  const result = analyzeCraftTargets(catalog, state, ['prefix3'], [], [], 'whittling')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.steps.length).toBeGreaterThan(0)
  for (const step of result.value.steps) {
    expect(step.omen).toBe('whittling')
    expect(['prefix1', 'suffix1']).toContain(step.removeModId)
    expect(step.randomRemovalRisk).toBe(true)
  }
})

it('v30 全游标恢复预兆历史，旧 v2–29 禁止未来步骤注入', () => {
  const { catalog } = fixture()
  const ids = ['prefix1', 'prefix2', 'suffix1', 'suffix2']
  const project: CraftProject = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: {
      baseId: 'Synthetic Base',
      itemLevel: 64,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
    },
    operations: [
      { currency: 'alchemy', modIds: ids, rolls: ids.map((modId) => ({ modId, values: [5] })) },
      {
        currency: 'chaos',
        omen: 'whittling',
        removeModId: 'suffix1',
        modIds: ['prefix3'],
        rolls: [{ modId: 'prefix3', values: [7] }],
      },
    ],
    cursor: 0,
  }
  for (let cursor = 0; cursor <= 2; cursor++)
    expect(parseCraftProject(serializeCraftProject({ ...project, cursor }), catalog)).toMatchObject(
      {
        ok: true,
        value: {
          project: {
            rulesVersion: 'basic-2026-09-12-v45',
            cursor,
            operations: [{}, { omen: 'whittling' }],
          },
        },
      },
    )
  for (let v = 2; v <= 29; v++)
    expect(
      parseCraftProject(
        JSON.stringify({ ...project, rulesVersion: `basic-2026-09-12-v${v}` }),
        catalog,
      ).ok,
    ).toBe(false)
})

it('联合路线选择最低等级垃圾组以降低保留目标风险，并逐步回放', () => {
  const { catalog } = fixture()
  required(catalog.modifiers.find((m) => m.id === 'prefix3')).level = 5
  const state = boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])
  const ids = ['prefix1', 'prefix2', 'suffix1', 'suffix2', 'suffix3', 'prefix4']
  const result = planCraftTargetRoutes(catalog, state, ids)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(
    result.value.routes.some((route) =>
      route.steps.some((step) => 'omen' in step.operation && step.operation.omen === 'whittling'),
    ),
  ).toBe(true)
  expect(result.value.candidateApplications).toBeLessThanOrEqual(4096)
  for (const route of result.value.routes) {
    let current = state
    for (const step of route.steps) {
      const next = applyCraftStep(catalog, current, step.operation)
      expect(next.ok).toBe(true)
      if (!next.ok) throw Error(next.error)
      expect(next.value).toEqual(step.state)
      current = next.value
    }
    const advice = analyzeCraftTargets(catalog, current, ids)
    expect(advice.ok && advice.value.targets.every((t) => t.matched)).toBe(true)
  }
})

it('唯一最低组不声称随机移除其他组，新增仍为指定结果', () => {
  const { catalog, state } = fixture()
  const result = analyzeCraftTargets(catalog, state, ['prefix3'], [], [], 'whittling')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.steps.length).toBeGreaterThan(0)
  for (const step of result.value.steps) {
    expect(step.removeModId).toBe('suffix1')
    expect(step.randomRemovalRisk).toBe(false)
  }
})
