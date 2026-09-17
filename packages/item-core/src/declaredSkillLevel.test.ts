import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { exportCraftItemText } from './craftItemText'
import { craftStateSemanticKey } from './craftStateSemanticKey'
import { evaluateCraftStrategy } from './craftStrategy'
import { analyzeCraftImplicitTargets } from './implicitTargets'
import {
  declareInitialSkillLevel,
  preparePerfectFluxCraft,
  readCraftGrantedSkillLevel,
  readSingleGrantedSkill,
} from './perfectFlux'
import { type CraftState, createCraftState } from './rehearsal'
import { planCraftTargetRoutes } from './targetRoutes'

const catalog = boneCatalog('Sceptre')
const base = catalog.bases[0]
if (!base) throw Error('缺少测试基底')
const pattern = 'Grants Skill: Level (1-20) Test Minion'
base.implicit = pattern
const state: CraftState = {
  ...boneState([]),
  implicitLines: ['Grants Skill: Level 12 Test Minion'],
}
const levelTarget = {
  kind: 'granted-skill' as const,
  lineIndex: 0,
  bounds: [{ index: 0, min: 20 }],
}

it('声明只保存最高等级，不覆盖显示级原文，并约束完美溶剂前值', () => {
  const before = structuredClone(state)
  const result = declareInitialSkillLevel(catalog, state, 13)
  expect(result).toEqual({ ok: true, value: { ...state, declaredSkillLevel: 13 } })
  if (!result.ok) throw Error(result.error)
  expect(state).toEqual(before)
  expect(readCraftGrantedSkillLevel(catalog, result.value)).toMatchObject({
    ok: true,
    value: { level: 13 },
  })
  expect(readSingleGrantedSkill(catalog, result.value)).toMatchObject({
    ok: true,
    value: { previousMaxLevel: null },
  })
  expect(preparePerfectFluxCraft(catalog, result.value, 12).ok).toBe(false)
  expect(preparePerfectFluxCraft(catalog, result.value, 13).ok).toBe(true)
  expect(exportCraftItemText(catalog, result.value)).toMatchObject({
    ok: false,
    error: expect.stringContaining('项目'),
  })
  expect(declareInitialSkillLevel(catalog, { ...state, grantedSkillLevel: 20 }, 13).ok).toBe(false)
  expect(craftStateSemanticKey(result.value)).not.toBe(craftStateSemanticKey(state))
})

it('声明拒绝无效值、继承、隐藏和访问器，且不读取 getter', () => {
  for (const level of [undefined, null, 0, 21, 12.5, '13', Number.NaN, 11])
    expect(createCraftState(catalog, { ...state, declaredSkillLevel: level } as never).ok).toBe(
      false,
    )
  let reads = 0
  for (const invalid of [
    Object.assign(Object.create({ declaredSkillLevel: 13 }), state),
    Object.defineProperty({ ...state }, 'declaredSkillLevel', { value: 13 }),
    Object.defineProperty({ ...state }, 'declaredSkillLevel', {
      enumerable: true,
      get() {
        reads++
        return 13
      },
    }),
  ])
    expect(createCraftState(catalog, invalid).ok).toBe(false)
  expect(reads).toBe(0)
  const observed = {
    ...state,
    implicitLines: ['Grants Skill: Level 12 Test Minion (Max Level 13)'],
  }
  expect(declareInitialSkillLevel(catalog, observed, 14).ok).toBe(false)
  expect(declareInitialSkillLevel(catalog, observed, 13).ok).toBe(true)
  expect(
    createCraftState(catalog, { ...observed, declaredSkillLevel: 14, grantedSkillLevel: 20 }).ok,
  ).toBe(false)
  expect(declareInitialSkillLevel(catalog, { ...state, implicitLines: [pattern] }, 1).ok).toBe(true)
  expect(
    declareInitialSkillLevel({ ...catalog, bases: [{ ...base, type: 'Focus' }] }, state, 13).ok,
  ).toBe(false)
  expect(declareInitialSkillLevel(catalog, { ...state, corrupted: true }, 13).ok).toBe(true)
})

it('声明20立即满足目标与条件，路线零消费；显示20仍保持未知', () => {
  const declared = declareInitialSkillLevel(catalog, state, 20)
  if (!declared.ok) throw Error(declared.error)
  expect(preparePerfectFluxCraft(catalog, declared.value, 19).ok).toBe(false)
  expect(analyzeCraftImplicitTargets(catalog, declared.value, [levelTarget])).toMatchObject({
    ok: true,
    value: [{ matched: true }],
  })
  expect(
    planCraftTargetRoutes(catalog, declared.value, [], [], [], { maxDepth: 2, maxStates: 16 }, [
      levelTarget,
    ]),
  ).toMatchObject({ ok: true, value: { alreadyMatched: true, routes: [] } })
  expect(
    evaluateCraftStrategy(
      catalog,
      declared.value,
      {
        maxSteps: 2,
        rules: [
          { conditions: [{ kind: 'granted-skill-level', min: 20 }], action: { kind: 'stop' } },
        ],
      },
      0,
    ),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
  expect(
    readCraftGrantedSkillLevel(catalog, {
      ...state,
      implicitLines: ['Grants Skill: Level 20 Test Minion'],
    }),
  ).toMatchObject({ ok: true, value: { level: null } })
})

it('13级三孔声明生成完整20级五孔路线，保留来源与角色观察行', () => {
  const declared = declareInitialSkillLevel(catalog, { ...state, declaredSkillSockets: 3 }, 13)
  if (!declared.ok) throw Error(declared.error)
  const result = planCraftTargetRoutes(
    catalog,
    declared.value,
    [],
    [],
    [],
    { maxDepth: 2, maxStates: 32 },
    [levelTarget, { kind: 'granted-skill-sockets', lineIndex: 0, bounds: [{ index: 0, min: 5 }] }],
  )
  if (!result.ok) throw Error(result.error)
  expect(result.value.routes.length).toBeGreaterThan(0)
  for (const route of result.value.routes) {
    expect(route.steps).toHaveLength(2)
    expect(route.finalState).toMatchObject({
      declaredSkillLevel: 13,
      declaredSkillSockets: 3,
      grantedSkillLevel: 20,
      grantedSkillSockets: 5,
      implicitLines: state.implicitLines,
    })
    expect(readCraftGrantedSkillLevel(catalog, route.finalState)).toMatchObject({
      ok: true,
      value: { level: 20 },
    })
  }
})
