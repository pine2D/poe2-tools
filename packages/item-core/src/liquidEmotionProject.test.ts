import { expect, it } from 'vitest'
import { catalog, dictionary } from './catalystTestFixture'
import { collectCraftCosts, parseCraftPricing } from './craftCosts'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, type CraftProject, parseCraftProject } from './craftProject'
import type { CraftStep } from './craftSteps'
import { evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import { inspectItem } from './export'
import { JEWEL_SOURCE } from './jewels'
import { LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { parseItem } from './parse'
import { reuseCraftPlan } from './projectPlan'
import type { CraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { operationMatchesStrategyAction } from './strategyStages'

const emotionId = 'Metadata/Items/Currency/DistilledEmotion1'
const step = {
  kind: 'liquid-emotion',
  emotionId,
  removeModId: 'JewelFireDamage',
  values: [20],
} as const
function initial(
  affixes: CraftState['affixes'] = [
    { modId: 'JewelFireDamage', lines: ['10% increased Fire Damage'] },
  ],
): CraftState {
  const raw = exportCraftItemText(catalog, {
    baseId: 'Ruby',
    rarity: 'rare',
    itemLevel: 86,
    sourceText: null,
    affixes,
  })
  if (!raw.ok) throw Error(raw.error)
  const parsed = parseItem(raw.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const restored = importCraftState(
    catalog,
    'Ruby',
    parsed.item,
    inspectItem(parsed.item, dictionary),
    undefined,
    undefined,
    dictionary.stats?.entries,
  )
  if (!restored.ok) throw Error(restored.error)
  return restored.value
}
function project(): CraftProject {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    jewelSourceHash: JEWEL_SOURCE.sha256,
    liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
    initialState: initial(),
    operations: [{ ...step, values: [...step.values] }],
    cursor: 1,
  }
}
const restore = (value: unknown, source = catalog) =>
  parseCraftProject(JSON.stringify(value), source, dictionary)

it('液态材料项目重放、撤销位置和材料报价保持一致', () => {
  const input = project()
  const result = restore(input)
  expect(result.ok).toBe(true)
  if (!result.ok) throw Error(result.error)
  expect(result.value.states[1]?.affixes).toEqual([
    { modId: 'JewelArmour', lines: ['20(10-20)% increased Armour'], crafted: true },
  ])
  expect(restore({ ...input, cursor: 0 }).ok).toBe(true)
  const cost = collectCraftCosts(catalog, input.operations)
  expect(cost).toMatchObject({ ok: true, value: [{ id: `emotion:${emotionId}`, count: 1 }] })
  expect(collectCraftCosts(catalog, [])).toEqual({ ok: true, value: [] })
  expect(
    parseCraftPricing({ unit: 'divine', prices: { [`emotion:${emotionId}`]: 0.5 } }, catalog).ok,
  ).toBe(true)
  expect(
    collectCraftCosts(catalog, [
      { ...step, emotionId: 'Metadata/Items/Currency/EndgameDistilledEmotion2' },
    ] as unknown as CraftStep[]).ok,
  ).toBe(false)
})

it('所有历史位置都拒绝未知材料、非法移除及注入字段，缺失来源不能恢复', () => {
  const p = project()
  for (const operation of [
    { ...step, emotionId: 'missing' },
    { ...step, removeModId: 'missing' },
    { ...step, omen: 'sinistral' },
    { ...step, modId: 'JewelArmour' },
  ])
    expect(restore({ ...p, cursor: 0, operations: [operation] }).ok).toBe(false)
  for (const hash of [undefined, 'a'.repeat(64)])
    expect(restore({ ...p, liquidEmotionSourceHash: hash }).ok).toBe(false)
  expect(restore(p, { ...catalog, liquidEmotions: [] }).ok).toBe(false)
})

it('v49及更早项目不能携带新操作、来源或工艺珠宝起点，合法旧项目仍可升级', () => {
  const p = project()
  for (const version of [2, 32, 48, 49]) {
    expect(restore({ ...p, rulesVersion: `basic-2026-09-12-v${version}` }).ok).toBe(false)
    expect(
      restore({
        ...p,
        liquidEmotionSourceHash: undefined,
        cursor: 0,
        rulesVersion: `basic-2026-09-12-v${version}`,
      }).ok,
    ).toBe(false)
  }
  const legacy = {
    ...p,
    liquidEmotionSourceHash: undefined,
    operations: [],
    cursor: 0,
    rulesVersion: 'basic-2026-09-12-v49',
  }
  expect(restore(legacy).ok).toBe(true)
  const crafted = {
    ...legacy,
    initialState: initial([
      { modId: 'JewelArmour', lines: ['20% increased Armour'], crafted: true },
    ]),
  }
  expect(restore(crafted).ok).toBe(false)
  expect(
    restore({
      ...crafted,
      rulesVersion: CRAFT_RULES_VERSION,
      liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
    }).ok,
  ).toBe(true)
})

it('尚未执行的液态指引也需要来源；配置解析拒绝未支持材料与额外键', () => {
  const p = project()
  const strategy = {
    maxSteps: 10,
    rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'liquid-emotion', emotionId } }],
  }
  const configured = { ...p, operations: [], cursor: 0, strategy }
  expect(restore(configured).ok).toBe(true)
  expect(restore({ ...configured, liquidEmotionSourceHash: undefined }).ok).toBe(false)
  expect(restore({ ...configured, rulesVersion: 'basic-2026-09-12-v49' }).ok).toBe(false)
  for (const action of [
    { kind: 'liquid-emotion', emotionId: 'missing' },
    { kind: 'liquid-emotion', emotionId, omen: 'sinistral' },
  ])
    expect(
      readCraftStrategy({ ...strategy, rules: [{ conditions: [{ kind: 'always' }], action }] }).ok,
    ).toBe(false)
  const parsed = readCraftStrategy(strategy)
  if (!parsed.ok) throw Error(parsed.error)
  expect(evaluateCraftStrategy(catalog, p.initialState, parsed.value, 0)).toMatchObject({
    ok: true,
    value: { kind: 'action' },
  })
  const operation = p.operations[0]
  if (!operation) throw Error('缺少测试操作')
  expect(
    operationMatchesStrategyAction(
      p.initialState,
      { kind: 'liquid-emotion', emotionId },
      operation,
    ),
  ).toBe(true)
  expect(
    operationMatchesStrategyAction(
      p.initialState,
      { kind: 'liquid-emotion', emotionId: `${emotionId}0` },
      operation,
    ),
  ).toBe(false)
  const recipient = { ...p, liquidEmotionSourceHash: undefined, operations: [], cursor: 0 }
  expect(
    reuseCraftPlan(JSON.stringify(recipient), JSON.stringify(configured), catalog, dictionary),
  ).toMatchObject({
    ok: true,
    value: { project: { liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256 } },
  })
})
