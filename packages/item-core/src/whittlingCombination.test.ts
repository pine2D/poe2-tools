import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { collectCraftCosts } from './craftCosts'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import type { CraftOmen } from './omens'
import { removableCraftAffixes } from './rehearsal'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw Error(r.error)
  return r.value
}
function fixture() {
  const catalog = boneCatalog()
  for (const m of catalog.modifiers) m.level = m.id === 'suffix1' ? 1 : m.id === 'prefix1' ? 10 : 30
  return { catalog, state: boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2']) }
}
const left = 'whittling_sinistral_erasure' as CraftOmen
const right = 'whittling_dextral_erasure' as CraftOmen

it('双预兆先限定侧再求最低等级，低等级另一侧不会阻塞；并列与破裂正确处理', () => {
  const { catalog, state } = fixture()
  expect(must(removableCraftAffixes(catalog, state, 'chaos', left)).map((m) => m.modId)).toEqual([
    'prefix1',
  ])
  expect(must(removableCraftAffixes(catalog, state, 'chaos', right)).map((m) => m.modId)).toEqual([
    'suffix1',
  ])
  const mod = catalog.modifiers.find((m) => m.id === 'prefix2')
  if (!mod) throw Error('fixture')
  mod.level = 10
  expect(must(removableCraftAffixes(catalog, state, 'chaos', left))).toHaveLength(2)
  const affix = state.affixes[0]
  if (!affix) throw Error('fixture')
  affix.fractured = true
  expect(must(removableCraftAffixes(catalog, state, 'chaos', left)).map((m) => m.modId)).toEqual([
    'prefix2',
  ])
  state.affixes = state.affixes.filter((m) => m.modId !== 'prefix2')
  expect(removableCraftAffixes(catalog, state, 'chaos', left).ok).toBe(false)
})

it('移除最低前缀后允许新增后缀，计三种材料，非法侧和非最低组被拒绝', () => {
  const { catalog, state } = fixture()
  const step = {
    currency: 'chaos' as const,
    omen: left,
    removeModId: 'prefix1',
    modIds: ['suffix3'],
    rolls: [{ modId: 'suffix3', values: [7] }],
  }
  const next = must(applyCraftStep(catalog, state, step))
  expect(next.affixes.map((m) => m.modId)).toEqual(['prefix2', 'suffix1', 'suffix2', 'suffix3'])
  expect(next.affixes.at(-1)?.lines).toEqual(['suffix3 7(1-10)'])
  expect(must(collectCraftCosts(catalog, [step])).map((m) => [m.name, m.count])).toEqual([
    ['混沌石', 1],
    ['Omen of Whittling', 1],
    ['Omen of Sinistral Erasure', 1],
  ])
  for (const removeModId of ['prefix2', 'suffix1'])
    expect(applyCraftStep(catalog, state, { ...step, removeModId }).ok).toBe(false)
  expect(applyCraftStep(catalog, state, { ...step, currency: 'annulment' }).ok).toBe(false)
})

it('目标建议按双预兆真实池报告唯一与并列风险', () => {
  const { catalog, state } = fixture()
  let advice = must(analyzeCraftTargets(catalog, state, ['prefix3'], [], [], left))
  expect(advice.steps.length).toBeGreaterThan(0)
  expect(advice.steps.every((s) => s.removeModId === 'prefix1' && !s.randomRemovalRisk)).toBe(true)
  const mod = catalog.modifiers.find((m) => m.id === 'prefix2')
  if (!mod) throw Error('fixture')
  mod.level = 10
  advice = must(analyzeCraftTargets(catalog, state, ['prefix3'], [], [], left))
  expect(advice.steps.every((s) => s.randomRemovalRisk)).toBe(true)
})

it('项目保存未来组合步骤，各游标恢复，v2–63 不能夹带双预兆', () => {
  const { catalog } = fixture()
  const ids = ['prefix1', 'prefix2', 'suffix1', 'suffix2']
  const project = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: { ...boneState(), rarity: 'normal', sockets: undefined },
    operations: [
      { currency: 'alchemy', modIds: ids, rolls: ids.map((modId) => ({ modId, values: [5] })) },
      {
        currency: 'chaos',
        omen: left,
        removeModId: 'prefix1',
        modIds: ['suffix3'],
        rolls: [{ modId: 'suffix3', values: [7] }],
      },
    ],
    cursor: 0,
  }
  for (const cursor of [0, 1, 2])
    expect(
      must(parseCraftProject(JSON.stringify({ ...project, cursor }), catalog)).project.cursor,
    ).toBe(cursor)
  for (let v = 2; v <= 63; v++)
    expect(
      parseCraftProject(
        JSON.stringify({ ...project, rulesVersion: `basic-2026-09-12-v${v}` }),
        catalog,
      ).ok,
    ).toBe(false)
  const dormant = {
    ...project,
    operations: [],
    cursor: 0,
    strategy: {
      maxSteps: 10,
      rules: [
        { conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
        {
          conditions: [{ kind: 'always' }],
          action: { kind: 'currency', currency: 'chaos', omen: right },
        },
      ],
    },
  }
  expect(parseCraftProject(JSON.stringify(dormant), catalog).ok).toBe(true)
  expect(
    parseCraftProject(JSON.stringify({ ...dormant, rulesVersion: 'basic-2026-09-12-v63' }), catalog)
      .ok,
  ).toBe(false)
})

it('路线只在组合比两种单预兆都进一步缩池时推荐，步骤可完整回放', () => {
  const { catalog } = fixture()
  const state = boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])
  const ids = ['prefix2', 'prefix3', 'prefix4', 'suffix1', 'suffix2', 'suffix3']
  const routes = must(planCraftTargetRoutes(catalog, state, ids))
  const combined = routes.routes.find((r) =>
    r.steps.some((s) => 'omen' in s.operation && s.operation.omen === left),
  )
  expect(combined).toBeDefined()
  if (!combined) throw Error('missing route')
  let current = state
  for (const step of combined.steps) {
    current = must(applyCraftStep(catalog, current, step.operation))
    expect(current).toEqual(step.state)
  }
  const lowest = catalog.modifiers.find((m) => m.id === 'prefix1')
  if (!lowest) throw Error('fixture')
  lowest.level = 1
  const suffix = catalog.modifiers.find((m) => m.id === 'suffix1')
  if (!suffix) throw Error('fixture')
  suffix.level = 30
  const simple = must(planCraftTargetRoutes(catalog, state, ids))
  expect(
    simple.routes.some((r) =>
      r.steps.some((s) => 'omen' in s.operation && s.operation.omen === left),
    ),
  ).toBe(false)
})
