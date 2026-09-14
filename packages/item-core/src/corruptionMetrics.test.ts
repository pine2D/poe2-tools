import { expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import { estimateDefences } from './defences'
import type { CraftState } from './rehearsal'
import { estimateWeaponStats } from './weaponStats'

const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw Error(r.error)
  return r.value
}
it('武器腐化平值、物理百分比和攻速计入面板，保留独立贡献', () => {
  const initial: CraftState = {
    baseId: 'Crude Bow',
    itemLevel: 86,
    rarity: 'normal',
    sourceText: null,
    quality: 0,
    sockets: [],
    affixes: [],
  }
  const before = must(estimateWeaponStats(catalog, initial))
  const apply = (modId: string, values: number[]) =>
    must(
      estimateWeaponStats(
        catalog,
        must(applyCraftStep(catalog, initial, { kind: 'vaal', outcome: 'enchant', modId, values })),
      ),
    )
  const chaos = apply('CorruptionLocalAddedChaosDamage1', [7, 12])
  expect(chaos.damage.Chaos).toMatchObject({
    min: 7,
    max: 12,
    affixMin: 0,
    corruptionMin: 7,
    corruptionMax: 12,
  })
  expect(chaos.chaosDps).toBe(9.5 * before.attackSpeed.value)
  const phys = apply('CorruptionLocalIncreasedPhysicalDamagePercent1', [20])
  expect(phys.damage.Physical.affixIncreased).toBe(0)
  expect(phys.damage.Physical.corruptionIncreased).toBe(20)
  expect(phys.damage.Physical.max).toBe(Math.round(before.damage.Physical.max * 1.2))
  const speed = apply('CorruptionLocalIncreasedAttackSpeed1', [8])
  expect(speed.attackSpeed.value).toBe(Math.round(before.attackSpeed.base * 108) / 100)
})
it('本地腐化防御与普通词缀同组分别累计', () => {
  const base = catalog.bases.find(
    (b) =>
      b.type === 'Helmet' &&
      b.tags.includes('str_armour') &&
      !b.hidden &&
      !b.runeforged &&
      !b.variantList &&
      !b.implicit,
  )
  if (!base) throw Error('缺少护甲头盔')
  const initial: CraftState = {
    baseId: base.id,
    itemLevel: 86,
    rarity: 'normal',
    sourceText: null,
    quality: 20,
    sockets: [],
    affixes: [],
  }
  const state = must(
    applyCraftStep(catalog, initial, {
      kind: 'vaal',
      outcome: 'enchant',
      modId: 'CorruptionLocalIncreasedPhysicalDamageReductionRatingPercent1',
      values: [25],
    }),
  )
  const result = must(estimateDefences(catalog, state)).find((v) => v.stat === 'Armour')
  expect(result).toMatchObject({
    increased: 25,
    value: Math.floor((base.properties.Armour ?? 0) * 1.25 * 1.2 + 0.5),
  })
})
