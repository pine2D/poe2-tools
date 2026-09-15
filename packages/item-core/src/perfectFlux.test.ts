import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { parseItem } from './parse'
import {
  applyPerfectFluxCraft,
  inspectPerfectFluxCraft,
  isPerfectFluxCraftOperation,
  preparePerfectFluxCraft,
  readCraftGrantedSkillLevel,
} from './perfectFlux'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'

const pattern = 'Grants Skill: Level (1-20) Test Minion'
const observed = 'Grants Skill: Level 12 Test Minion (Max Level 13)'
const catalog = boneCatalog('Sceptre')
const base = catalog.bases[0]
if (!base) throw Error('缺少基底')
base.implicit = pattern
const state: CraftState = {
  ...boneState(['prefix1']),
  nextAffixId: 2,
  affixes: [{ affixId: 'a1', modId: 'prefix1', lines: ['prefix1 5'] }],
  implicitLines: [observed],
}
const operation = { kind: 'perfect-flux', previousMaxLevel: 13 } as const
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}

it('真实导入12最高13后仅保存装备升级结果，保留原文和观察值', () => {
  const raw =
    'Item Class: Sceptres\nRarity: Normal\nSynthetic Base\n--------\nItem Level: 70\n--------\n' +
    observed
  const parsed = parseItem(raw)
  if (!parsed.ok) throw Error(parsed.error)
  const imported = must(
    importCraftState(
      catalog,
      base.id,
      parsed.item,
      inspectItem(parsed.item, {
        items: { bases: { 'Synthetic Base': '测试基底' }, uniques: {} },
      }),
    ),
  )
  const before = structuredClone(imported)
  expect(inspectPerfectFluxCraft(catalog, imported)).toEqual({
    ok: true,
    value: {
      skillName: 'Test Minion',
      observedLine: observed,
      minimumPreviousMaxLevel: 12,
      previousMaxLevel: 13,
    },
  })
  expect(preparePerfectFluxCraft(catalog, imported, 12).ok).toBe(false)
  const result = must(applyPerfectFluxCraft(catalog, imported, operation))
  expect(result).toEqual({ ...before, grantedSkillLevel: 20 })
  expect(imported).toEqual(before)
  expect(readCraftGrantedSkillLevel(catalog, imported)).toEqual({
    ok: true,
    value: { name: 'Test Minion', level: 13 },
  })
  expect(readCraftGrantedSkillLevel(catalog, result)).toEqual({
    ok: true,
    value: { name: 'Test Minion', level: 20 },
  })
  expect(inspectPerfectFluxCraft(catalog, result).ok).toBe(false)
})

it('无最高尾注和搜索未知范围均需声明，不能默认将显示级当最高级', () => {
  const plain = { ...state, implicitLines: ['Grants Skill: Level 12 Test Minion'] }
  expect(must(inspectPerfectFluxCraft(catalog, plain))).toEqual({
    skillName: 'Test Minion',
    observedLine: plain.implicitLines[0],
    minimumPreviousMaxLevel: 12,
    previousMaxLevel: null,
  })
  expect(must(readCraftGrantedSkillLevel(catalog, plain)).level).toBeNull()
  expect(preparePerfectFluxCraft(catalog, plain, 11).ok).toBe(false)
  expect(preparePerfectFluxCraft(catalog, plain, 19).ok).toBe(true)
  const unknown = {
    ...state,
    rarity: 'normal' as const,
    affixes: [],
    nextAffixId: 1,
    implicitLines: [pattern],
  }
  expect(must(inspectPerfectFluxCraft(catalog, unknown))).toMatchObject({
    minimumPreviousMaxLevel: 1,
    previousMaxLevel: null,
  })
  expect(
    must(applyPerfectFluxCraft(catalog, unknown, { ...operation, previousMaxLevel: 1 }))
      .grantedSkillLevel,
  ).toBe(20)
  for (const invalid of [undefined, null, 0, -1, 20, 21, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER])
    expect(preparePerfectFluxCraft(catalog, unknown, invalid as number).ok).toBe(false)
})

it('已观察20或明确最高20拒绝无效果消费，显示20仍不是操作历史', () => {
  for (const line of [
    'Grants Skill: Level 12 Test Minion (Max Level 20)',
    'Grants Skill: Level 20 Test Minion',
  ]) {
    const current = { ...state, implicitLines: [line] }
    expect(createCraftState(catalog, current).ok).toBe(true)
    expect(inspectPerfectFluxCraft(catalog, current).ok).toBe(false)
    expect(applyPerfectFluxCraft(catalog, current, operation).ok).toBe(false)
  }
  expect(
    must(
      readCraftGrantedSkillLevel(catalog, {
        ...state,
        implicitLines: ['Grants Skill: Level 20 Test Minion'],
      }),
    ).level,
  ).toBeNull()
})

it('操作严格拒绝额外字段、继承字段、访问器及非法声明', () => {
  let reads = 0
  const accessor = Object.defineProperty({ kind: 'perfect-flux' }, 'previousMaxLevel', {
    enumerable: true,
    get() {
      reads++
      return 13
    },
  })
  for (const invalid of [
    null,
    [],
    {},
    { ...operation, rolls: [] },
    { ...operation, previousMaxLevel: undefined },
    { ...operation, previousMaxLevel: '13' },
    { ...operation, previousMaxLevel: 20 },
    Object.create(operation),
    accessor,
    Object.defineProperty({ ...operation }, 'extra', { value: undefined }),
  ]) {
    expect(isPerfectFluxCraftOperation(invalid)).toBe(false)
    expect(applyPerfectFluxCraft(catalog, state, invalid as typeof operation).ok).toBe(false)
  }
  expect(reads).toBe(0)
  expect(isPerfectFluxCraftOperation(operation)).toBe(true)
})

it('只支持单一带等级普通施法武器，完整技能行和目录上限必须一致', () => {
  for (const type of ['Wand', 'Staff', 'Sceptre']) {
    const changed = { ...catalog, bases: [{ ...base, type }] }
    expect(preparePerfectFluxCraft(changed, state, 13).ok).toBe(true)
  }
  for (const override of [
    { type: 'Focus' },
    { implicit: 'Grants Skill: Test Minion' },
    { implicit: 'Grants Skill: Level (1-19) Test Minion' },
    { implicit: `${pattern}\nGrants Skill: Parry` },
    { implicit: `${pattern}\nGrants Skill: Level (1-20) Other` },
    { variantList: ['Special'] },
    { hidden: true },
    { runeforged: true },
  ]) {
    const changed = { ...catalog, bases: [{ ...base, ...override }] }
    const current = { ...state, implicitLines: changed.bases[0]?.implicit?.split('\n') ?? [] }
    expect(inspectPerfectFluxCraft(changed, current).ok).toBe(false)
    expect(createCraftState(changed, { ...current, grantedSkillLevel: 20 }).ok).toBe(false)
  }
  expect(
    inspectPerfectFluxCraft(catalog, {
      ...state,
      implicitLines: ['Grants Skill: Level 12 Unknown'],
    }).ok,
  ).toBe(false)
  const extra = structuredClone(catalog)
  const mod = extra.modifiers.find((entry) => entry.id === 'prefix1')
  if (!mod) throw Error('缺少词缀')
  mod.lines = ['Grants Skill: Level 1 Other']
  expect(
    inspectPerfectFluxCraft(extra, {
      ...state,
      affixes: [{ affixId: 'a1', modId: mod.id, lines: mod.lines }],
    }).ok,
  ).toBe(false)
})

it('腐化、摧毁和待揭示拒绝施用，新状态只能是20且需完整合法基底', () => {
  for (const extra of [{ corrupted: true }, { destroyed: true }, { pendingDesecration: {} }])
    expect(inspectPerfectFluxCraft(catalog, { ...state, ...extra } as CraftState).ok).toBe(false)
  for (const value of [undefined, null, 19, 21, '20'])
    expect(createCraftState(catalog, { ...state, grantedSkillLevel: value } as CraftState).ok).toBe(
      false,
    )
  expect(createCraftState(catalog, { ...state, grantedSkillLevel: 20 }).ok).toBe(true)
  expect(createCraftState(catalog, { ...state, corrupted: true, grantedSkillLevel: 20 }).ok).toBe(
    true,
  )
})

it('升级结果不能由继承、隐藏字段或访问器偷偷提供，也不能在复制时被丢弃', () => {
  let reads = 0
  const invalid = [
    Object.assign(Object.create({ grantedSkillLevel: 20 }), state),
    Object.defineProperty({ ...state }, 'grantedSkillLevel', { value: 20 }),
    Object.defineProperty({ ...state }, 'grantedSkillLevel', {
      enumerable: true,
      get() {
        reads++
        return 20
      },
    }),
  ]
  for (const current of invalid) expect(createCraftState(catalog, current).ok).toBe(false)
  expect(reads).toBe(0)
})

it('步骤分发、后续普通制作保留结果与实例，游戏风格出口拒绝丢失升级', () => {
  const before = structuredClone(state)
  Object.freeze(state.affixes[0]?.lines)
  Object.freeze(state.affixes[0])
  Object.freeze(state.affixes)
  Object.freeze(state.implicitLines)
  Object.freeze(state)
  const upgraded = must(applyCraftStep(catalog, state, operation))
  expect(upgraded).toEqual({ ...before, grantedSkillLevel: 20 })
  const next = must(
    applyCraftStep(catalog, upgraded, {
      currency: 'exalted',
      modIds: ['suffix1'],
      rolls: [{ affixId: 'a2', modId: 'suffix1', values: [6] }],
    }),
  )
  expect(next).toMatchObject({
    grantedSkillLevel: 20,
    implicitLines: [observed],
    nextAffixId: 3,
    affixes: [before.affixes[0], { affixId: 'a2', modId: 'suffix1', lines: ['suffix1 6(1-10)'] }],
  })
  expect(upgraded.affixes).not.toBe(state.affixes)
  expect(state).toEqual(before)
  expect(exportCraftItemText(catalog, state).ok).toBe(true)
  expect(exportCraftItemText(catalog, next)).toMatchObject({
    ok: false,
    error: expect.stringContaining('项目'),
  })
})
