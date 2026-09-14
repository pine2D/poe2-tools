import { expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import type { CraftState } from './rehearsal'
import { runeSocketContributionError } from './runeImport'
import { socketCandidates, socketEffects } from './sockets'
import { isSupportedWeaponRune, parseWeaponRuneEffectTotals } from './weaponRuneEffects'
import { estimateWeaponStats } from './weaponStats'

const id = (name: string, category = 'weapon') => `pob2:augment:${JSON.stringify([name, category])}`
const state = (baseId = 'Crude Bow'): CraftState => ({
  baseId,
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  sockets: [null],
  sourceText: null,
  quality: 20,
})
it('固定目录135条武器分支可镶入，精确类别、本地标志与空效果不混用', () => {
  for (const [baseId, category, count] of [
    ['Crude Bow', 'weapon', 55],
    ['Attuned Wand', 'wand', 40],
    ['Ashen Staff', 'staff', 40],
  ] as const) {
    const initial = state(baseId)
    const choices = socketCandidates(catalog, initial)
    expect(choices).toHaveLength(count)
    for (const augment of choices) {
      const result = applyCraftStep(catalog, initial, {
        kind: 'socket',
        socketIndex: 0,
        augmentId: augment.id,
      })
      if (!result.ok) throw Error(result.error)
      expect(socketEffects(catalog, result.value)[0]?.augment.lines).toEqual(augment.lines)
      expect(isSupportedWeaponRune({ ...augment, localMod: !augment.localMod }, category)).toBe(
        false,
      )
      expect(isSupportedWeaponRune({ ...augment, limit: 1 }, category)).toBe(false)
    }
    expect(choices.some((a) => a.name === 'Perfect Tempered Rune')).toBe(false)
    if (category !== 'weapon')
      expect(choices.some((a) => /Robust|Adept|Resolve/.test(a.name))).toBe(false)
  }
})
it('全部效果按语义求和，类别混用、负值、小数、零值和溢出拒绝', () => {
  expect(
    parseWeaponRuneEffectTotals(
      [
        'Leeches 4% of Physical Damage as Life',
        'Leeches 3% of Physical Damage as Mana',
        'Gain 25 Life per enemy killed',
        'Gain 20 Mana per enemy killed',
        'Causes 30% increased Stun Buildup',
        '+90 to Accuracy Rating',
        '+9 to Strength',
        '+9 to Dexterity',
        '+9 to Intelligence',
        'Adds 6 to 9 Physical Damage',
      ],
      'weapon',
    ),
  ).toMatchObject({
    LifeLeech: 4,
    ManaLeech: 3,
    LifeOnKill: 25,
    ManaOnKill: 20,
    StunBuildup: 30,
    Accuracy: 90,
    Strength: 9,
    Dexterity: 9,
    Intelligence: 9,
    PhysicalMin: 6,
    PhysicalMax: 9,
  })
  expect(
    parseWeaponRuneEffectTotals(
      [
        '+40 to maximum Energy Shield',
        '+60 to maximum Mana',
        '8% increased Energy Shield Recharge Rate',
        '25% increased Mana Regeneration Rate',
        'Gain additional Stun Threshold equal to 12% of maximum Energy Shield',
        '20% increased Critical Hit Chance for Spells',
      ],
      'wand',
    ),
  ).toMatchObject({
    EnergyShield: 40,
    Mana: 60,
    EnergyShieldRecharge: 8,
    ManaRegeneration: 25,
    EnergyShieldStunThreshold: 12,
    SpellCritical: 20,
  })
  for (const lines of [
    ['+9 to Strength', '+40 to maximum Energy Shield'],
    ['Leeches 1.5% of Physical Damage as Life'],
    ['Gain 0 Mana per enemy killed'],
    ['Adds 9 to 6 Physical Damage'],
    ['+9007199254740991 to Strength', '+1 to Strength'],
  ])
    expect(parseWeaponRuneEffectTotals(lines)).toBeNull()
  expect(parseWeaponRuneEffectTotals(['+40 to maximum Energy Shield'], 'weapon')).toBeNull()
})
it('物理点伤进入品质与钢铁乘算，吸取和属性不虚增武器DPS', () => {
  const current = { ...state(), sockets: [id('Tempered Rune'), id('Iron Rune')] }
  const result = estimateWeaponStats(catalog, current)
  if (!result.ok) throw Error(result.error)
  const base = catalog.bases.find((b) => b.id === current.baseId)
  if (!base) throw Error('缺少基底')
  expect(result.value.damage.Physical.runeMin).toBe(6)
  expect(result.value.damage.Physical.runeMax).toBe(9)
  expect(result.value.damage.Physical.min).toBe(
    Math.round(((base.properties.PhysicalMin ?? 0) + 6) * 1.16 * 1.2),
  )
  expect(result.value.damage.Physical.max).toBe(
    Math.round(((base.properties.PhysicalMax ?? 0) + 9) * 1.16 * 1.2),
  )
  const plain = estimateWeaponStats(catalog, state())
  expect(
    estimateWeaponStats(catalog, { ...state(), sockets: [id('Body Rune'), id('Robust Rune')] }),
  ).toEqual(plain)
})
it('新增吸取和基础属性都参与导入总贡献，不能只对上伤害', () => {
  const current = {
    ...state(),
    sockets: [id('Body Rune')],
    runeSourceLines: ['Leeches 4% of Physical Damage as Life'],
  }
  expect(runeSocketContributionError(catalog, current)).toBeNull()
  expect(
    runeSocketContributionError(catalog, {
      ...current,
      runeSourceLines: ['Leeches 5% of Physical Damage as Life'],
    }),
  ).not.toBeNull()
})
