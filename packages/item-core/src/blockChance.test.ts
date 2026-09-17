import { expect, it } from 'vitest'
import { estimateBlockChance } from './blockChance'
import { catalog } from './catalystTestFixture'
import type { CraftState } from './rehearsal'

const ox = 'pob2:augment:["Ox Idol","shield"]'
const state = (): CraftState => ({
  baseId: 'Aged Tower Shield',
  rarity: 'rare',
  itemLevel: 86,
  sourceText: null,
  quality: 0,
  sockets: [ox, null],
  affixes: [],
})
it('本地显式与Ox加算后向下取整，品质与条件Silk不参与', () => {
  const s = {
    ...state(),
    affixes: [{ modId: 'LocalBlockChance3', lines: ['30% increased Block chance'] }],
  }
  for (const quality of [0, 20, 30])
    expect(estimateBlockChance(catalog, { ...s, quality })).toEqual({
      ok: true,
      value: { base: 26, increased: 45, runeIncreased: 15, value: 37 },
    })
  expect(
    estimateBlockChance(catalog, { ...s, sockets: [ox, 'pob2:augment:["Idol of Silk","shield"]'] }),
  ).toEqual(estimateBlockChance(catalog, s))
  expect(estimateBlockChance(catalog, { ...state(), sockets: [null, null] })).toEqual({
    ok: true,
    value: { base: 26, increased: 0, runeIncreased: 0, value: 26 },
  })
})
it('圆盾三Ox保持整数29，不受浮点误差与角色上限影响', () => {
  const id = 'pob2:augment:["Ox Idol","buckler"]'
  expect(
    estimateBlockChance(catalog, {
      ...state(),
      baseId: 'Aegis Buckler',
      corrupted: true,
      sockets: [id, id, id],
    }),
  ).toEqual({ ok: true, value: { base: 20, increased: 45, runeIncreased: 45, value: 29 } })
})
it('未知孔、未知特殊格挡与非盾不静默估算', () => {
  const { sockets: _sockets, ...unknownSockets } = state()
  expect(estimateBlockChance(catalog, unknownSockets).ok).toBe(false)
  expect(estimateBlockChance(catalog, { ...state(), baseId: 'Twig Focus', sockets: [] }).ok).toBe(
    false,
  )
  const s = {
    ...state(),
    affixes: [{ modId: 'LocalBlockChance3', lines: ['30% increased Block chance'] }],
  }
  const forged = {
    ...catalog,
    modifiers: catalog.modifiers.map((m) =>
      m.id === 'LocalBlockChance3' ? { ...m, group: 'LocalSpecialBlock' } : m,
    ),
  }
  expect(estimateBlockChance(forged, s).ok).toBe(false)
  const base = catalog.bases.find((b) => b.id === s.baseId)
  if (!base) throw Error('missing base')
  expect(
    estimateBlockChance(
      {
        ...catalog,
        bases: catalog.bases.map((b) =>
          b.id === base.id ? { ...b, implicit: '50% more Block chance' } : b,
        ),
      },
      s,
    ).ok,
  ).toBe(false)
})
it('腐化本地格挡参与同一加算，人物最大格挡不参与', () => {
  expect(
    estimateBlockChance(catalog, {
      ...state(),
      corrupted: true,
      corruption: { modId: 'CorruptionLocalBlockChance1', lines: ['15% increased Block chance'] },
    }),
  ).toEqual({ ok: true, value: { base: 26, increased: 30, runeIncreased: 15, value: 33 } })
  expect(
    estimateBlockChance(catalog, {
      ...state(),
      corrupted: true,
      corruption: {
        modId: 'CorruptionMaximumBlockChance1',
        lines: ['+3% to maximum Block chance'],
      },
    }),
  ).toEqual(estimateBlockChance(catalog, state()))
})
