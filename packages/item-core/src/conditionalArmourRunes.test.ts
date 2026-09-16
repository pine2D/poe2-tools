import { expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { socketLimitWarnings } from './conditionalArmourRunes'
import { collectCraftCosts } from './craftCosts'
import { applyCraftStep } from './craftSteps'
import { estimateDefences } from './defences'
import { type CraftState, createCraftState } from './rehearsal'
import { runeSocketContributionError } from './runeImport'
import { effectiveSocketAugment } from './socketAmplification'
import { socketCandidates, socketEffects } from './sockets'

const names = ['Warding Rune of Protection', 'Warding Rune of Nourishment'] as const
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
const initial: CraftState = {
  baseId: 'Adherent Cuffs',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  sockets: [null, null],
  quality: 20,
  sourceText: null,
}
const lines: [string, string] = [
  'Every 4 seconds, gain Guard equal to 20% of maximum Runic Ward for 2 seconds',
  '15% Life Recovery from Flasks also applies to Runic Ward',
]
const scaled: [string, string] = [
  'Every 4 seconds, gain Guard equal to 32% of maximum Runic Ward for 2 seconds',
  '24% Life Recovery from Flasks also applies to Runic Ward',
]
it.each(names)('%s 单枚镶嵌、覆盖、费用与非本地面板', (name) => {
  const operation = { kind: 'socket' as const, socketIndex: 0, augmentId: id(name) }
  expect(socketCandidates(catalog, initial).some((a) => a.id === id(name))).toBe(true)
  const r = applyCraftStep(catalog, initial, operation)
  if (!r.ok) throw Error(r.error)
  expect(socketEffects(catalog, r.value)[0]?.augment.lines).toEqual([lines[names.indexOf(name)]])
  expect(estimateDefences(catalog, r.value)).toEqual(estimateDefences(catalog, initial))
  expect(collectCraftCosts(catalog, [operation])).toEqual({
    ok: true,
    value: [{ id: `augment:${name}`, name, count: 1 }],
  })
  expect(socketLimitWarnings(catalog, r.value)).toEqual([
    { name, limit: 1, count: 1, exceeded: false },
  ])
  const duplicate = applyCraftStep(catalog, r.value, { ...operation, socketIndex: 1 })
  expect(duplicate).toMatchObject({ ok: false, error: expect.stringContaining('重复镶入') })
  const same = applyCraftStep(catalog, r.value, operation)
  expect(same.ok).toBe(true)
  expect(initial.sockets).toEqual([null, null])
})
it('已有重复不丢孔，来源逐项核对，替换可修复限量', () => {
  const duplicate = { ...initial, sockets: [id(names[0]), id(names[0])] }
  expect(createCraftState(catalog, duplicate).ok).toBe(true)
  expect(socketLimitWarnings(catalog, duplicate)).toEqual([
    { name: names[0], limit: 1, count: 2, exceeded: true },
  ])
  expect(
    runeSocketContributionError(catalog, { ...duplicate, runeSourceLines: [lines[0], lines[0]] }),
  ).toBeNull()
  expect(
    runeSocketContributionError(catalog, { ...duplicate, runeSourceLines: [lines[0]] }),
  ).not.toBeNull()
  const repaired = applyCraftStep(catalog, duplicate, {
    kind: 'socket',
    socketIndex: 1,
    augmentId: id(names[1]),
  })
  if (!repaired.ok) throw Error(repaired.error)
  expect(socketLimitWarnings(catalog, repaired.value).every((w) => !w.exceeded)).toBe(true)
})
it('恐惧只增强比例，周期固定，来源不能遗漏、替换时间或混淆效果', () => {
  const state: CraftState = {
    ...initial,
    rarity: 'rare',
    affixes: [
      {
        modId: 'EssenceLocalRuneAndSoulCoreEffect1',
        crafted: true,
        lines: ['60% increased effect of Socketed Augment Items'],
      },
    ],
    sockets: names.map(id),
  }
  expect(createCraftState(catalog, state).ok).toBe(true)
  expect(socketEffects(catalog, state).flatMap((s) => s.augment.lines)).toEqual(scaled)
  expect(runeSocketContributionError(catalog, { ...state, runeSourceLines: scaled })).toBeNull()
  for (const wrong of [
    [scaled[0].replace('4 seconds', '6 seconds'), scaled[1]],
    lines,
    [scaled[0], scaled[0]],
  ])
    expect(
      runeSocketContributionError(catalog, { ...state, runeSourceLines: wrong }),
    ).not.toBeNull()
  expect(socketEffects(catalog, { ...state, affixes: [] }).flatMap((s) => s.augment.lines)).toEqual(
    lines,
  )
  const bad = structuredClone(catalog)
  if (!bad.scalability) throw Error('缺少缩放目录')
  bad.scalability[lines[0]] = [
    { scalable: true, formats: [] },
    { scalable: true, formats: [] },
    { scalable: true, formats: [] },
  ]
  const augment = bad.augments?.find((a) => a.id === id(names[0]))
  if (!augment) throw Error('缺少符文')
  expect(effectiveSocketAugment(bad, state, augment)).toBeNull()
})

import { isConditionalArmourRune } from './conditionalArmourRunes'
import { exportCraftItemText } from './craftItemText'
import { prepareExtractionCraft } from './extraction'

it('身份、类别、限量和完整行不能仅凭效果文字放行', () => {
  const augment = catalog.augments?.find((a) => a.id === id(names[0]))
  if (!augment) throw Error('缺少符文')
  for (const patch of [
    { name: 'Unknown' },
    { category: 'weapon' },
    { type: 'Soul Core' },
    { localMod: true },
    { limit: 2 },
    { limit: undefined },
    { limitId: 'AncientAugment' },
    { isSocketBound: true },
    { lines: [...augment.lines, '8% increased Guard gained'] },
  ])
    expect(isConditionalArmourRune({ ...augment, ...patch } as typeof augment)).toBe(false)
  expect(
    prepareExtractionCraft(catalog, { ...initial, sockets: [id(names[0]), id(names[0])] }),
  ).toMatchObject({
    ok: true,
    value: { returns: [{ augmentId: id(names[0]), count: 2, socketIndices: [0, 1] }] },
  })
})

it('文本出口保留限量与角色效果边界，超限导入不会伪装成可穿戴', () => {
  const result = exportCraftItemText(
    catalog,
    { ...initial, sockets: [id(names[0]), id(names[0])] },
    { locale: 'en' },
  )
  if (!result.ok) throw Error(result.error)
  expect(result.value.warnings.join(' ')).toContain('本件已超限')
  expect(result.value.warnings.join(' ')).toContain('其他装备与角色孔尚未核对')
})
