import { expect, it } from 'vitest'
import { CRAFT_RULES_VERSION, type CraftProject, serializeCraftProject } from './craftProject'
import { catalog as makeCatalog, mod } from './partialTargetFixture'
import { reuseCraftPlan } from './projectPlan'
import { strategyStageAt } from './strategyStages'

const catalog = makeCatalog([mod('fire', 'suffix', { lines: ['+(6-10)% to Fire Resistance'] })])
const current: CraftProject = {
  schemaVersion: 1,
  sourceCommit: catalog._meta.sourceCommit,
  rulesVersion: CRAFT_RULES_VERSION,
  initialState: { baseId: 'Focus', itemLevel: 80, rarity: 'normal', affixes: [], sourceText: null },
  operations: [
    { currency: 'transmutation', modIds: ['fire'], rolls: [{ modId: 'fire', values: [8] }] },
  ],
  cursor: 1,
  pricing: { unit: 'divine', prices: {}, baseCost: 2 },
}
const template: CraftProject = {
  ...current,
  initialState: { ...current.initialState, itemLevel: 90 },
  operations: [],
  cursor: 0,
  pricing: { unit: 'divine', prices: {}, baseCost: 99 },
  targetModIds: ['fire'],
  targetValues: [{ modId: 'fire', bounds: [{ index: 0, min: 10 }] }],
  strategy: {
    maxSteps: 20,
    flow: {
      entryStageId: 'first',
      stages: [
        { id: 'first', name: '第一阶段' },
        { id: 'second', name: '第二阶段' },
      ],
    },
    rules: [
      {
        stageId: 'first',
        conditions: [{ kind: 'always' }],
        action: { kind: 'currency', currency: 'transmutation' },
        nextStageId: 'second',
      },
      { stageId: 'second', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
    ],
  },
  strategyStartStep: 0,
}
it('沿用目标和流程，当前装备历史与报价保留，阶段从当前游标重新开始', () => {
  const before = JSON.stringify([current, template])
  const r = reuseCraftPlan(serializeCraftProject(current), serializeCraftProject(template), catalog)
  expect(r.ok, r.ok ? '' : r.error).toBe(true)
  if (!r.ok) return
  expect(r.value.project.initialState.itemLevel).toBe(80)
  expect(r.value.project.operations).toEqual(current.operations)
  expect(r.value.project.cursor).toBe(1)
  expect(r.value.project.pricing).toEqual(current.pricing)
  expect(r.value.project.targetValues).toEqual(template.targetValues)
  expect(r.value.project.strategyStartStep).toBe(1)
  expect(r.value.states[1]?.affixes[0]?.lines[0]).toContain('8')
  const strategy = r.value.project.strategy
  if (!strategy) throw new Error('缺少指引')
  expect(
    strategyStageAt(
      catalog,
      r.value.states,
      r.value.project.operations,
      strategy,
      1,
      1,
      r.value.project,
    ),
  ).toEqual({ ok: true, value: 'first' })
  expect(JSON.stringify([current, template])).toBe(before)
})
it('纯条件方案清除旧目标与阶段起点，撤销后的未来历史仍保留', () => {
  const source = {
    ...template,
    strategy: {
      maxSteps: 10,
      rules: [{ conditions: [{ kind: 'always' as const }], action: { kind: 'stop' as const } }],
    },
  }
  delete source.strategyStartStep
  delete source.targetModIds
  delete source.targetValues
  const r = reuseCraftPlan(
    serializeCraftProject({ ...template, ...current, cursor: 0 }),
    serializeCraftProject(source),
    catalog,
  )
  expect(r.ok, r.ok ? '' : r.error).toBe(true)
  if (!r.ok) return
  expect(r.value.project.targetModIds).toBeUndefined()
  expect(r.value.project.targetValues).toBeUndefined()
  expect(r.value.project.strategyStartStep).toBeUndefined()
  expect(r.value.project.operations).toHaveLength(1)
  expect(r.value.project.cursor).toBe(0)
})
it('损坏来源、空方案与失联深层目标引用不能覆盖当前项目', () => {
  expect(reuseCraftPlan(serializeCraftProject(current), '{bad', catalog).ok).toBe(false)
  expect(
    reuseCraftPlan(serializeCraftProject(current), serializeCraftProject(current), catalog).ok,
  ).toBe(false)
  const source: CraftProject = {
    ...current,
    strategy: {
      maxSteps: 10,
      rules: [
        {
          conditions: [
            {
              kind: 'not',
              condition: { kind: 'selected-targets', modIds: ['fire'], min: 1, value: true },
            },
          ],
          action: { kind: 'stop' },
        },
      ],
    },
  }
  expect(
    reuseCraftPlan(serializeCraftProject(current), serializeCraftProject(source), catalog).ok,
  ).toBe(false)
})

it('跨基底共享合法显式目标可沿用，固有行号不能映射到另一种属性', () => {
  const base = catalog.bases[0]
  if (!base) throw new Error('缺少基底')
  const source = {
    ...catalog,
    bases: [
      { ...base, implicit: '+(10-20)% to Fire Resistance', implicitTags: [[]] },
      {
        ...base,
        id: 'Other',
        name: 'Other',
        implicit: '+(10-20)% to Cold Resistance',
        implicitTags: [[]],
      },
    ],
  }
  const original = {
    ...template,
    targetImplicitValues: [{ lineIndex: 0, bounds: [{ index: 0, min: 15 }] }],
  }
  const receiving = { ...current, initialState: { ...current.initialState, baseId: 'Other' } }
  const rejected = reuseCraftPlan(
    serializeCraftProject(receiving),
    serializeCraftProject(original),
    source,
  )
  expect(rejected.ok ? '' : rejected.error).toContain('固有属性不同')
  expect(
    reuseCraftPlan(serializeCraftProject(receiving), serializeCraftProject(template), source).ok,
  ).toBe(true)
})

it('新基底不支持收藏中的显式目标时拒绝，不能产生看似合法的空方案', () => {
  const base = catalog.bases[0]
  if (!base) throw new Error('缺少基底')
  const source = {
    ...catalog,
    bases: [...catalog.bases, { ...base, id: 'Other', name: 'Other', tags: ['default'] }],
  }
  const receiving = {
    ...current,
    initialState: { ...current.initialState, baseId: 'Other' },
    operations: [],
    cursor: 0,
  }
  const rejected = reuseCraftPlan(
    serializeCraftProject(receiving),
    serializeCraftProject(template),
    source,
  )
  expect(rejected.ok ? '' : rejected.error).toContain('不兼容')
})

it('沿用未执行的镶嵌流程时带入已验证指纹，保留当前历史与品质声明', () => {
  const source = {
    ...catalog,
    _meta: {
      ...catalog._meta,
      sources: [
        {
          path: 'src/Data/ModRunes.lua',
          url: 'https://example.test/runes',
          sha256: 'b'.repeat(64),
        },
      ],
    },
  }
  const plan: CraftProject = {
    ...template,
    augmentSourceHash: 'b'.repeat(64),
    strategy: {
      maxSteps: 20,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'artificer' } }],
    },
  }
  delete plan.strategyStartStep
  const reused = reuseCraftPlan(serializeCraftProject(current), serializeCraftProject(plan), source)
  expect(reused.ok, reused.ok ? '' : reused.error).toBe(true)
  if (!reused.ok) return
  expect(reused.value.project.augmentSourceHash).toBe('b'.repeat(64))
  expect(reused.value.project.operations).toEqual(current.operations)
})
