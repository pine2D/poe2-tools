import type { CatalogBase, CatalogMod, CraftCatalog } from './catalog'
import type { CraftState } from './rehearsal'
export const base: CatalogBase = {
  id: 'Focus',
  name: 'Focus',
  type: 'Focus',
  tags: ['focus', 'default'],
  requirements: {},
  properties: {},
  implicit: null,
  implicitTags: [],
  sourceQuality: null,
  socketLimit: 3,
  hidden: false,
  runeforged: false,
}

export function mod(
  id: string,
  kind: CatalogMod['kind'],
  extra: Partial<CatalogMod> = {},
): CatalogMod {
  return {
    id,
    name: id,
    kind,
    group: id,
    level: 1,
    lines: [`${id} (1-10)`],
    statOrder: [1],
    tags: [],
    addsTags: [],
    eligibility: [
      { tag: 'focus', value: 1 },
      { tag: 'default', value: 0 },
    ],
    tradeHashes: {},
    ...extra,
  }
}

export const modifiers = [
  mod('p1', 'prefix'),
  mod('p2', 'prefix'),
  mod('p3', 'prefix'),
  mod('p4', 'prefix'),
  mod('s1', 'suffix'),
  mod('s2', 'suffix'),
  mod('s3', 'suffix'),
  mod('s4', 'suffix'),
  mod('high', 'prefix', { group: 'p1', level: 80 }),
]

export function catalog(mods = modifiers, extra: Partial<CatalogBase> = {}): CraftCatalog {
  return {
    _meta: {
      schemaVersion: 2,
      tier: 'primary',
      sourceCommit: 'a'.repeat(40),
      gameVersion: null,
      generatedAt: '2026-09-12',
      weightStatus: 'unknown',
      sources: [],
      excludedBases: [],
    },
    bases: [{ ...base, ...extra }],
    modifiers: mods,
  }
}

export function state(rarity: CraftState['rarity'] = 'rare', ids: string[] = []): CraftState {
  return {
    baseId: base.id,
    itemLevel: 70,
    rarity,
    affixes: ids.map((modId) => ({ modId, lines: [`${modId} 5`] })),
    sourceText: null,
  }
}

export function conflictingCatalog() {
  return catalog([
    mod('ess', 'prefix', { group: 'EssenceSpellSkillLevel' }),
    mod('fire', 'prefix', { group: 'GlobalIncreaseFireSpellSkillGemLevelWeapon' }),
    mod('cold', 'prefix', { group: 'GlobalIncreaseColdSpellSkillGemLevelWeapon' }),
  ])
}
