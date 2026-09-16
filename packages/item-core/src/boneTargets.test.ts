import { expect, it } from 'vitest'
import { analyzeBoneTargets } from './boneAdvice'
import { applyBoneCraft } from './boneCraft'
import { boneCatalog, boneState } from './boneTestFixture'
import { craftCandidates, createCraftState } from './rehearsal'
import {
  analyzeCraftTargets,
  craftTargetCandidates,
  validateCraftTargetAlternatives,
  validateCraftTargets,
  validateCraftTargetValues,
} from './targets'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('合成夹具缺失')
  return value
}
it('专属入口可信源与正资格严格，单亵渎槽及数值/替代档位复用真状态校验', () => {
  const catalog = boneCatalog()
  expect(validateCraftTargets(catalog, 'Synthetic Base', ['exclusive1']).ok).toBe(true)
  expect(validateCraftTargets(catalog, 'Synthetic Base', ['exclusive1', 'exclusive2']).ok).toBe(
    false,
  )
  expect(
    validateCraftTargetValues(
      catalog,
      'Synthetic Base',
      ['exclusive1'],
      [{ modId: 'exclusive1', bounds: [{ index: 0, min: 8 }] }],
    ).ok,
  ).toBe(true)
  required(catalog.modifiers.find((mod) => mod.id === 'exclusive2')).group = 'exclusive1'
  expect(
    validateCraftTargetAlternatives(
      catalog,
      'Synthetic Base',
      ['exclusive1'],
      [{ targetModId: 'exclusive1', modIds: ['exclusive2'] }],
    ).ok,
  ).toBe(true)
  expect(craftCandidates(catalog, boneState()).some((mod) => mod.desecratedOnly)).toBe(false)
  const zero = structuredClone(catalog)
  required(zero.modifiers.find((mod) => mod.id === 'exclusive1')).eligibility = [
    { tag: 'default', value: 0 },
  ]
  expect(craftTargetCandidates(zero, 'Synthetic Base').some((mod) => mod.id === 'exclusive1')).toBe(
    false,
  )
  expect(validateCraftTargets(zero, 'Synthetic Base', ['exclusive1']).ok).toBe(false)
  const missing = { ...catalog, _meta: { ...catalog._meta, sources: [] } }
  expect(validateCraftTargets(missing, 'Synthetic Base', ['exclusive1']).ok).toBe(false)
  for (const type of ['Charm', 'Flask'])
    expect(craftTargetCandidates(boneCatalog(type), 'Synthetic Base')).toEqual([])
  expect(
    createCraftState(catalog, {
      ...boneState(),
      affixes: [{ modId: 'exclusive1', lines: ['exclusive1 5'] }],
    }).ok,
  ).toBe(false)
})
it('pending报告实际达成和未达成原因，亵渎专属目标不能由普通崇高生成', () => {
  const catalog = boneCatalog()
  const state = {
    ...boneState(['prefix1']),
    pendingDesecration: { boneId: 'preserved_rib' as const, kind: 'suffix' as const },
  }
  const result = analyzeCraftTargets(catalog, state, ['prefix1', 'exclusive1'])
  expect(result).toMatchObject({
    ok: true,
    value: {
      steps: [],
      targets: [
        { matched: true },
        { matched: false, reasons: expect.arrayContaining([expect.stringContaining('骨骼亵渎')]) },
      ],
    },
  })
  const candidates = craftCandidates(catalog, state)
  expect(candidates.length).toBeGreaterThan(0)
  expect(candidates.some((mod) => mod.id === 'exclusive1')).toBe(false)
  const normal = analyzeCraftTargets(catalog, { ...boneState(), rarity: 'normal' }, ['exclusive1'])
  if (normal.ok) expect(normal.value.targets[0]?.reasons.join('')).not.toContain('动态标签')
})
it('三项不足或目标没有合法网格不能建议骨骼，普通目标也可揭示', () => {
  const catalog = boneCatalog('Sceptre')
  const advice = analyzeBoneTargets(catalog, boneState(), ['suffix1'])
  expect(advice.ok && advice.value.some((step) => step.operation.kind === 'desecrate')).toBe(true)
  const fewer = {
    ...catalog,
    modifiers: catalog.modifiers.filter(
      (mod) => mod.id === 'exclusive1' || mod.id === 'exclusive2',
    ),
  }
  expect(analyzeBoneTargets(fewer, boneState(), ['exclusive1'])).toEqual({ ok: true, value: [] })
  const offgrid = boneCatalog()
  required(offgrid.modifiers.find((mod) => mod.id === 'exclusive1')).lines = [
    'exclusive1 (1.5-2.5)',
  ]
  expect(
    analyzeBoneTargets(
      offgrid,
      boneState(),
      ['exclusive1'],
      [{ modId: 'exclusive1', bounds: [{ index: 0, min: 1.61, max: 1.69 }] }],
    ),
  ).toEqual({ ok: true, value: [] })
})
it('每个建议可真实apply，三项不强制不同group，固定选项只读且target不伪称推进', () => {
  const catalog = boneCatalog()
  for (const id of ['suffix1', 'suffix2', 'suffix3'])
    required(catalog.modifiers.find((mod) => mod.id === id)).group = 'same'
  const state = {
    ...boneState(),
    pendingDesecration: {
      boneId: 'preserved_rib' as const,
      kind: 'suffix' as const,
      options: ['suffix1', 'suffix2', 'suffix3'],
    },
  }
  const result = analyzeBoneTargets(catalog, state, ['exclusive1'])
  expect(result.ok && result.value.length).toBe(3)
  if (result.ok)
    for (const step of result.value) {
      expect(step.operation.kind).toBe('desecration-reveal')
      expect(step.targetModIds).toEqual([])
      expect(applyBoneCraft(catalog, state, step.operation).ok).toBe(true)
    }
  expect(state.pendingDesecration.options).toEqual(['suffix1', 'suffix2', 'suffix3'])
  const source = boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])
  // 此处同组构造不可共存，原状态必须拒绝，不能为建议假删冲突。
  expect(analyzeBoneTargets(catalog, source, ['exclusive1']).ok).toBe(false)
})
it('辅助验证严格消费调用方预算，耗尽不继续生成', () => {
  const catalog = boneCatalog()
  let calls = 0
  const result = analyzeBoneTargets(catalog, boneState(), ['exclusive1'], [], [], {
    consumeCandidate: () => ++calls <= 2,
  })
  expect(calls).toBe(3)
  expect(result).toEqual({ ok: true, value: [] })
  let enough = 0
  const complete = analyzeBoneTargets(catalog, boneState(), ['exclusive1'], [], [], {
    consumeCandidate: () => {
      enough++
      return true
    },
  })
  expect(complete.ok && complete.value.length > 0).toBe(true)
  expect(enough).toBeGreaterThan(3)
})

it('专属目标入口沿揭示候选门禁拒绝未支持数字模板及超过100级记录', () => {
  const catalog = boneCatalog()
  const mod = required(catalog.modifiers.find((mod) => mod.id === 'exclusive1'))
  mod.lines = ['exclusive1 (1 to 3)']
  expect(validateCraftTargets(catalog, 'Synthetic Base', ['exclusive1']).ok).toBe(false)
  expect(
    craftTargetCandidates(catalog, 'Synthetic Base').some((mod) => mod.id === 'exclusive1'),
  ).toBe(false)
  mod.lines = ['exclusive1 (1-10)']
  mod.level = 101
  expect(validateCraftTargets(catalog, 'Synthetic Base', ['exclusive1']).ok).toBe(false)
})

it('pending回退候选允许完成揭示，但无合法网格目标不得标为推进', () => {
  const catalog = boneCatalog()
  required(catalog.modifiers.find((mod) => mod.id === 'prefix1')).lines = ['prefix1 (1.5-2.5)']
  const state = {
    ...boneState(),
    pendingDesecration: { boneId: 'preserved_rib' as const, kind: 'prefix' as const },
  }
  const result = analyzeBoneTargets(
    catalog,
    state,
    ['prefix1'],
    [{ modId: 'prefix1', bounds: [{ index: 0, min: 1.61, max: 1.69 }] }],
  )
  expect(result.ok && result.value.length > 0).toBe(true)
  if (result.ok)
    for (const step of result.value) {
      expect(step.operation.kind).toBe('desecration-offer')
      expect(step.targetModIds).toEqual([])
      expect(applyBoneCraft(catalog, state, step.operation).ok).toBe(true)
    }
})
