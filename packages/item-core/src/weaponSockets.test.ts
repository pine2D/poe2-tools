import { describe, expect, it } from 'vitest'
import type { CatalogAugment, CatalogBase, CraftCatalog } from './catalog'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { parseItem } from './parse'
import type { CraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { runeSocketContributionError } from './runeImport'
import { artificerSocketLimit, socketCandidates, socketCapacity, socketStateError } from './sockets'
import { isSupportedWeaponRune, parseWeaponRuneEffectTotals } from './weaponRuneEffects'

const base: CatalogBase = {
  id: 'weapon',
  name: 'Test',
  type: 'Wand',
  tags: ['onehand', 'wand'],
  requirements: {},
  properties: {},
  implicit: null,
  implicitTags: [],
  sourceQuality: null,
  socketLimit: 99,
  hidden: false,
  runeforged: false,
}
const rune: CatalogAugment = {
  id: 'wand',
  name: 'Lesser Desert Rune',
  category: 'wand',
  type: 'Rune',
  localMod: false,
  lines: ['Gain 6% of Damage as Extra Fire Damage'],
  statOrder: [],
  tradeHashes: {},
  levelReq: 0,
}
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'test',
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    sources: [
      { path: 'src/Data/ModRunes.lua', url: 'https://example.test', sha256: 'a'.repeat(64) },
    ],
    excludedBases: [],
  },
  bases: [base],
  modifiers: [],
  augments: [rune],
}
const state: CraftState = {
  baseId: base.id,
  itemLevel: 80,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
  sockets: [null],
}
describe('武器普通孔位', () => {
  it.each([
    ['Claw', ['weapon', 'onehand'], 1],
    ['Dagger', ['weapon', 'onehand'], 1],
    ['Flail', ['weapon', 'onehand'], 1],
    ['One Hand Axe', ['weapon', 'onehand'], 1],
    ['One Hand Mace', ['weapon', 'onehand'], 1],
    ['One Hand Sword', ['weapon', 'onehand'], 1],
    ['Spear', ['weapon', 'onehand'], 1],
    ['Two Hand Axe', ['weapon', 'twohand'], 2],
    ['Two Hand Mace', ['weapon', 'twohand'], 2],
    ['Two Hand Sword', ['weapon', 'twohand'], 2],
    ['Bow', ['weapon', 'twohand'], 2],
    ['Crossbow', ['weapon', 'twohand'], 2],
    ['Staff', ['weapon', 'twohand', 'warstaff'], 2],
    ['Staff', ['twohand', 'staff'], 2],
    ['Wand', ['onehand', 'wand'], 1],
  ])('%s 正确手数和额外已有孔', (type, tags, limit) => {
    const source = { ...catalog, bases: [{ ...base, type, tags }] }
    expect(artificerSocketLimit(source, state)).toBe(limit)
    expect(socketCapacity(source, state)).toBe(Number(limit) + 1)
  })
  it.each([
    ['Staff', ['twohand']],
    ['Staff', ['twohand', 'warstaff', 'staff', 'weapon']],
    ['Staff', ['onehand', 'staff']],
    ['Wand', ['onehand', 'twohand', 'wand']],
    ['Sceptre', ['onehand', 'weapon']],
    ['Bow', ['weapon', 'onehand']],
    ['One Hand Sword', ['onehand']],
    ['Wand', ['onehand']],
  ])('%s 缺失或矛盾标签拒绝', (type, tags) => {
    expect(socketCapacity({ ...catalog, bases: [{ ...base, type, tags }] }, state)).toBe(0)
  })
  it('同名不同分支不混用，普通符文允许重复', () => {
    const weapon = {
      ...rune,
      id: 'weapon',
      category: 'weapon',
      localMod: true,
      lines: ['Adds 4 to 6 Fire Damage'],
    }
    const source = {
      ...catalog,
      augments: [rune, weapon, { ...rune, id: 'staff', category: 'staff' }],
    }
    expect(socketCandidates(source, state).map((x) => x.id)).toEqual(['wand'])
    expect(socketStateError(source, { ...state, sockets: ['wand', 'wand'] })).toBeNull()
    expect(socketStateError(source, { ...state, sockets: ['weapon'] })).not.toBeNull()
  })
  it('多个点伤孔端点求和，百分数不混入', () => {
    const source = {
      ...catalog,
      bases: [{ ...base, type: 'Bow', tags: ['weapon', 'twohand'] }],
      augments: [
        { ...rune, category: 'weapon', localMod: true, lines: ['Adds 4 to 6 Fire Damage'] },
      ],
    }
    expect(
      runeSocketContributionError(source, {
        ...state,
        sockets: ['wand', 'wand'],
        runeSourceLines: ['Adds 8 to 12 Fire Damage'],
      }),
    ).toBeNull()
    for (const line of [
      'Adds 12 to 8 Fire Damage',
      'Adds 8.0 to 12 Fire Damage',
      'Gain 8% of Damage as Extra Fire Damage',
      'Adds 9007199254740992 to 9007199254740992 Fire Damage',
    ]) {
      expect(
        runeSocketContributionError(source, {
          ...state,
          sockets: ['wand', 'wand'],
          runeSourceLines: [line],
        }),
      ).not.toBeNull()
    }
  })
})

it('四族四档三分支完整语义与特殊标志校验', () => {
  for (const category of ['weapon', 'wand', 'staff'] as const) {
    for (const tier of ['Lesser ', '', 'Greater ', 'Perfect ']) {
      for (const [family, element] of [
        ['Desert', 'Fire'],
        ['Glacial', 'Cold'],
        ['Storm', 'Lightning'],
        ['Iron', ''],
      ]) {
        const line =
          family === 'Iron'
            ? `20% increased ${category === 'weapon' ? 'Physical' : 'Spell'} Damage`
            : category === 'weapon'
              ? `Adds 4 to 6 ${element} Damage`
              : `Gain 6% of Damage as Extra ${element} Damage`
        const entry = {
          ...rune,
          name: `${tier}${family} Rune`,
          category,
          localMod: category === 'weapon',
          lines: [line],
        }
        expect(isSupportedWeaponRune(entry, category)).toBe(true)
        for (const patch of [
          { limit: 1 },
          { limitId: 'special' },
          { isSocketBound: true },
          { localMod: !entry.localMod },
          { lines: [line, 'Bonded: special'] },
          { name: 'Special Rune' },
        ])
          expect(isSupportedWeaponRune({ ...entry, ...patch }, category)).toBe(false)
      }
    }
  }
  for (const line of [
    'Adds -1 to 2 Fire Damage',
    'Gain 1.5% of Damage as Extra Cold Damage',
    '0% increased Spell Damage',
  ])
    expect(parseWeaponRuneEffectTotals([line])).toBeNull()
  expect(
    parseWeaponRuneEffectTotals([
      'Adds 4 to 6 Fire Damage',
      'Gain 6% of Damage as Extra Fire Damage',
    ]),
  ).toBeNull()
  expect(
    parseWeaponRuneEffectTotals([
      '9007199254740991% increased Spell Damage',
      '1% increased Spell Damage',
    ]),
  ).toBeNull()
})

it('v19 保存完整未来历史、来源哈希及旧版本边界', () => {
  const hash = 'a'.repeat(64)
  const source = {
    ...catalog,
    _meta: {
      ...catalog._meta,
      sources: [{ path: 'src/Data/ModRunes.lua', url: 'https://example.test', sha256: hash }],
    },
  }
  const project = {
    schemaVersion: 1,
    sourceCommit: 'test',
    rulesVersion: CRAFT_RULES_VERSION,
    initialState: { ...state, sockets: [] },
    operations: [{ kind: 'artificer' }, { kind: 'socket', socketIndex: 0, augmentId: 'wand' }],
    cursor: 0,
    augmentSourceHash: hash,
  }
  const restored = parseCraftProject(JSON.stringify(project), source)
  expect(restored).toMatchObject({
    ok: true,
    value: { states: [{ sockets: [] }, { sockets: [null] }, { sockets: ['wand'] }] },
  })
  expect(
    parseCraftProject(JSON.stringify({ ...project, augmentSourceHash: 'b'.repeat(64) }), source).ok,
  ).toBe(false)
  for (let version = 2; version <= 18; version++) {
    const old = { ...project, rulesVersion: `basic-2026-09-12-v${version}` }
    expect(parseCraftProject(JSON.stringify(old), source).ok).toBe(false)
    expect(
      parseCraftProject(
        JSON.stringify({ ...old, operations: [], initialState: { ...state, sockets: [null] } }),
        source,
      ).ok,
    ).toBe(false)
    expect(
      parseCraftProject(JSON.stringify({ ...old, operations: [], importedSockets: [] }), source).ok,
    ).toBe(false)
    const { sockets: _sockets, ...unknown } = state
    const { augmentSourceHash: _hash, ...legacy } = old
    expect(
      parseCraftProject(
        JSON.stringify({ ...legacy, operations: [], initialState: unknown }),
        source,
      ).ok,
    ).toBe(true)
    if (version >= 5)
      expect(parseCraftProject(JSON.stringify({ ...old, operations: [] }), source).ok).toBe(true)
  }
})

it('中文来源合并点伤、覆盖导出回读与通货保留', () => {
  const source: CraftCatalog = {
    ...catalog,
    bases: [{ ...base, type: 'Bow', tags: ['default', 'weapon', 'twohand'] }],
    augments: [
      {
        ...rune,
        id: 'fire',
        category: 'weapon',
        localMod: true,
        lines: ['Adds 4 to 6 Fire Damage'],
      },
      {
        ...rune,
        id: 'iron',
        name: 'Iron Rune',
        category: 'weapon',
        localMod: true,
        lines: ['16% increased Physical Damage'],
      },
    ],
    modifiers: [
      {
        id: 'life',
        kind: 'prefix' as const,
        name: 'Test',
        group: 'Life',
        level: 1,
        lines: ['+(10-20) to maximum Life'],
        statOrder: [],
        tags: [],
        addsTags: [],
        eligibility: [{ tag: 'default', value: 1 }],
        tradeHashes: {},
      },
    ],
  }
  const dictionary = {
    items: { bases: { Test: '测试弓' }, uniques: {} },
    stats: {
      entries: [{ id: 'fire', en: 'Adds # to # Fire Damage', text: '附加 # 至 # 火焰伤害' }],
    },
  }
  const parsed = parseItem(
    '物品类别: 弓\n稀有度: 普通\n测试弓\n--------\n物品等级: 80\n--------\n插槽: S S\n--------\n附加 8 至 12 火焰伤害 (rune)',
  )
  if (!parsed.ok) throw new Error(parsed.error)
  const imported = importCraftState(
    source,
    base.id,
    parsed.item,
    inspectItem(parsed.item, dictionary),
    ['fire', 'fire'],
  )
  if (!imported.ok) throw new Error(imported.error)
  if (!imported.ok) return
  const replaced = applyCraftStep(source, imported.value, {
    kind: 'socket',
    socketIndex: 0,
    augmentId: 'iron',
  })
  expect(replaced).toMatchObject({
    ok: true,
    value: { runeSourceLines: ['Adds 8 to 12 Fire Damage'], sockets: ['iron', 'fire'] },
  })
  if (!replaced.ok) return
  const output = exportCraftItemText(source, replaced.value)
  expect(output.ok).toBe(true)
  if (!output.ok) return
  expect(output.value.text).toContain('Adds 4 to 6 Fire Damage (rune)')
  expect(output.value.text).not.toContain('Adds 8 to 12')
  const read = parseItem(output.value.text)
  if (!read.ok) throw new Error(read.error)
  const reimported = importCraftState(
    source,
    base.id,
    read.item,
    inspectItem(read.item, dictionary),
    ['iron', 'fire'],
  )
  if (!reimported.ok) throw new Error(reimported.error)
  const magic = applyCraftStep(source, replaced.value, {
    currency: 'transmutation',
    modIds: ['life'],
    rolls: [{ modId: 'life', values: [10] }],
  })
  if (!magic.ok) throw new Error(magic.error)
  for (const currency of ['divine', 'annulment'] as const) {
    expect(
      applyCraftStep(source, magic.value, {
        currency,
        modIds: [],
        ...(currency === 'annulment' ? { removeModId: 'life' } : {}),
        ...(currency === 'divine' ? { rolls: [{ modId: 'life', values: [20] }] } : {}),
      }),
    ).toMatchObject({ ok: true, value: { sockets: ['iron', 'fire'] } })
  }
})
