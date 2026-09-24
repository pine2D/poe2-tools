import { expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import { estimateDefences } from './defences'
import type { CraftState } from './rehearsal'
import { estimateResistances } from './resistances'
import { runeSocketContributionError } from './runeImport'
import { socketCandidates, socketEffects, socketStateError } from './sockets'
import { estimateWeaponStats } from './weaponStats'

const id = (name: string, category = 'weapon') =>
  `pob2:augment:${JSON.stringify([`Soul Core of ${name}`, category])}`
const state = (baseId = 'Crude Bow'): CraftState => ({
  baseId,
  itemLevel: 86,
  rarity: 'normal',
  quality: 20,
  affixes: [],
  sourceText: null,
  sockets: [null, null],
})
const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw Error(r.error)
  return r.value
}

it('十四条无特殊限制魂核分支可制作，施法类别及部位不混用', () => {
  const found = new Set<string>()
  for (const [baseId, count] of [
    ['Crude Bow', 7],
    ['Rusted Greathelm', 5],
    ['Adherent Cuffs', 6],
    ['Rawhide Boots', 6],
    ['Attuned Wand', 0],
    ['Ashen Staff', 0],
  ] as const) {
    const initial = state(baseId)
    // 施法魂核另有每件限量，此处只核对无限量基础分支的范围与身份。
    const cores = socketCandidates(catalog, initial).filter(
      (a) => a.type === 'SoulCore' && a.limit === undefined,
    )
    expect(cores).toHaveLength(count)
    for (const augment of cores) {
      found.add(augment.id)
      const next = must(
        applyCraftStep(catalog, initial, { kind: 'socket', socketIndex: 0, augmentId: augment.id }),
      )
      expect(socketEffects(catalog, next)[0]?.augment.lines).toEqual(augment.lines)
      for (const patch of [
        { limit: 1 },
        { limitId: 'AncientAugment' },
        { isSocketBound: true },
        { localMod: !augment.localMod },
        { lines: [...augment.lines, '+1 to Strength'] },
        { lines: ['1.5% increased Attack Speed'] },
      ]) {
        const changed = {
          ...catalog,
          augments: (catalog.augments ?? []).map((a) =>
            a.id === augment.id ? { ...a, ...patch } : a,
          ),
        }
        expect(socketStateError(changed, next)).not.toBeNull()
      }
    }
  }
  expect(found.size).toBe(14)
  expect(
    socketStateError(catalog, { ...state('Rusted Greathelm'), sockets: [id('Azcapa', 'gloves')] }),
  ).not.toBeNull()
})
it('抗性魂核逐项合计，恐惧逐枚取整，普通防御仍能估算', () => {
  const plain = {
    ...state('Adherent Cuffs'),
    rarity: 'rare' as const,
    sockets: [id('Tacati', 'armour'), id('Citaqualotl', 'armour')],
  }
  expect(estimateResistances(catalog, plain)).toMatchObject({
    chaosResistance: { ok: true, value: 13 },
    fireResistance: { ok: true, value: 6 },
    elementalResistance: { ok: true, value: 18 },
  })
  const amplified = {
    ...plain,
    affixes: [
      {
        modId: 'EssenceLocalRuneAndSoulCoreEffect1',
        crafted: true as const,
        lines: ['60% increased effect of Socketed Augment Items'],
      },
    ],
  }
  expect(socketEffects(catalog, amplified).flatMap((x) => x.augment.lines)).toEqual([
    '+20% to Chaos Resistance',
    '+9% to all Elemental Resistances',
  ])
  expect(estimateResistances(catalog, amplified)).toMatchObject({
    chaosResistance: { ok: true, value: 20 },
    elementalResistance: { ok: true, value: 27 },
  })
  expect(estimateDefences(catalog, amplified)).toEqual(
    estimateDefences(catalog, { ...plain, sockets: [null, null] }),
  )
  expect(
    runeSocketContributionError(catalog, {
      ...amplified,
      runeSourceLines: [
        '+20% to Chaos Resistance',
        '+9% to Fire Resistance',
        '+9% to Cold Resistance',
        '+9% to Lightning Resistance',
      ],
    }),
  ).toBeNull()
  expect(
    runeSocketContributionError(catalog, {
      ...amplified,
      runeSourceLines: ['+21% to Chaos Resistance', '+9% to all Elemental Resistances'],
    }),
  ).not.toBeNull()
})
it('攻速魂核改变本地DPS及弩装填，其他全局或需求效果不冒充本地伤害', () => {
  for (const baseId of ['Crude Bow', 'Makeshift Crossbow']) {
    const before = must(estimateWeaponStats(catalog, state(baseId)))
    const after = must(
      estimateWeaponStats(catalog, {
        ...state(baseId),
        sockets: [id('Quipolatl'), id('Quipolatl')],
      }),
    )
    expect(after.attackSpeed.value).toBe(Number((before.attackSpeed.base * 1.1).toFixed(2)))
    expect(after.attackSpeed.increased).toBe(10)
    expect(after.physicalDps).toBeGreaterThan(before.physicalDps)
    if (before.reload && after.reload)
      expect(after.reload.value).toBe(Number((before.reload.base / 1.1).toFixed(2)))
  }
  for (const name of ['Tacati', 'Citaqualotl', 'Azcapa', 'Atmohua', 'Cholotl', 'Zantipi'])
    expect(estimateWeaponStats(catalog, { ...state(), sockets: [id(name)] })).toEqual(
      estimateWeaponStats(catalog, state()),
    )
})
