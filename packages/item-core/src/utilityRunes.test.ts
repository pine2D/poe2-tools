import { expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import { estimateDefences } from './defences'
import type { CraftState } from './rehearsal'
import { isSupportedArmourRune, parseRuneEffectTotals } from './runeEffects'
import { runeSocketContributionError } from './runeImport'
import { socketCandidates, socketEffects } from './sockets'

const families = ['Body', 'Mind', 'Inspiration', 'Stone', 'Vision', 'Robust', 'Adept', 'Resolve']
const tiers = ['Lesser ', '', 'Greater ', 'Perfect ']
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
const state = (baseId = 'Rusted Greathelm'): CraftState => ({
  baseId,
  itemLevel: 1,
  rarity: 'normal',
  affixes: [],
  sockets: [null],
  sourceText: null,
  quality: 0,
})

it('八族四档防具符文可镶入与覆盖，物等不冒充穿戴需求', () => {
  const initial = state()
  const choices = socketCandidates(catalog, initial).filter((a) => a.type === 'Rune')
  expect(choices).toHaveLength(55)
  for (const family of families)
    for (const tier of tiers) {
      const augmentId = id(`${tier}${family} Rune`)
      const augment = choices.find((entry) => entry.id === augmentId)
      expect(augment).toBeDefined()
      const result = applyCraftStep(catalog, initial, { kind: 'socket', socketIndex: 0, augmentId })
      if (!result.ok) throw Error(result.error)
      expect(socketEffects(catalog, result.value)[0]?.augment.lines).toEqual(augment?.lines)
      expect(result.value.affixes).toEqual(initial.affixes)
      const replaced = applyCraftStep(catalog, result.value, {
        kind: 'socket',
        socketIndex: 0,
        augmentId: id('Desert Rune'),
      })
      if (!replaced.ok) throw Error(replaced.error)
      expect(socketEffects(catalog, replaced.value).map((entry) => entry.augment.lines)).toEqual([
        ['+14% to Fire Resistance'],
      ])
    }
  expect(initial.sockets).toEqual([null])
})

it('完整整数效果按独立语义求和，生命和属性不被误计为本地防御', () => {
  expect(
    parseRuneEffectTotals([
      '+45 to maximum Life',
      '+30 to maximum Life',
      '+30 to maximum Mana',
      '15% increased Mana Regeneration Rate',
      '+75 to Stun Threshold',
      '12% increased Life and Mana Recovery from Flasks',
      '+9 to Strength',
      '+9 to Dexterity',
      '+9 to Intelligence',
    ]),
  ).toMatchObject({
    Life: 75,
    Mana: 30,
    ManaRegeneration: 15,
    StunThreshold: 75,
    FlaskRecovery: 12,
    Strength: 9,
    Dexterity: 9,
    Intelligence: 9,
    Defences: 0,
  })
  const before = estimateDefences(catalog, state())
  const after = estimateDefences(catalog, { ...state(), sockets: [id('Body Rune')] })
  expect(after).toEqual(before)
  for (const line of [
    '+0 to maximum Life',
    '+1.5 to maximum Life',
    '+9007199254740992 to Strength',
    'Regenerate 0.4% of maximum Life per second',
  ])
    expect(parseRuneEffectTotals([line])).toBeNull()
})

it('身份、完整效果及限制必须一致，不能因名字放行绑定或特殊符文', () => {
  const augment = catalog.augments?.find((entry) => entry.id === id('Body Rune'))
  if (!augment) throw Error('缺少来源')
  for (const patch of [
    { category: 'weapon' },
    { localMod: true },
    { limit: 1 },
    { limitId: 'shared' },
    { isSocketBound: true },
    { lines: ['+45 to maximum Life', '+1 to Strength'] },
    { lines: ['+45 to maximum Mana'] },
  ])
    expect(isSupportedArmourRune({ ...augment, ...patch })).toBe(false)
  const weapon = socketCandidates(catalog, { ...state('Crude Bow'), sockets: [null] })
  expect(weapon.length).toBeGreaterThan(0)
  expect(weapon.every((entry) => entry.category === 'weapon')).toBe(true)
  expect(weapon.some((entry) => families.some((family) => entry.id === id(`${family} Rune`)))).toBe(
    false,
  )
})

it('导入总贡献按全部新属性核对，不允许只对上旧三抗', () => {
  const current = {
    ...state(),
    sockets: [id('Body Rune')],
    runeSourceLines: ['+45 to maximum Life'],
  }
  expect(runeSocketContributionError(catalog, current)).toBeNull()
  const error = runeSocketContributionError(catalog, {
    ...current,
    runeSourceLines: ['+46 to maximum Life'],
  })
  expect(error).toContain('生命')
  expect(error).toContain('46')
  expect(error).toContain('45')
})

it('八族逐枚接受恐惧精华整数增效，移除工艺后恢复原贡献', () => {
  const expected = [
    '+120 to maximum Life',
    '+80 to maximum Mana',
    '33% increased Mana Regeneration Rate',
    '+200 to Stun Threshold',
    '32% increased Life and Mana Recovery from Flasks',
    '+24 to Strength',
    '+24 to Dexterity',
    '+24 to Intelligence',
  ]
  for (const [index, family] of families.entries()) {
    const initial: CraftState = {
      ...state('Adherent Cuffs'),
      itemLevel: 86,
      rarity: 'rare',
      affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }],
      sockets: [id(`Perfect ${family} Rune`)],
    }
    const result = applyCraftStep(catalog, initial, {
      kind: 'essence',
      essenceId: 'Metadata/Items/Currency/CurrencyCorruptedEssenceHorror',
      removeModId: 'IncreasedLife1',
      values: [],
    })
    if (!result.ok) throw Error(result.error)
    expect(socketEffects(catalog, result.value)[0]?.augment.lines).toEqual([expected[index]])
    const removed = applyCraftStep(catalog, result.value, {
      currency: 'annulment',
      modIds: [],
      removeModId: 'EssenceLocalRuneAndSoulCoreEffect1',
    })
    if (!removed.ok) throw Error(removed.error)
    expect(socketEffects(catalog, removed.value)).toEqual(socketEffects(catalog, initial))
  }
})
