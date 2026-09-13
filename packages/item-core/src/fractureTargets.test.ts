import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { analyzeBoneTargets } from './boneAdvice'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import { analyzeEssenceTargets } from './essenceAdvice'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

function fixture() {
  const catalog = boneCatalog('Ring')
  const state = boneState(['prefix1', 'suffix1'])
  state.affixes[0] = { ...required(state.affixes[0]), fractured: true }
  return { catalog, state }
}
const bound = (modId: string, min = 9) => ({ modId, bounds: [{ index: 0, min }] })

it('锁定数值未达成明确不能神圣或移除重造，其它数值仍可指导', () => {
  const { catalog, state } = fixture()
  const locked = analyzeCraftTargets(catalog, state, ['prefix1'], [bound('prefix1')])
  expect(locked.ok).toBe(true)
  if (!locked.ok) throw new Error(locked.error)
  expect(locked.value.targets[0]?.reasons.join(' ')).toContain(
    '破裂属性已锁定，不能通过神圣重掷或移除重造达到数值条件。',
  )
  expect(locked.value.steps).toEqual([])
  const mixed = analyzeCraftTargets(
    catalog,
    state,
    ['prefix1', 'suffix1'],
    [bound('prefix1'), bound('suffix1')],
  )
  expect(mixed.ok).toBe(true)
  if (!mixed.ok) throw new Error(mixed.error)
  expect(mixed.value.steps.find((step) => step.currency === 'divine')).toMatchObject({
    targetModIds: ['suffix1'],
    rerolledTargetIds: ['suffix1'],
  })
  expect(planCraftTargetRoutes(catalog, state, ['prefix1'], [bound('prefix1')])).toMatchObject({
    ok: true,
    value: { routes: [] },
  })
})

it.each([false, true])(
  '神圣路线保留锁定文本（crafted=%s），roll与风险只含未锁定目标，每步真实回放',
  (crafted) => {
    const { catalog, state } = fixture()
    if (crafted) {
      required(state.affixes[0]).crafted = true
      catalog._meta.sources.push({ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' })
      catalog.essences = [
        {
          id: 'Metadata/Items/Currency/CurrencyPerfectEssenceLife',
          name: 'Perfect Essence of Life',
          type: 'Life',
          tierLevel: 1,
          mods: { Ring: 'prefix1' },
        },
      ]
    }
    const plan = planCraftTargetRoutes(
      catalog,
      state,
      ['prefix1', 'suffix1'],
      [bound('prefix1', 5), bound('suffix1')],
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.value.routes.length).toBeGreaterThan(0)
    expect(plan.value.candidateApplications).toBeLessThanOrEqual(4096)
    for (const route of plan.value.routes) {
      let current = state
      for (const step of route.steps) {
        expect('kind' in step.operation && step.operation.kind).not.toBe('fracture')
        expect(step.rerolledTargetIds).not.toContain('prefix1')
        expect(step.atRiskTargetIds).not.toContain('prefix1')
        if ('currency' in step.operation && step.operation.currency === 'divine')
          expect(step.operation.rolls?.map((roll) => roll.modId)).toEqual(['suffix1'])
        const applied = applyCraftStep(catalog, current, step.operation)
        if (!applied.ok) throw new Error(applied.error)
        expect(applied.value).toEqual(step.state)
        expect(applied.value.affixes.find((affix) => affix.modId === 'prefix1')).toEqual(
          state.affixes[0],
        )
        current = applied.value
      }
      expect(analyzeCraftTargets(catalog, current, ['suffix1'], [bound('suffix1')])).toMatchObject({
        ok: true,
        value: { targets: [{ matched: true }] },
      })
    }
  },
)

it('锁定 Genesis 数值不阻断其它固有目标神圣，仍不可重造 Genesis', () => {
  const { catalog, state } = fixture()
  required(catalog.bases[0]).tags.push('genesis_tree_minion')
  required(catalog.bases[0]).implicit = 'Value (1-10)'
  state.implicitLines = ['Value 2(1-10)']
  required(catalog.modifiers.find((mod) => mod.id === 'prefix1')).eligibility = [
    { tag: 'genesis_tree_minion', value: 1 },
    { tag: 'default', value: 0 },
  ]
  const implicit = [{ lineIndex: 0, bounds: [{ index: 0, min: 8 }] }]
  const advice = analyzeCraftTargets(
    catalog,
    state,
    ['prefix1'],
    [bound('prefix1')],
    [],
    undefined,
    implicit,
  )
  expect(advice.ok).toBe(true)
  if (!advice.ok) throw new Error(advice.error)
  expect(advice.value.steps.find((step) => step.currency === 'divine')).toMatchObject({
    targetModIds: [],
    rerolledTargetIds: [],
    targetImplicitLineIndexes: [0],
  })
  const plan = planCraftTargetRoutes(
    catalog,
    state,
    ['prefix1'],
    [bound('prefix1', 5)],
    [],
    {},
    implicit,
  )
  if (!plan.ok) throw new Error(plan.error)
  expect(plan.value.routes.length).toBeGreaterThan(0)
  for (const route of plan.value.routes) {
    expect(route.steps.at(-1)?.state.implicitLines).toEqual(['Value 8(1-10)'])
    for (const step of route.steps)
      expect(step.state.affixes.find((affix) => affix.modId === 'prefix1')).toEqual(
        state.affixes[0],
      )
  }
})

it('满六骨骼及精华建议风险排除锁定目标，真实路线保留锁定组', () => {
  const { catalog, state } = fixture()
  state.affixes.push(...boneState(['prefix2', 'prefix3', 'suffix2', 'suffix3']).affixes)
  const bone = analyzeBoneTargets(catalog, state, ['prefix1', 'exclusive1'])
  if (!bone.ok) throw new Error(bone.error)
  expect(bone.value.length).toBeGreaterThan(0)
  for (const step of bone.value) {
    expect(step.atRiskTargetIds).not.toContain('prefix1')
    expect(step.lostTargetIds).not.toContain('prefix1')
  }
  catalog._meta.sources.push({ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' })
  catalog.essences = [
    {
      id: 'Metadata/Items/Currency/CurrencyPerfectEssenceLife',
      name: 'Perfect Essence of Life',
      type: 'Life',
      tierLevel: 1,
      mods: { Ring: 'prefix4' },
    },
  ]
  const essence = analyzeEssenceTargets(catalog, state, ['prefix1', 'prefix4'])
  if (!essence.ok) throw new Error(essence.error)
  expect(essence.value.length).toBeGreaterThan(0)
  for (const step of essence.value) {
    expect(step.atRiskTargetIds).not.toContain('prefix1')
    expect(step.operation.removeModId).not.toBe('prefix1')
    const applied = applyCraftStep(catalog, state, step.operation)
    if (!applied.ok) throw new Error(applied.error)
    expect(applied.value.affixes.find((affix) => affix.modId === 'prefix1')).toEqual(
      state.affixes[0],
    )
  }
  for (const target of ['exclusive1', 'prefix4']) {
    const plan = planCraftTargetRoutes(catalog, state, ['prefix1', target])
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.value.routes.length).toBeGreaterThan(0)
    expect(plan.value.candidateApplications).toBeLessThanOrEqual(4096)
    for (const route of plan.value.routes) {
      let current = state
      for (const step of route.steps) {
        expect(step.atRiskTargetIds).not.toContain('prefix1')
        const applied = applyCraftStep(catalog, current, step.operation)
        if (!applied.ok) throw new Error(applied.error)
        expect(applied.value).toEqual(step.state)
        expect(applied.value.affixes.find((affix) => affix.modId === 'prefix1')).toEqual(
          state.affixes[0],
        )
        current = applied.value
      }
      expect(current.pendingDesecration).toBeUndefined()
      expect(current.affixes.some((affix) => affix.modId === target)).toBe(true)
    }
  }
})

it('锁定目标没有可生成的显示网格也不阻断固有神圣提示', () => {
  const { catalog, state } = fixture()
  required(catalog.bases[0]).implicit = 'Value (1-10)'
  state.implicitLines = ['Value 2(1-10)']
  required(catalog.modifiers.find((mod) => mod.id === 'prefix1')).lines = ['prefix1 (1.5-2.5)']
  required(state.affixes[0]).lines = ['prefix1 1.5(1.5-2.5)']
  const advice = analyzeCraftTargets(
    catalog,
    state,
    ['prefix1'],
    [{ modId: 'prefix1', bounds: [{ index: 0, min: 1.61, max: 1.69 }] }],
    [],
    undefined,
    [{ lineIndex: 0, bounds: [{ index: 0, min: 8 }] }],
  )
  if (!advice.ok) throw new Error(advice.error)
  expect(advice.value.steps.find((step) => step.currency === 'divine')).toMatchObject({
    targetModIds: [],
    targetImplicitLineIndexes: [0],
    rerolledTargetIds: [],
  })
})

it('定向移除建议来自真实可移除池，不把锁定目标列为损失', () => {
  const { catalog, state } = fixture()
  state.affixes.push(...boneState(['prefix2', 'prefix3', 'suffix2', 'suffix3']).affixes)
  const advice = analyzeCraftTargets(
    catalog,
    state,
    ['prefix1', 'prefix4'],
    [],
    [],
    'sinistral_annulment',
  )
  if (!advice.ok) throw new Error(advice.error)
  expect(advice.value.steps.length).toBeGreaterThan(0)
  for (const step of advice.value.steps) {
    expect(step.removeModId).not.toBe('prefix1')
    expect(step.lostTargetIds).not.toContain('prefix1')
  }
})

it('缺失同组档位不会把锁定组误导为可先移除', () => {
  const { catalog, state } = fixture()
  required(catalog.modifiers.find((mod) => mod.id === 'prefix2')).group = 'prefix1'
  const advice = analyzeCraftTargets(catalog, state, ['prefix2'])
  if (!advice.ok) throw new Error(advice.error)
  expect(advice.value.targets[0]?.reasons).toContain(
    '当前装备已有同组破裂词缀，无法通过移除腾出目标位置。',
  )
  expect(advice.value.steps).toEqual([])
})

it('跨组技能冲突的破裂属性不能被提示为可先移除', () => {
  const { catalog, state } = fixture()
  required(catalog.modifiers.find((mod) => mod.id === 'prefix1')).group = 'EssenceSpellSkillLevel'
  required(catalog.modifiers.find((mod) => mod.id === 'prefix2')).group =
    'GlobalIncreaseSpellSkillGemLevel'
  const advice = analyzeCraftTargets(catalog, state, ['prefix2'])
  if (!advice.ok) throw new Error(advice.error)
  expect(advice.value.targets[0]?.reasons).toContain(
    '当前装备已有互斥的破裂词缀，无法通过移除腾出目标位置。',
  )
  expect(advice.value.steps).toEqual([])
})
