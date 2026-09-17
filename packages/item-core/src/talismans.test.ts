import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { prepareAlloyCraft } from './alloyCraft'
import { required } from './beltTestFixture'
import { prepareDesecration } from './boneCraft'
import { catalog as primary } from './catalystTestFixture'
import { corruptionCandidates } from './corruptionEnchantments'
import { applyCraftStep } from './craftSteps'
import { prepareEssenceCraft } from './essenceCraft'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { artificerSocketLimit, socketCandidates, socketCapacity } from './sockets'
import { isBasicTalismanBase, isBasicTalismanBaseId } from './talismans'
import { weaponSocketKind } from './weaponRuneEffects'
import { estimateWeaponStats } from './weaponStats'

const catalog = {
  ...primary,
  alloys: JSON.parse(
    readFileSync(new URL('../../../data/craft/alloys.json', import.meta.url), 'utf8'),
  ),
}
function start(baseId = 'Changeling Talisman'): CraftState {
  return { baseId, rarity: 'normal', itemLevel: 86, sourceText: null, affixes: [] }
}
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
const strength = { modId: 'Strength1', lines: ['+8 to Strength'] }
const rare = (): CraftState => ({ ...start(), rarity: 'rare', affixes: [strength] })

it('只接受25普通魔符，拒绝6隐藏锻造身份与伪造标签和字段', () => {
  const bases = catalog.bases.filter((b) => b.type === 'Talisman')
  expect(bases).toHaveLength(31)
  expect(bases.filter((b) => !b.hidden && !b.runeforged)).toHaveLength(25)
  for (const base of bases) {
    expect(isBasicTalismanBaseId(base.id)).toBe(!base.hidden && !base.runeforged)
    const result = createCraftState(catalog, start(base.id))
    expect(result.ok, base.id).toBe(!base.hidden && !base.runeforged)
    if (result.ok) {
      expect(isBasicTalismanBase({ ...base, tags: [...base.tags].reverse() })).toBe(true)
      expect(result.value.quality).toBeUndefined()
      expect(result.value.sockets).toBeUndefined()
      for (const patch of [
        { tags: [...base.tags, 'staff'] },
        { tags: base.tags.filter((t) => t !== 'twohand') },
        { name: 'Unknown Talisman' },
        { id: 'Unknown Talisman' },
        { variantList: ['Bear'] },
        { grantedSkillsHaveNoReservation: true },
        { properties: { ...base.properties, AttackRateBase: 99 } },
        { implicit: 'Grants Level 20 Skill: Bear Form' },
      ]) {
        const changed = { ...base, ...patch }
        expect(weaponSocketKind(changed)).toBeNull()
        expect(createCraftState({ ...catalog, bases: [changed] }, start(changed.id)).ok).toBe(false)
      }
    }
  }
})

it('魔符沿普通武器蜕变增幅富豪与神圣剥离，保留实例及正常稀有度', () => {
  const magic = must(
    applyCraftStep(catalog, start(), {
      currency: 'transmutation',
      modIds: ['LocalAddedPhysicalDamageTwoHand1'],
    }),
  )
  const full = must(
    applyCraftStep(catalog, magic, { currency: 'augmentation', modIds: ['Strength1'] }),
  )
  const upgraded = must(
    applyCraftStep(catalog, full, { currency: 'regal', modIds: ['LocalIncreasedAttackSpeed1'] }),
  )
  expect(upgraded.rarity).toBe('rare')
  expect(upgraded.affixes).toHaveLength(3)
  expect(
    applyCraftStep(catalog, upgraded, {
      currency: 'divine',
      modIds: [],
      rolls: [
        { modId: 'LocalAddedPhysicalDamageTwoHand1', values: [2, 5] },
        { modId: 'Strength1', values: [8] },
        { modId: 'LocalIncreasedAttackSpeed1', values: [7] },
      ],
    }).ok,
  ).toBe(true)
  const removed = must(
    applyCraftStep(catalog, upgraded, {
      currency: 'annulment',
      modIds: [],
      removeModId: 'Strength1',
    }),
  )
  expect(removed.rarity).toBe('rare')
  expect(removed.affixes).toHaveLength(2)
})

it.each(['Ashbark Talisman', 'Cinderbark Talisman', 'Thunder Talisman', 'Voltfang Talisman'])(
  '%s 本件面板保留源整数元素伤害，品质只作用物理伤害',
  (baseId) => {
    const state = { ...start(baseId), quality: 0, sockets: [] }
    const panel = must(estimateWeaponStats(catalog, state))
    const base = required(catalog.bases.find((b) => b.id === baseId))
    const type = base.properties.FireMin === undefined ? 'Lightning' : 'Fire'
    expect(panel.damage[type].min).toBe(base.properties[`${type}Min`])
    expect(panel.damage[type].max).toBe(base.properties[`${type}Max`])
    const quality = must(estimateWeaponStats(catalog, { ...state, quality: 20 }))
    expect(quality.damage[type]).toEqual(panel.damage[type])
    expect(quality.physicalDps).toBeGreaterThan(panel.physicalDps)
  },
)

it('双手巧匠2已有3腐化4；支持普通武器符文，四种专属非本地增幅保持拒绝', () => {
  const state = { ...start(), sockets: [] }
  expect(artificerSocketLimit(catalog, state)).toBe(2)
  expect(socketCapacity(catalog, state)).toBe(3)
  expect(socketCapacity(catalog, { ...state, corrupted: true })).toBe(4)
  const socketed = must(applyCraftStep(catalog, state, { kind: 'artificer' }))
  const candidates = socketCandidates(catalog, socketed)
  const iron = required(candidates.find((a) => a.name === 'Iron Rune' && a.category === 'weapon'))
  expect(iron).toBeDefined()
  expect(createCraftState(catalog, { ...socketed, sockets: [iron.id] }).ok).toBe(true)
  const specialized = required(catalog.augments).filter((a) => a.category === 'talisman')
  expect(specialized).toHaveLength(4)
  for (const augment of specialized) {
    expect(augment.localMod).toBe(false)
    expect(candidates.some((a) => a.id === augment.id)).toBe(false)
    expect(createCraftState(catalog, { ...socketed, sockets: [augment.id] }).ok).toBe(false)
  }
})

it('27精华真实映射可准备，3个Infinite显示占位继续拒绝', () => {
  const essences = required(catalog.essences).filter((e) => e.mods.Talisman !== undefined)
  expect(essences).toHaveLength(30)
  for (const essence of essences) {
    const state = {
      ...rare(),
      rarity: essence.name.startsWith('Perfect') ? ('rare' as const) : ('magic' as const),
    }
    const result = prepareEssenceCraft(catalog, state, essence.id)
    expect(result.ok, essence.name).toBe(!essence.name.includes('Infinite'))
  }
})

it('武器颚骨与6合金映射及腐化属性沿已有来源规则接通', () => {
  expect(prepareDesecration(catalog, rare(), 'ancient_jawbone').ok).toBe(true)
  expect(prepareDesecration(catalog, rare(), 'ancient_rib').ok).toBe(false)
  const alloys = catalog.alloys.alloys.filter((a: { mappings: { category: string }[] }) =>
    a.mappings.some((m) => m.category === 'Talisman'),
  )
  expect(alloys).toHaveLength(6)
  for (const alloy of alloys)
    expect(prepareAlloyCraft(catalog, rare(), alloy.id).ok, alloy.name).toBe(true)
  expect(corruptionCandidates(catalog, rare())).toHaveLength(9)
  const corrupted = must(applyCraftStep(catalog, rare(), { kind: 'vaal', outcome: 'unchanged' }))
  expect(corrupted.corrupted).toBe(true)
})

it('形态不虚构为装备等级或辅助孔状态和动作', () => {
  const state = must(createCraftState(catalog, start()))
  expect(createCraftState(catalog, { ...state, declaredSkillLevel: 13 }).ok).toBe(false)
  expect(createCraftState(catalog, { ...state, declaredSkillSockets: 2 }).ok).toBe(false)
  expect(
    applyCraftStep(catalog, state, { kind: 'skill-sockets', tier: 'lesser', previousSockets: 2 })
      .ok,
  ).toBe(false)
  expect(applyCraftStep(catalog, state, { kind: 'perfect-flux', previousMaxLevel: 13 }).ok).toBe(
    false,
  )
})
