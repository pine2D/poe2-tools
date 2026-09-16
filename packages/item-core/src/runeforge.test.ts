import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { catalog as primary } from './catalystTestFixture'
import { collectCraftCosts, craftMaterials } from './craftCosts'
import { applyCraftStep } from './craftSteps'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { applyRuneforgeCraft, isRuneforgeCraftOperation, prepareRuneforgeCraft } from './runeforge'
import { parseRuneforgingCatalog, runeforgingCatalogSignature } from './runeforgingCatalog'
import { checkCraftStrategyAction, readCraftStrategyAction } from './strategyActions'

const catalog = {
  ...primary,
  alloys: JSON.parse(readFileSync('data/craft/alloys.json', 'utf8')),
  runeforging: parseRuneforgingCatalog(
    JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8')),
    primary,
  ),
}
const initial: CraftState = {
  baseId: 'Adherent Cuffs',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  quality: 20,
  sockets: [null],
  sourceText: '原始 Adherent Cuffs',
}
const operation = {
  kind: 'runeforge' as const,
  fromBaseId: initial.baseId,
  toBaseId: 'Runeforged Adherent Cuffs',
}
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}

it('锻造只改变基底，保留破裂实例、孔位、品质和原始来源，后续仍可制作', () => {
  const state: CraftState = {
    ...initial,
    rarity: 'rare',
    nextAffixId: 2,
    affixes: [
      {
        affixId: 'a1',
        modId: 'IncreasedLife1',
        fractured: true,
        lines: ['+15(10-19) to maximum Life'],
      },
    ],
  }
  must(createCraftState(catalog, state))
  const result = must(applyRuneforgeCraft(catalog, state, operation))
  expect(result).toEqual({ ...state, baseId: operation.toBaseId })
  expect(result.affixes).not.toBe(state.affixes)
  expect(
    must(applyCraftStep(catalog, result, { currency: 'exalted', modIds: ['FireResist1'] })).affixes,
  ).toHaveLength(2)
  expect(state.baseId).toBe(initial.baseId)
})

it('全部375条固有保留配方可执行，品质与孔位未知仍为未知', () => {
  const recipes = catalog.runeforging.recipes.filter((r) => r.implicit === 'preserve')
  expect(recipes).toHaveLength(375)
  for (const recipe of recipes) {
    const state: CraftState = {
      baseId: recipe.fromBaseId,
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
    }
    const result = must(
      applyCraftStep(catalog, state, {
        kind: 'runeforge',
        fromBaseId: recipe.fromBaseId,
        toBaseId: recipe.toBaseId,
      }),
    )
    expect(result).toEqual({ ...state, baseId: recipe.toBaseId })
  }
})

it('拒绝未核实固有替换、缺目录、已锻造、未知和非法状态', () => {
  expect(prepareRuneforgeCraft(catalog, { ...initial, baseId: 'Flowing Raiment' })).toEqual({
    ok: false,
    error: expect.stringContaining('未核实'),
  })
  expect(prepareRuneforgeCraft(primary, initial).ok).toBe(false)
  for (const changes of [
    { baseId: operation.toBaseId },
    { baseId: 'unknown' },
    { corrupted: true },
    { destroyed: true },
    { itemLevel: 0 },
    { pendingDesecration: {} },
    { catalyst: {} },
  ]) {
    expect(prepareRuneforgeCraft(catalog, { ...initial, ...changes } as CraftState).ok).toBe(false)
  }
  for (const changes of [
    { fromBaseId: 'Flowing Raiment' },
    { toBaseId: 'Runeforged Flowing Raiment' },
    { cost: 1 },
  ]) {
    expect(applyRuneforgeCraft(catalog, initial, { ...operation, ...changes }).ok).toBe(false)
  }
  expect(isRuneforgeCraftOperation({ ...operation, verisium: 1 })).toBe(false)
})

it('费用取目录数量，策略按当前状态检查真实转换', () => {
  expect(collectCraftCosts(catalog, [operation, operation])).toEqual({
    ok: true,
    value: [{ id: 'currency:verisium', name: 'Verisium', count: 700 }],
  })
  expect(craftMaterials(primary).some((m) => m.id === 'currency:verisium')).toBe(false)
  expect(collectCraftCosts(primary, [operation]).ok).toBe(false)
  expect(readCraftStrategyAction({ kind: 'runeforge' })).toEqual({ kind: 'runeforge' })
  expect(readCraftStrategyAction({ kind: 'runeforge', toBaseId: operation.toBaseId })).toBeNull()
  expect(checkCraftStrategyAction(catalog, initial, { kind: 'runeforge' }).ok).toBe(true)
  expect(
    checkCraftStrategyAction(catalog, must(applyCraftStep(catalog, initial, operation)), {
      kind: 'runeforge',
    }).ok,
  ).toBe(false)
})

it('完整规范化签名覆盖元数据、配方和未解析关系', () => {
  const signature = runeforgingCatalogSignature(catalog)
  expect(signature).not.toBeNull()
  expect(runeforgingCatalogSignature(primary)).toBeNull()
  const reordered = structuredClone(catalog)
  reordered.runeforging.recipes.reverse()
  reordered.runeforging.unresolved.reverse()
  reordered.runeforging._meta.baseSources.reverse()
  expect(runeforgingCatalogSignature(reordered)).toBe(signature)
  for (const change of [
    (c: typeof catalog) => {
      c.runeforging._meta.reviewedAt = '2026-09-15'
    },
    (c: typeof catalog) => {
      required(c.runeforging.recipes[0]).verisium++
    },
    (c: typeof catalog) => {
      required(c.runeforging.unresolved[0]).reason = 'unknown-base'
    },
  ]) {
    const altered = structuredClone(catalog)
    change(altered)
    expect(runeforgingCatalogSignature(altered)).not.toBe(signature)
  }
})

it('工艺和已揭示来源、固有行完整保留', () => {
  const state: CraftState = {
    ...initial,
    rarity: 'rare',
    nextAffixId: 4,
    implicitLines: [],
    affixes: [
      {
        affixId: 'a1',
        modId: 'IncreasedLife1',
        fractured: true,
        lines: ['+15(10-19) to maximum Life'],
      },
      {
        affixId: 'a2',
        modId: 'AlloyLocalWardIncreasePercent1',
        crafted: true,
        lines: ['30(24-30)% increased Runic Ward'],
      },
      { affixId: 'a3', modId: 'FireResist1', desecrated: true, lines: ['+10% to Fire Resistance'] },
    ],
  }
  must(createCraftState(catalog, state))
  expect(must(applyCraftStep(catalog, state, operation))).toEqual({
    ...state,
    baseId: operation.toBaseId,
  })
})

it('目标基底资格改变后拒绝保留不再合法的词缀', () => {
  const altered = structuredClone(catalog)
  const target = required(altered.bases.find((b) => b.id === operation.toBaseId))
  target.tags = ['armour', 'gloves', 'runeforged']
  const state: CraftState = {
    ...initial,
    rarity: 'rare',
    affixes: [{ modId: 'IncreasedLife1', lines: ['+15(10-19) to maximum Life'] }],
  }
  must(createCraftState(catalog, state))
  // 同类正常词缀可能不依赖属性标签，显式移除目标所需资格。
  const modifier = required(altered.modifiers.find((m) => m.id === 'IncreasedLife1'))
  modifier.eligibility = [{ tag: 'str_int_armour', value: 1 }]
  must(createCraftState(altered, state))
  expect(prepareRuneforgeCraft(altered, state).ok).toBe(false)
})

function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('缺少测试样本')
  return value
}
