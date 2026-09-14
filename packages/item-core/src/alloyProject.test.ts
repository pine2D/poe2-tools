import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { alloyProjectUsage } from './alloyProjectUsage'
import { alloyCatalogSignature } from './alloys'
import { alloyTestFixture } from './alloyTestFixture'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts, parseCraftPricing, quoteCraftCosts } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { type AlloyCraftOperation, applyCraftStep } from './craftSteps'
import { type ItemDictionary, inspectItem } from './export'
import { parseItem } from './parse'
import type { CraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { estimateResistances } from './resistances'
import { statScalabilitySourceHash } from './statScalability'
import { craftTargetCandidates } from './targets'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('缺少测试记录')
  return value
}

const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog = { ...primary, alloys: alloyTestFixture() }
const initial: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  affixes: [
    { modId: 'IncreasedLife1', lines: ['+19(10-19) to maximum Life'] },
    { modId: 'FireResist1', lines: ['+9(6-10)% to Fire Resistance'] },
  ],
}
function imported(state: CraftState, locale: 'en' | 'zh-CN' | 'zh-TW' = 'en'): CraftState {
  const dictionary: ItemDictionary =
    locale === 'en'
      ? {}
      : {
          stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
          items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
        }
  const exported = exportCraftItemText(catalog, state, { locale, dictionary })
  if (!exported.ok) throw Error(exported.error)
  const parsed = parseItem(exported.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const result = importCraftState(
    catalog,
    state.baseId,
    parsed.item,
    inspectItem(parsed.item, createCraftItemDictionary(catalog, dictionary)),
    state.sockets,
  )
  if (!result.ok) throw Error(result.error)
  return result.value
}
const operation: AlloyCraftOperation = {
  kind: 'alloy',
  alloyId: 'Metadata/Items/Currency/CurrencyVerisiumAlloy1',
  removeModId: 'IncreasedLife1',
  values: [40],
}
function project() {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    alloyCatalogSignature: alloyCatalogSignature(catalog),
    initialState: imported(initial),
    operations: [operation],
    cursor: 0,
  }
}

it('合金单价可报价、计总额并保存恢复，缺表不能使用合金报价', () => {
  const pricing = { unit: 'divine' as const, prices: { [`alloy:${operation.alloyId}`]: 0.25 } }
  expect(parseCraftPricing(pricing, catalog).ok).toBe(true)
  expect(parseCraftPricing(pricing, primary).ok).toBe(false)
  const costs = collectCraftCosts(catalog, [operation, operation])
  if (!costs.ok) throw Error(costs.error)
  expect(quoteCraftCosts(costs.value, pricing)).toMatchObject({ ok: true, value: { total: 0.5 } })
  expect(parseCraftProject(JSON.stringify({ ...project(), pricing }), catalog).ok).toBe(true)
  const onlyPrice = { ...project(), operations: [], pricing, alloyCatalogSignature: undefined }
  expect(parseCraftProject(JSON.stringify(onlyPrice), catalog).ok).toBe(false)
  expect(
    alloyProjectUsage({
      name: 'AlloyTest',
      label: 'AlloyEffectOfResistanceMods1',
      sourceText: 'AlloyMaximumRunicWard1',
    }),
  ).toEqual({ used: false, resistanceEffect: false })
  expect(alloyProjectUsage({ pricing })).toEqual({ used: true, resistanceEffect: false })
})

it('保存撤销后的合金步骤，回放、属性身份及目标资格完整保留', () => {
  const restored = parseCraftProject(JSON.stringify(project()), catalog)
  if (!restored.ok) throw Error(restored.error)
  expect(restored.value.project.cursor).toBe(0)
  expect(restored.value.states[1]?.affixes.at(-1)).toMatchObject({
    modId: 'AlloyMaximumRunicWard1',
    crafted: true,
  })
  expect(restored.value.project.alloyCatalogSignature).toBe(alloyCatalogSignature(catalog))
  expect(
    craftTargetCandidates(catalog, initial.baseId).some((m) => m.id === 'AlloyMaximumRunicWard1'),
  ).toBe(true)
  expect(craftTargetCandidates(primary, initial.baseId).some((m) => m.id.startsWith('Alloy'))).toBe(
    false,
  )
})

it('缺表、语义变化、旧版本的未来步骤及未触发指引都不能绕过门禁', () => {
  const value = project()
  const changed = structuredClone(catalog)
  required(required(changed.alloys.alloys[0]).mappings[0]).modId = 'AlloyMaximumRunicWardPercent1'
  for (const source of [primary, changed])
    expect(parseCraftProject(JSON.stringify(value), source).ok).toBe(false)
  for (const patch of [
    { alloyCatalogSignature: undefined },
    { alloyCatalogSignature: 'bad' },
    { rulesVersion: 'basic-2026-09-12-v65' },
    {
      rulesVersion: 'basic-2026-09-12-v65',
      operations: [],
      strategy: {
        maxSteps: 10,
        rules: [
          {
            conditions: [{ kind: 'rarity', value: 'normal' }],
            action: { kind: 'alloy', alloyId: operation.alloyId },
          },
        ],
      },
    },
    {
      rulesVersion: 'basic-2026-09-12-v65',
      operations: [],
      targetModIds: ['AlloyMaximumRunicWard1'],
    },
    { operations: [{ ...operation, omen: 'dextral' }] },
  ])
    expect(parseCraftProject(JSON.stringify({ ...value, ...patch }), catalog).ok).toBe(false)
  const independent = { ...value, alloyCatalogSignature: undefined, operations: [] }
  expect(parseCraftProject(JSON.stringify(independent), primary).ok).toBe(true)
})

it('君王高级基础文本回读不重复缩放，项目在未来增效步骤核对缩放指纹', () => {
  const sovereign: AlloyCraftOperation = {
    ...operation,
    alloyId: 'Metadata/Items/Currency/CurrencyVerisiumAlloy9',
    values: [30],
  }
  const applied = applyCraftStep(catalog, initial, sovereign)
  if (!applied.ok) throw Error(applied.error)
  const state = imported({ ...applied.value, catalyst: { id: "Xoph's", quality: 20 } })
  expect(estimateResistances(catalog, state).fireResistance).toEqual({ ok: true, value: 13 })
  expect(state.affixes.find((a) => a.modId === 'FireResist1')?.lines).toEqual([
    '+9(6-10)% to Fire Resistance',
  ])
  const value = { ...project(), operations: [sovereign] }
  expect(parseCraftProject(JSON.stringify(value), catalog).ok).toBe(false)
  expect(
    parseCraftProject(
      JSON.stringify({ ...value, scalabilitySourceHash: statScalabilitySourceHash(catalog) }),
      catalog,
    ).ok,
  ).toBe(true)
  expect(
    parseCraftProject(
      JSON.stringify({
        ...value,
        operations: [],
        initialState: state,
        scalabilitySourceHash: statScalabilitySourceHash(catalog),
      }),
      catalog,
    ).ok,
  ).toBe(true)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s 合金工艺与武器增效文本完整回读', (locale) => {
  const applied = applyCraftStep(catalog, initial, operation)
  if (!applied.ok) throw Error(applied.error)
  const importedRing = imported(applied.value, locale)
  expect(importedRing.affixes).toEqual(applied.value.affixes)
  const weapon: CraftState = {
    baseId: 'Bandit Mace',
    itemLevel: 86,
    rarity: 'rare',
    quality: 20,
    sourceText: null,
    sockets: ['pob2:augment:["Iron Rune","weapon"]'],
    affixes: [
      {
        modId: 'AlloyEffectOfSocketedAugments1',
        crafted: true,
        lines: ['25(20-30)% increased effect of Socketed Augment Items'],
      },
    ],
  }
  const importedWeapon = imported(weapon, locale)
  expect(importedWeapon.affixes).toEqual(weapon.affixes)
  expect(importedWeapon.runeSourceLines).toEqual(['20% increased Physical Damage'])
})
