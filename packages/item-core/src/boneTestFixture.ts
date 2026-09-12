import type { CatalogMod, CraftCatalog } from './catalog'
import { DESECRATION_SOURCE } from './desecration'
import type { CraftState } from './rehearsal'

/** 骨骼测试共用纯合成目录，不包含真实目录记录。 */
export function boneCatalog(type = 'Helmet'): CraftCatalog {
  const modifiers: CatalogMod[] = ['prefix', 'suffix'].flatMap((kind) =>
    [1, 2, 3, 4].map((n) => ({
      id: kind + n,
      kind: kind as CatalogMod['kind'],
      name: kind + n,
      group: kind + n,
      level: 1,
      lines: [`${kind}${n} (1-10)`],
      statOrder: [1],
      tags: [],
      addsTags: [],
      eligibility: [{ tag: 'default', value: 1 as const }],
      tradeHashes: {},
    })),
  )
  modifiers.push(
    ...[1, 2, 3].map(
      (n): CatalogMod => ({
        id: `exclusive${n}`,
        kind: 'suffix',
        name: `exclusive${n}`,
        group: `exclusive${n}`,
        level: 10,
        lines: [`exclusive${n} (1-10)`],
        statOrder: [1],
        tags: ['unveiled_mod', 'amanamu_mod'],
        addsTags: [],
        eligibility: [{ tag: 'default', value: 1 }],
        tradeHashes: {},
        desecratedOnly: true,
      }),
    ),
  )
  return {
    _meta: {
      schemaVersion: 2,
      tier: 'primary',
      sourceCommit: DESECRATION_SOURCE.commit,
      generatedAt: '',
      gameVersion: null,
      weightStatus: 'unknown',
      sources: [DESECRATION_SOURCE],
      excludedBases: [],
    },
    bases: [
      {
        id: 'Synthetic Base',
        name: 'Synthetic Base',
        type,
        tags: ['default', 'synthetic'],
        requirements: {},
        properties: {},
        implicit: null,
        implicitTags: [],
        hidden: false,
        runeforged: false,
        sourceQuality: null,
        socketLimit: 2,
      },
    ],
    modifiers,
  }
}
export function boneState(ids: string[] = []): CraftState {
  return {
    baseId: 'Synthetic Base',
    itemLevel: 64,
    rarity: 'rare',
    affixes: ids.map((modId) => ({ modId, lines: [`${modId} 5`] })),
    sourceText: null,
    sockets: [],
  }
}
