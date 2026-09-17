import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { collectCraftCosts, craftMaterials, parseCraftPricing, quoteCraftCosts } from './craftCosts'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { evaluateCraftStrategy } from './craftStrategy'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import {
  applySkillSocketsCraft,
  inspectSkillSocketsCraft,
  isSkillSocketsCraftOperation,
  prepareSkillSocketsCraft,
  readCraftGrantedSkillSockets,
} from './skillSockets'
import { checkCraftStrategyAction, readCraftStrategyAction } from './strategyActions'
import { readStrategyConditions } from './strategyConditions'
import { operationMatchesStrategyAction } from './strategyStages'

const catalog = boneCatalog('Sceptre')
const base = catalog.bases[0]
if (!base) throw Error('缺少基底')
base.implicit = 'Grants Skill: Level (1-20) Test Minion'
const state: CraftState = {
  ...boneState(['prefix1']),
  implicitLines: ['Grants Skill: Level 12 Test Minion (Max Level 13)'],
}
const operation = { kind: 'skill-sockets', tier: 'perfect', previousSockets: 2 } as const
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}

it('辅助孔未知不从符文孔或技能等级推断；直接设五孔仅消费一颗', () => {
  expect(must(inspectSkillSocketsCraft(catalog, state))).toEqual({
    skillName: 'Test Minion',
    previousSockets: null,
  })
  const next = must(applyCraftStep(catalog, state, operation))
  expect(next).toEqual({ ...state, grantedSkillSockets: 5 })
  expect(inspectSkillSocketsCraft(catalog, next).ok).toBe(false)
  expect(must(readCraftGrantedSkillSockets(catalog, next))).toEqual({
    name: 'Test Minion',
    sockets: 5,
  })
  expect(must(collectCraftCosts(catalog, [operation]))).toEqual([
    { id: 'currency:perfect-jewellers', name: "Perfect Jeweller's Orb", count: 1 },
  ])
  expect(exportCraftItemText(catalog, next)).toMatchObject({
    ok: false,
    error: expect.stringContaining('项目'),
  })
})

it('三档只允许严格增孔且声明须与已知结果相符', () => {
  for (const tier of ['lesser', 'greater', 'perfect'] as const)
    expect(prepareSkillSocketsCraft(catalog, state, tier, 2).ok).toBe(true)
  const three = must(applyCraftStep(catalog, state, { ...operation, tier: 'lesser' }))
  expect(prepareSkillSocketsCraft(catalog, three, 'perfect', 2).ok).toBe(false)
  expect(prepareSkillSocketsCraft(catalog, three, 'lesser', 3).ok).toBe(false)
  expect(prepareSkillSocketsCraft(catalog, three, 'perfect', 3).ok).toBe(true)
  for (const previousSockets of [undefined, null, 1, 5, 2.5, '2'])
    expect(
      applySkillSocketsCraft(catalog, state, { ...operation, previousSockets } as never).ok,
    ).toBe(false)
  expect(isSkillSocketsCraftOperation({ ...operation, extra: true })).toBe(false)
  expect(isSkillSocketsCraftOperation({ ...operation, tier: 'lesser', previousSockets: 3 })).toBe(
    false,
  )
})

it('保留完美溶剂结果并拒绝不支持的身份和状态', () => {
  expect(
    must(applyCraftStep(catalog, { ...state, grantedSkillLevel: 20 }, operation)),
  ).toMatchObject({ grantedSkillLevel: 20, grantedSkillSockets: 5 })
  for (const extra of [
    { corrupted: true },
    { destroyed: true },
    { pendingDesecration: {} },
    { sourceText: 'Item\nSanctified\n--------' },
  ])
    expect(inspectSkillSocketsCraft(catalog, { ...state, ...extra } as CraftState).ok).toBe(false)
  for (const implicit of ['Grants Skill: Test Minion', `${base.implicit}\nGrants Skill: Parry`])
    expect(inspectSkillSocketsCraft({ ...catalog, bases: [{ ...base, implicit }] }, state).ok).toBe(
      false,
    )
  for (const value of [undefined, null, 2, 6, '3'])
    expect(createCraftState(catalog, { ...state, grantedSkillSockets: value } as never).ok).toBe(
      false,
    )
  expect(
    createCraftState(catalog, Object.assign(Object.create({ grantedSkillSockets: 3 }), state)).ok,
  ).toBe(false)
})

it('条件闭区间2–5，未知的正反条件都不命中，动作身份含档次及声明', () => {
  expect(readCraftStrategyAction(operation)).toEqual(operation)
  for (const min of [1, 6, 2.5])
    expect(readStrategyConditions([{ kind: 'granted-skill-sockets', min }])).toBeNull()
  for (const condition of [
    { kind: 'granted-skill-sockets', min: 5 } as const,
    { kind: 'not', condition: { kind: 'granted-skill-sockets', min: 5 } } as const,
  ]) {
    expect(
      evaluateCraftStrategy(
        catalog,
        state,
        { maxSteps: 5, rules: [{ conditions: [condition], action: { kind: 'stop' } }] },
        0,
      ),
    ).toEqual({ ok: true, value: { kind: 'unmatched' } })
  }
  expect(
    operationMatchesStrategyAction(state, operation, { ...operation, previousSockets: 3 }),
  ).toBe(false)
  expect(operationMatchesStrategyAction(state, operation, operation)).toBe(true)
})

it('真实导入保持未知，未知辅助孔原文与圣化原文不获得完整导入授权', () => {
  const header =
    'Item Class: Sceptres\nRarity: Normal\nSynthetic Base\n--------\nItem Level: 70\n--------\nGrants Skill: Level 12 Test Minion'
  const imported = (raw: string) => {
    const parsed = parseItem(raw)
    if (!parsed.ok) throw Error(parsed.error)
    return importCraftState(
      catalog,
      base.id,
      parsed.item,
      inspectItem(parsed.item, { items: { bases: { 'Synthetic Base': '测试基底' }, uniques: {} } }),
    )
  }
  expect(must(readCraftGrantedSkillSockets(catalog, must(imported(header)))).sockets).toBeNull()
  for (const suffix of ['Support Sockets: 3', 'Sanctified'])
    expect(imported(`${header}\n--------\n${suffix}`).ok).toBe(false)
})

it('访问器、隐藏字段及继承不能提供结果或声明', () => {
  let reads = 0
  const accessor = Object.defineProperty(
    { kind: 'skill-sockets', tier: 'perfect' },
    'previousSockets',
    {
      enumerable: true,
      get: () => {
        reads++
        return 2
      },
    },
  )
  for (const invalid of [
    accessor,
    Object.create(operation),
    Object.defineProperty({ ...operation }, 'extra', { value: undefined }),
  ]) {
    expect(isSkillSocketsCraftOperation(invalid)).toBe(false)
    expect(readCraftStrategyAction(invalid)).toBeNull()
  }
  for (const invalid of [
    Object.defineProperty({ ...state }, 'grantedSkillSockets', { value: 3 }),
    Object.defineProperty({ ...state }, 'grantedSkillSockets', {
      enumerable: true,
      get: () => {
        reads++
        return 3
      },
    }),
  ])
    expect(createCraftState(catalog, invalid).ok).toBe(false)
  expect(reads).toBe(0)
})

it('普通后续制作保留孔数，已知条件命中，三档报价只计实际材料', () => {
  const five = must(applyCraftStep(catalog, state, operation))
  const next = must(applyCraftStep(catalog, five, { currency: 'exalted', modIds: ['suffix1'] }))
  expect(next.grantedSkillSockets).toBe(5)
  expect(checkCraftStrategyAction(catalog, five, operation).ok).toBe(false)
  expect(
    evaluateCraftStrategy(
      catalog,
      five,
      {
        maxSteps: 5,
        rules: [
          { conditions: [{ kind: 'granted-skill-sockets', min: 5 }], action: { kind: 'stop' } },
        ],
      },
      1,
    ),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
  const steps = [
    { kind: 'skill-sockets', tier: 'lesser', previousSockets: 2 },
    { kind: 'skill-sockets', tier: 'greater', previousSockets: 3 },
    { kind: 'skill-sockets', tier: 'perfect', previousSockets: 4 },
  ] as const
  const prices = {
    'currency:lesser-jewellers': 1,
    'currency:greater-jewellers': 2,
    'currency:perfect-jewellers': 3,
  }
  const pricing = must(parseCraftPricing({ unit: 'divine', prices }, catalog))
  expect(must(quoteCraftCosts(must(collectCraftCosts(catalog, [...steps])), pricing)).total).toBe(6)
  for (const id of Object.keys(prices))
    expect(craftMaterials(catalog).some((entry) => entry.id === id)).toBe(true)
})

it('普通三类基底均支持，额外技能与非法基底不支持', () => {
  for (const type of ['Wand', 'Staff', 'Sceptre'])
    expect(inspectSkillSocketsCraft({ ...catalog, bases: [{ ...base, type }] }, state).ok).toBe(
      true,
    )
  for (const override of [
    { type: 'Focus' },
    { hidden: true },
    { variantList: ['Special'] },
    { runeforged: true },
  ])
    expect(
      inspectSkillSocketsCraft({ ...catalog, bases: [{ ...base, ...override }] }, state).ok,
    ).toBe(false)
  const extra = structuredClone(catalog)
  const mod = extra.modifiers.find((entry) => entry.id === 'prefix1')
  if (!mod) throw Error('缺少词缀')
  mod.lines = ['Grants Skill: Level 1 Other']
  expect(
    inspectSkillSocketsCraft(extra, { ...state, affixes: [{ modId: mod.id, lines: mod.lines }] })
      .ok,
  ).toBe(false)
})
