import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { alloyTestFixture } from './alloyTestFixture'
import type { CraftCatalog } from './catalog'
import { estimateCatalystEffects } from './catalystEffects'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { projectCraftTargetValues } from './effectiveTargetValues'
import { estimateCraftAffixEffects } from './jewelEffects'
import { type CraftState, createCraftState } from './rehearsal'
import { estimateResistances } from './resistances'
import { runeSocketContributionError } from './runeImport'
import { socketEffects } from './sockets'
import { estimateWeaponStats } from './weaponStats'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('缺少测试记录')
  return value
}

const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog = { ...primary, alloys: alloyTestFixture() }
const resistanceId = 'AlloyEffectOfResistanceMods1'
const socketId = 'AlloyEffectOfSocketedAugments1'
const material = 'Metadata/Items/Currency/CurrencyVerisiumAlloy9'
const state: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  catalyst: { id: "Xoph's", quality: 20 },
  affixes: [
    {
      modId: resistanceId,
      crafted: true,
      lines: ['25(20-30)% increased Explicit Resistance Modifier magnitudes'],
    },
    { modId: 'FireResist1', fractured: true, lines: ['+9(6-10)% to Fire Resistance'] },
    { modId: 'IncreasedLife1', lines: ['+19(10-19) to maximum Life'] },
  ],
}

it('君王武器增效进入真实物理面板，原文来源按增效后符文核对', () => {
  const weapon: CraftState = {
    baseId: 'Bandit Mace',
    itemLevel: 86,
    rarity: 'rare',
    quality: 20,
    sourceText: null,
    sockets: ['pob2:augment:["Iron Rune","weapon"]'],
    affixes: [
      {
        modId: socketId,
        crafted: true,
        lines: ['25(20-30)% increased effect of Socketed Augment Items'],
      },
    ],
  }
  expect(estimateWeaponStats(catalog, weapon)).toMatchObject({
    ok: true,
    value: { damage: { Physical: { runeIncreased: 20, min: 65, max: 88 } }, physicalDps: 110.925 },
  })
  expect(
    runeSocketContributionError(catalog, {
      ...weapon,
      runeSourceLines: ['20% increased Physical Damage'],
    }),
  ).toBeNull()
  expect(
    runeSocketContributionError(catalog, {
      ...weapon,
      runeSourceLines: ['16% increased Physical Damage'],
    }),
  ).not.toBeNull()
})

it('君王显式抗性与品质相加一次，破裂基础值、非抗性与固有属性不变', () => {
  expect(createCraftState(catalog, state).ok).toBe(true)
  expect(estimateResistances(catalog, state).fireResistance).toEqual({ ok: true, value: 13 })
  expect(estimateCraftAffixEffects(catalog, state)).toMatchObject({
    ok: true,
    value: {
      groups: [
        { percent: 0 },
        { percent: 45, lines: [{ after: '+13% to Fire Resistance' }] },
        { percent: 0, lines: [{ after: '+19(10-19) to maximum Life' }] },
      ],
    },
  })
  const fire = catalog.modifiers.find((m) => m.id === 'FireResist1')
  if (!fire) throw Error('缺少抗性目录')
  const projected = projectCraftTargetValues(catalog, state, fire, {
    modId: fire.id,
    basis: 'effective',
    bounds: [{ index: 0, min: 13 }],
  })
  expect(projected).toMatchObject({ ok: true, value: { ranges: [{ min: 8, max: 14 }] } })
  expect(estimateCatalystEffects(catalog, state, "Xoph's", 20)).toMatchObject({
    ok: true,
    value: { groups: [{}, {}, { lines: [{ after: '+13% to Fire Resistance' }] }, {}] },
  })
  const exported = exportCraftItemText(catalog, state)
  if (!exported.ok) throw Error(exported.error)
  expect(exported.value.text).toContain('45% Increased')
  expect(exported.value.text).toContain('+9(6-10)% to Fire Resistance (fractured)')
  const removed = applyCraftStep(catalog, state, {
    currency: 'annulment',
    modIds: [],
    removeModId: resistanceId,
  })
  if (!removed.ok) throw Error(removed.error)
  expect(estimateResistances(catalog, removed.value).fireResistance).toEqual({
    ok: true,
    value: 10,
  })
  expect(removed.value.affixes[0]).toEqual(state.affixes[1])
})

it('未知君王掷值只使受影响抗性未知，伪造身份与缺失关系不能放行', () => {
  const unknown = structuredClone(state)
  required(unknown.affixes[0]).lines = [
    '(20-30)% increased Explicit Resistance Modifier magnitudes',
  ]
  expect(createCraftState(catalog, unknown).ok).toBe(true)
  expect(estimateResistances(catalog, unknown).fireResistance.ok).toBe(false)
  expect(estimateCraftAffixEffects(catalog, unknown)).toMatchObject({
    ok: true,
    value: { groups: [{ percent: 0 }, { percent: null }, { percent: 0 }] },
  })
  expect(createCraftState(primary, state).ok).toBe(false)
  const forged = structuredClone(catalog)
  required(forged.modifiers.find((m) => m.id === resistanceId)).lines = [
    '(20-30)% increased Explicit Life Modifier magnitudes',
  ]
  expect(
    createCraftState(forged, {
      ...state,
      affixes: [
        {
          ...required(state.affixes[0]),
          lines: ['25(20-30)% increased Explicit Life Modifier magnitudes'],
        },
      ],
    }).ok,
  ).toBe(false)
})

it('已有武器符文的合金替换逐值向下取整，神圣改变倍率，移除后恢复', () => {
  const wand = catalog.bases.find(
    (b) => b.type === 'Wand' && !b.hidden && !b.runeforged && !b.variantList,
  )
  if (!wand) throw Error('缺少法杖')
  const initial: CraftState = {
    baseId: wand.id,
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    sockets: ['pob2:augment:["Lesser Desert Rune","wand"]'],
    affixes: [{ modId: 'IncreasedMana1', lines: ['+12(10-14) to maximum Mana'] }],
  }
  const original = socketEffects(catalog, initial).flatMap((e) => e.augment.lines)
  expect(original).toEqual(['Gain 6% of Damage as Extra Fire Damage'])
  const applied = applyCraftStep(catalog, initial, {
    kind: 'alloy',
    alloyId: material,
    removeModId: 'IncreasedMana1',
    values: [25],
  })
  if (!applied.ok) throw Error(applied.error)
  expect(socketEffects(catalog, applied.value).flatMap((e) => e.augment.lines)).toEqual([
    'Gain 7% of Damage as Extra Fire Damage',
  ])
  const removed = applyCraftStep(catalog, applied.value, {
    currency: 'annulment',
    modIds: [],
    removeModId: socketId,
  })
  if (!removed.ok) throw Error(removed.error)
  expect(socketEffects(catalog, removed.value).flatMap((e) => e.augment.lines)).toEqual(original)
  expect(primary.augments?.find((a) => a.id === initial.sockets?.[0])?.lines).toEqual(original)
})
