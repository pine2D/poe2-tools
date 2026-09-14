import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { applyCraftStep } from './craftSteps'
import { DESECRATION_SOURCE } from './desecration'
import { craftOmenError } from './omens'
import { removableCraftAffixes } from './rehearsal'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

function fixture(id = 'suffix1') {
  const state = boneState(['prefix1', 'prefix2', id, 'suffix2'])
  const desecrated = state.affixes[2]
  if (!desecrated) throw Error('缺少亵渎组')
  desecrated.desecrated = true
  return { catalog: boneCatalog(), state }
}

it.each(['suffix1', 'exclusive1'])('只按实际亵渎来源移除 %s 整组，不按普通或专属 ID 判断', (id) => {
  const { catalog, state } = fixture(id)
  expect(removableCraftAffixes(catalog, state, 'annulment', 'light')).toMatchObject({
    ok: true,
    value: [{ modId: id, desecrated: true }],
  })
  const applied = applyCraftStep(catalog, state, {
    currency: 'annulment',
    omen: 'light',
    removeModId: id,
    modIds: [],
  })
  expect(applied).toMatchObject({
    ok: true,
    value: { affixes: state.affixes.filter((a) => a.modId !== id) },
  })
  expect(
    applyCraftStep(catalog, state, {
      currency: 'annulment',
      omen: 'light',
      removeModId: 'prefix1',
      modIds: [],
    }).ok,
  ).toBe(false)
})

it('普通同 ID、工艺、破裂均不进入池，缺少亵渎组不能无效消费', () => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'suffix1'])
  const prefix = state.affixes[0]
  const suffix = state.affixes[1]
  if (!prefix || !suffix) throw Error('fixture')
  prefix.fractured = true
  suffix.crafted = true
  expect(removableCraftAffixes(catalog, state, 'annulment', 'light')).toMatchObject({
    ok: false,
    error: expect.stringContaining('亵渎'),
  })
  expect(state.affixes).toHaveLength(2)
})

it('仅单枚配基础剥离，未揭示占位沿用门禁', () => {
  expect(craftOmenError('light', 'annulment')).toBeNull()
  for (const currency of ['chaos', 'greater_chaos', 'exalted'] as const)
    expect(craftOmenError('light', currency)).not.toBeNull()
  expect(craftOmenError(['light', 'sinistral_annulment'], 'annulment')).not.toBeNull()
  expect(
    removableCraftAffixes(
      boneCatalog(),
      {
        ...boneState(['prefix1']),
        pendingDesecration: { boneId: 'preserved_rib', kind: 'suffix' },
      },
      'annulment',
      'light',
    ).ok,
  ).toBe(false)
})

it('普通目标腾位建议保留指定损失，但唯一亵渎组不声称随机移除其他组', () => {
  const { catalog, state } = fixture()
  state.affixes.push({ modId: 'suffix3', lines: ['suffix3 5'] })
  const result = analyzeCraftTargets(catalog, state, ['suffix1', 'suffix4'], [], [], 'light')
  expect(result.ok).toBe(true)
  if (!result.ok) throw Error(result.error)
  expect(result.value.steps).toHaveLength(1)
  expect(result.value.steps[0]).toMatchObject({
    omen: 'light',
    removeModId: 'suffix1',
    randomRemovalRisk: false,
    lostTargetIds: ['suffix1'],
  })
})

it('保留两侧普通目标，以光明剥离后重新亵渎并逐步揭示目标', () => {
  const { catalog, state } = fixture('exclusive2')
  const result = planCraftTargetRoutes(catalog, state, ['prefix1', 'suffix2', 'exclusive1'])
  expect(result.ok).toBe(true)
  if (!result.ok) throw Error(result.error)
  const route = result.value.routes.find((r) =>
    r.steps.some((s) => 'currency' in s.operation && s.operation.omen === 'light'),
  )
  expect(route).toBeDefined()
  if (!route) throw Error('缺少光明路线')
  expect(route.steps[0]?.operation).toMatchObject({
    currency: 'annulment',
    omen: 'light',
    removeModId: 'exclusive2',
  })
  expect(route.steps[0]?.atRiskTargetIds).toEqual([])
  expect(
    route.steps.map((s) => ('kind' in s.operation ? s.operation.kind : s.operation.currency)),
  ).toEqual(['annulment', 'desecrate', 'desecration-offer', 'desecration-reveal'])
  let current = state
  for (const step of route.steps) {
    const next = applyCraftStep(catalog, current, step.operation)
    if (!next.ok) throw Error(next.error)
    expect(next.value).toEqual(step.state)
    current = next.value
  }
  expect(current.affixes).toContainEqual(
    expect.objectContaining({ modId: 'exclusive1', desecrated: true }),
  )
  expect(result.value.candidateApplications).toBeLessThanOrEqual(4096)
})

it('已达成目标占用亵渎槽时默认不牺牲，放开后如实报告损失', () => {
  const { catalog, state } = fixture()
  const safe = planCraftTargetRoutes(catalog, state, ['prefix1', 'suffix1', 'exclusive1'])
  expect(safe.ok && safe.value.routes.length).toBe(0)
  const open = planCraftTargetRoutes(catalog, state, ['prefix1', 'suffix1', 'exclusive1'], [], [], {
    preserveMatched: false,
  })
  expect(
    open.ok &&
      open.value.routes.some((r) => r.steps.some((s) => s.lostTargetIds.includes('suffix1'))),
  ).toBe(true)
  if (!open.ok) throw Error(open.error)
  const light = open.value.routes
    .flatMap((route) => route.steps)
    .find((step) => 'currency' in step.operation && step.operation.omen === 'light')
  expect(light).toMatchObject({ lostTargetIds: ['suffix1'], atRiskTargetIds: [] })
})

it('v31 完整循环全游标恢复，旧 v2–30 拒绝撤销位置后的光明操作', () => {
  const catalog = boneCatalog()
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
    desecrationSourceHash: DESECRATION_SOURCE.sha256,
    cursor: 0,
    operations: [
      { currency: 'alchemy', modIds: ids, rolls: ids.map((modId) => ({ modId, values: [5] })) },
      { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix' },
      { kind: 'desecration-offer', modIds: ['suffix3', 'exclusive1', 'exclusive2'] },
      { kind: 'desecration-reveal', modId: 'exclusive2', values: [5] },
      { currency: 'annulment', omen: 'light', removeModId: 'exclusive2', modIds: [] },
      { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix' },
      { kind: 'desecration-offer', modIds: ['suffix3', 'exclusive1', 'exclusive2'] },
      { kind: 'desecration-reveal', modId: 'exclusive1', values: [8] },
    ],
  }
  for (let cursor = 0; cursor <= project.operations.length; cursor++) {
    const restored = parseCraftProject(serializeCraftProject({ ...project, cursor }), catalog)
    expect(restored.ok).toBe(true)
    if (!restored.ok) throw Error(restored.error)
    expect(restored.value.project.rulesVersion).toBe('basic-2026-09-12-v65')
    expect(restored.value.states[5]?.affixes).toHaveLength(4)
    expect(restored.value.states[8]?.affixes.at(-1)).toMatchObject({
      modId: 'exclusive1',
      desecrated: true,
    })
  }
  for (let v = 2; v <= 30; v++)
    expect(
      parseCraftProject(
        JSON.stringify({ ...project, rulesVersion: `basic-2026-09-12-v${v}` }),
        catalog,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('光明') })
})
