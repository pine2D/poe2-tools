import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { desecrationCandidates, prepareDesecration } from './boneCraft'
import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import { preparePutrefaction } from './putrefaction'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const rune = (name: string, category: string) => `pob2:augment:${JSON.stringify([name, category])}`
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function state(name = "Thrud's Might", category = 'weapon', baseId = 'Crude Bow'): CraftState {
  return {
    baseId,
    itemLevel: 86,
    rarity: 'rare',
    affixes: [],
    sourceText: null,
    sockets: [rune(name, category)],
    quality: 0,
    nextAffixId: 1,
  }
}

it('毁灭符文进入完整揭示池并保留亵渎身份，光明剥离后可重新施加', () => {
  const initial = state()
  const pending = must(
    applyCraftStep(catalog, initial, {
      kind: 'desecrate',
      boneId: 'preserved_jawbone',
      affixKind: 'suffix',
    }),
  )
  const pool = desecrationCandidates(catalog, pending)
  const target = 'DestructionInfluenceFireModifierEffect'
  expect(pool.some((m) => m.id === target)).toBe(true)
  expect(pool.some((m) => !m.id.startsWith('DestructionInfluence'))).toBe(true)
  const options = [
    target,
    ...pool
      .filter((m) => m.id !== target)
      .slice(0, 2)
      .map((m) => m.id),
  ]
  const offered = must(
    applyCraftStep(catalog, pending, { kind: 'desecration-offer', modIds: options }),
  )
  const revealed = must(
    applyCraftStep(catalog, offered, {
      kind: 'desecration-reveal',
      modId: target,
      values: [20],
    }),
  )
  expect(revealed.affixes[0]).toMatchObject({ modId: target, desecrated: true })
  expect(createCraftState(catalog, { ...revealed, sockets: [null] }).ok).toBe(false)
  const cleared = must(
    applyCraftStep(catalog, revealed, {
      currency: 'annulment',
      omen: 'light',
      modIds: [],
      removeModId: target,
    }),
  )
  expect(cleared.affixes).toEqual([])
  expect(prepareDesecration(catalog, cleared, 'preserved_jawbone').ok).toBe(true)
  expect(initial.affixes).toEqual([])
})

it('巫妖、回响和腐烂交互不能随普通骨骼放开', () => {
  const initial = state()
  expect(prepareDesecration(catalog, initial, 'preserved_jawbone', { lichOmen: 'liege' }).ok).toBe(
    false,
  )
  expect(preparePutrefaction(catalog, initial, 'preserved_jawbone').ok).toBe(false)
  expect(
    createCraftState(catalog, {
      ...initial,
      pendingDesecration: {
        boneId: 'preserved_jawbone',
        kind: 'suffix',
        revealOmen: 'abyssal_echoes',
      },
    }).ok,
  ).toBe(false)
})

it('来源开放不绕过物等、材料类别和前后缀限制', () => {
  const initial = state()
  expect(prepareDesecration(catalog, initial, 'gnawed_jawbone').ok).toBe(false)
  expect(prepareDesecration(catalog, initial, 'preserved_rib').ok).toBe(false)
  const low = { ...initial, itemLevel: 64 }
  const pending = must(
    applyCraftStep(catalog, low, {
      kind: 'desecrate',
      boneId: 'preserved_jawbone',
      affixKind: 'suffix',
    }),
  )
  expect(
    desecrationCandidates(catalog, pending).some((m) => m.id.startsWith('DestructionInfluence')),
  ).toBe(false)
  const prefix = must(
    applyCraftStep(catalog, initial, {
      kind: 'desecrate',
      boneId: 'preserved_jawbone',
      affixKind: 'prefix',
    }),
  )
  expect(desecrationCandidates(catalog, prefix).every((m) => m.kind === 'prefix')).toBe(true)
  expect(
    desecrationCandidates(catalog, prefix).some(
      (m) => m.id === 'DestructionInfluenceFireModifierEffect',
    ),
  ).toBe(false)
  const forged = {
    ...catalog,
    _meta: {
      ...catalog._meta,
      sources: catalog._meta.sources.map((source) =>
        source.path === 'src/Data/ModRunes.lua' ? { ...source, sha256: 'forged' } : source,
      ),
    },
  }
  expect(prepareDesecration(forged, initial, 'preserved_jawbone').ok).toBe(false)
})

it.each([
  ["Medved's Tending", 'body armour', "Adherent's Raiment"],
  ["Vorana's Carnage", 'helmet', 'Wicker Tiara'],
  ["Katla's Gloom", 'gloves', 'Adherent Cuffs'],
])('未核实的 %s 骨骼交互仍不开放', (name, category, baseId) => {
  const initial = state(name, category, baseId)
  expect(createCraftState(catalog, initial).ok).toBe(true)
  expect(prepareDesecration(catalog, initial, 'preserved_rib').ok).toBe(false)
})
