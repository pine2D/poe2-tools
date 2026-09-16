import { describe, expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import type { CatalogMod, CraftCatalog } from './catalog'
import { craftedModifierCapacity } from './craftedCapacity'
import { applyCraftStep } from './craftSteps'
import { pendingExaltationAllowed } from './pendingExaltation'
import {
  applyCraftOperation,
  type CraftState,
  craftCandidates,
  createCraftState,
} from './rehearsal'

function fixture(): { catalog: CraftCatalog; state: CraftState } {
  const catalog = boneCatalog()
  const source = catalog.modifiers.find((mod) => mod.id === 'exclusive1') as CatalogMod
  catalog.modifiers.push(
    ...[1, 2, 3].map(
      (n): CatalogMod => ({
        ...source,
        id: `hidden-prefix${n}`,
        name: `hidden-prefix${n}`,
        group: `hidden-prefix${n}`,
        kind: 'prefix',
        lines: [`hidden-prefix${n} (1-10)`],
      }),
    ),
  )
  return {
    catalog,
    state: {
      ...boneState(['prefix1', 'prefix2', 'suffix1']),
      pendingDesecration: { boneId: 'preserved_rib', kind: 'prefix' },
    },
  }
}

describe('未固定亵渎期间追加崇高', () => {
  it('两前一后加前缀占位后可追加后缀，且保留 pending 与原态', () => {
    const { catalog, state } = fixture()
    const snapshot = structuredClone(state)

    expect(pendingExaltationAllowed(catalog, state)).toBe(true)
    expect(craftCandidates(catalog, state, 'exalted').map((mod) => mod.id)).toContain('suffix2')
    const result = applyCraftOperation(catalog, state, {
      currency: 'exalted',
      modIds: ['suffix2'],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.pendingDesecration).toEqual(state.pendingDesecration)
      expect(result.value.affixes.map((affix) => affix.modId)).toEqual([
        'prefix1',
        'prefix2',
        'suffix1',
        'suffix2',
      ])
    }
    expect(state).toEqual(snapshot)
  })

  it('强效两条追加通过统一步骤原子完成，第二条失败不改变输入', () => {
    const { catalog, state } = fixture()
    const snapshot = structuredClone(state)
    const success = applyCraftStep(catalog, state, {
      currency: 'perfect_exalted',
      omen: 'greater_dextral_exaltation',
      modIds: ['suffix2', 'suffix3'],
      rolls: [
        { modId: 'suffix2', values: [2] },
        { modId: 'suffix3', values: [3] },
      ],
    })
    expect(success.ok).toBe(true)
    if (success.ok) expect(success.value.pendingDesecration).toEqual(state.pendingDesecration)

    const failed = applyCraftStep(catalog, state, {
      currency: 'perfect_exalted',
      omen: 'greater_dextral_exaltation',
      modIds: ['suffix2', 'missing'],
      rolls: [
        { modId: 'suffix2', values: [2] },
        { modId: 'missing', values: [3] },
      ],
    })
    expect(failed.ok).toBe(false)
    expect(state).toEqual(snapshot)
  })

  it('只开放普通三档崇高、常规 3/3 容量和未固定首组', () => {
    const { catalog, state } = fixture()
    const pending = state.pendingDesecration
    expect(pending).toBeDefined()
    if (!pending) return
    expect(pendingExaltationAllowed(catalog, state, 'greater_exalted')).toBe(true)
    expect(pendingExaltationAllowed(catalog, state, 'perfect_exalted')).toBe(true)
    expect(pendingExaltationAllowed(catalog, state, 'chaos')).toBe(false)
    expect(pendingExaltationAllowed(catalog, state, 'exalted', 'catalysing_exaltation')).toBe(false)
    expect(pendingExaltationAllowed(catalog, boneState(), 'exalted')).toBe(false)
    expect(
      pendingExaltationAllowed(catalog, {
        ...state,
        pendingDesecration: { ...pending, options: ['a', 'b', 'c'] },
      }),
    ).toBe(false)
    expect(
      pendingExaltationAllowed(catalog, {
        ...state,
        pendingDesecration: { ...pending, lichOmen: 'liege' },
      }),
    ).toBe(false)
    expect(
      pendingExaltationAllowed(catalog, {
        ...state,
        pendingDesecration: {
          ...pending,
          options: ['a', 'b', 'c'],
          revealOmen: 'abyssal_echoes',
        },
      }),
    ).toBe(false)
    expect(pendingExaltationAllowed(boneCatalog('Jewel'), state)).toBe(false)
    expect(pendingExaltationAllowed(catalog, { ...state, corrupted: true })).toBe(false)
    expect(
      pendingExaltationAllowed(catalog, {
        ...state,
        pendingDesecration: { boneId: 'fake' as never, kind: 'prefix' },
      }),
    ).toBe(false)
    for (const invalid of [
      undefined,
      null,
      false,
      {},
      { boneId: 'preserved_rib', kind: 'prefix', options: ['a', 'a', 'b'] },
      { boneId: 'preserved_rib', kind: 'prefix', extra: true },
    ]) {
      expect(
        pendingExaltationAllowed(catalog, {
          ...state,
          pendingDesecration: invalid,
        } as unknown as CraftState),
      ).toBe(false)
    }

    const specialCapacity = fixture()
    const capacitySource = specialCapacity.catalog.modifiers[0] as CatalogMod
    specialCapacity.catalog.modifiers.push({
      ...capacitySource,
      id: 'special-capacity',
      group: 'special-capacity',
      lines: ['+1 Suffix Modifier allowed'],
    })
    specialCapacity.state.affixes.push({
      modId: 'special-capacity',
      lines: ['+1 Suffix Modifier allowed'],
    })
    expect(pendingExaltationAllowed(specialCapacity.catalog, specialCapacity.state)).toBe(false)

    const astrid = fixture()
    const astridId = `pob2:augment:${JSON.stringify(["Astrid's Creativity", 'armour'])}`
    astrid.catalog._meta.sources.push({
      path: 'src/Data/ModRunes.lua',
      url: 'https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModRunes.lua',
      sha256: 'd3dac48143209d7d9a02a8c03bd86f21604a0961a8ced49290d6a1d243f8223a',
    })
    astrid.catalog._meta.sources.push({
      path: 'src/Data/ModScalability.lua',
      url: 'https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModScalability.lua',
      sha256: 'c0e4edaf1ea37c7bec331747f6a3bd91f21e32d302e4214a4512c790a58b1db9',
    })
    astrid.catalog.augments = [
      {
        id: astridId,
        name: "Astrid's Creativity",
        category: 'armour',
        type: 'Rune',
        localMod: true,
        lines: ['Can have 1 additional Crafted Modifier'],
        statOrder: [30],
        tradeHashes: { '1963398329': ['Can have 1 additional Crafted Modifier'] },
        levelReq: 0,
        limit: 1,
        canSocketInJewellery: true,
      },
    ]
    astrid.catalog.scalability = {
      'Can have 1 additional Crafted Modifier': [{ scalable: true, formats: [] }],
    }
    astrid.state.sockets = [astridId]
    const checkedAstrid = createCraftState(astrid.catalog, astrid.state)
    expect(checkedAstrid.ok ? null : checkedAstrid.error).toBeNull()
    expect(craftedModifierCapacity(astrid.catalog, astrid.state)).toEqual({ ok: true, value: 2 })
    expect(pendingExaltationAllowed(astrid.catalog, astrid.state)).toBe(false)
  })

  it('沿用方向与最低等级规则，并拒绝满位和不足三项揭示池', () => {
    const { catalog, state } = fixture()
    expect(
      craftCandidates(catalog, state, 'exalted', 'dextral_exaltation').every(
        (mod) => mod.kind === 'suffix',
      ),
    ).toBe(true)
    expect(
      craftCandidates(catalog, { ...state, itemLevel: 40 }, 'perfect_exalted').map((mod) => mod.id),
    ).toEqual([])
    expect(
      pendingExaltationAllowed(catalog, {
        ...state,
        affixes: [
          ...state.affixes,
          { modId: 'suffix2', lines: ['suffix2 5'] },
          { modId: 'suffix3', lines: ['suffix3 5'] },
        ],
      }),
    ).toBe(false)

    const sparse = fixture()
    sparse.catalog.modifiers = sparse.catalog.modifiers.filter(
      (mod) => !['prefix3', 'prefix4', 'hidden-prefix2', 'hidden-prefix3'].includes(mod.id),
    )
    expect(pendingExaltationAllowed(sparse.catalog, sparse.state)).toBe(false)
  })

  it('过滤会用动态标签把揭示池降到三项以下的新增词缀', () => {
    const { catalog, state } = fixture()
    const suffix2 = catalog.modifiers.find((mod) => mod.id === 'suffix2') as CatalogMod
    suffix2.level = 40
    catalog.modifiers.push({
      ...suffix2,
      id: 'suffix-low',
      name: 'suffix-low',
      level: 20,
      lines: ['suffix-low (1-10)'],
      addsTags: [],
    })
    suffix2.addsTags = ['blocked-hidden']
    for (const id of ['prefix3', 'prefix4', 'hidden-prefix2', 'hidden-prefix3']) {
      const mod = catalog.modifiers.find((entry) => entry.id === id) as CatalogMod
      mod.eligibility = [{ tag: 'blocked-hidden', value: 0 }, ...mod.eligibility]
    }

    expect(craftCandidates(catalog, state, 'exalted').map((mod) => mod.id)).not.toContain('suffix2')
    expect(craftCandidates(catalog, state, 'exalted').map((mod) => mod.id)).toContain('suffix-low')
    expect(craftCandidates(catalog, state, 'perfect_exalted').map((mod) => mod.id)).toContain(
      'suffix-low',
    )
    expect(
      applyCraftOperation(catalog, state, { currency: 'exalted', modIds: ['suffix2'] }).ok,
    ).toBe(false)
  })

  it('候选快路径仍校验特殊孔规则和仅在生成时成立的动态资格', () => {
    const socketRule = fixture()
    const socketSuffix = socketRule.catalog.modifiers.find(
      (mod) => mod.id === 'suffix2',
    ) as CatalogMod
    socketSuffix.lines = ['Socketed Runes have 10% increased Effect']
    socketRule.state.sockets = [null]
    expect(
      craftCandidates(socketRule.catalog, socketRule.state, 'exalted').map((mod) => mod.id),
    ).not.toContain('suffix2')
    expect(
      applyCraftOperation(socketRule.catalog, socketRule.state, {
        currency: 'exalted',
        modIds: ['suffix2'],
      }).ok,
    ).toBe(false)

    const dynamicOnly = fixture()
    const tagSource = dynamicOnly.catalog.modifiers.find(
      (mod) => mod.id === 'prefix1',
    ) as CatalogMod
    const generated = dynamicOnly.catalog.modifiers.find(
      (mod) => mod.id === 'suffix2',
    ) as CatalogMod
    tagSource.addsTags = ['dynamic-only']
    generated.eligibility = [{ tag: 'dynamic-only', value: 1 }]
    expect(
      craftCandidates(dynamicOnly.catalog, dynamicOnly.state, 'exalted').map((mod) => mod.id),
    ).not.toContain('suffix2')
    expect(
      applyCraftOperation(dynamicOnly.catalog, dynamicOnly.state, {
        currency: 'exalted',
        modIds: ['suffix2'],
      }).ok,
    ).toBe(false)
  })
})
