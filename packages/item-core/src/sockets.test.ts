import { describe, expect, it } from 'vitest'
import type { CatalogAugment, CatalogBase, CraftCatalog } from './catalog'
import type { CraftState } from './rehearsal'
import {
  artificerSocketLimit,
  socketCandidates,
  socketCapacity,
  socketEffects,
  socketStateError,
} from './sockets'

const rune: CatalogAugment = {
  id: 'fire',
  name: 'Perfect Desert Rune',
  category: 'armour',
  type: 'Rune',
  localMod: false,
  lines: ['+22% to Fire Resistance'],
  statOrder: [1014],
  tradeHashes: {},
  levelReq: 50,
  bonded: { lines: ['+25 to maximum Life'], statOrder: [887] },
}
const base: CatalogBase = {
  id: 'helmet',
  name: 'Helmet',
  type: 'Helmet',
  tags: ['default'],
  requirements: {},
  properties: {},
  implicit: null,
  implicitTags: [],
  sourceQuality: null,
  socketLimit: 9,
  hidden: false,
  runeforged: false,
}
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
  bases: [base],
  modifiers: [],
  augments: [rune],
}
const state: CraftState = {
  baseId: 'helmet',
  itemLevel: 1,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
  sockets: [null],
}

describe('独立普通符文层', () => {
  it.each([
    ['Body Armour', 2, 3],
    ['Helmet', 1, 2],
    ['Gloves', 1, 2],
    ['Boots', 1, 2],
  ])('巧匠石对 %s 使用普通上限，已有额外孔仍有效', (type, ordinary, existing) => {
    const source = { ...catalog, bases: [{ ...base, type: String(type) }] }
    expect(artificerSocketLimit(source, state)).toBe(ordinary)
    expect(socketCapacity(source, state)).toBe(existing)
  })

  it.each([
    { type: 'Ring' },
    { hidden: true },
    { runeforged: true },
    { variantList: ['special'] },
    { implicit: 'Has 3 Sockets' },
    { implicit: '60% increased effect of Socketed Augment Items' },
  ])('巧匠石不放行未支持或特殊基底 %j', (patch) => {
    const source = { ...catalog, bases: [{ ...base, ...patch }] }
    expect(artificerSocketLimit(source, { ...state, sockets: [] })).toBe(0)
  })

  it.each([
    ['Focus', ['focus']],
    ['Shield', ['shield']],
    ['Shield', ['shield', 'buckler']],
    ['Buckler', ['buckler']],
  ])('%s 副手可打 1 个普通孔并保留最多 2 个已有孔', (type, tags) => {
    const source = { ...catalog, bases: [{ ...base, type, tags }] }
    expect(artificerSocketLimit(source, { ...state, sockets: [] })).toBe(1)
    expect(socketCapacity(source, state)).toBe(2)
    expect(socketStateError(source, { ...state, sockets: [null, null] })).toBeNull()
    expect(socketStateError(source, { ...state, sockets: [null, null, null] })).not.toBeNull()
    expect(socketCandidates(source, state).map(({ id }) => id)).toEqual(['fire'])
  })

  it('支持三抗四档 armour 分支，不把穿戴需求当物等门槛', () => {
    const names = [
      'Lesser Desert Rune',
      'Desert Rune',
      'Greater Desert Rune',
      'Perfect Desert Rune',
      'Lesser Glacial Rune',
      'Glacial Rune',
      'Greater Glacial Rune',
      'Perfect Glacial Rune',
      'Lesser Storm Rune',
      'Storm Rune',
      'Greater Storm Rune',
      'Perfect Storm Rune',
    ]
    const source = {
      ...catalog,
      augments: names.map((name) => ({
        ...rune,
        id: name,
        name,
        lines: [
          `+22% to ${name.includes('Glacial') ? 'Cold' : name.includes('Storm') ? 'Lightning' : 'Fire'} Resistance`,
        ],
      })),
    }
    expect(socketCandidates(source, state).map((entry) => entry.name)).toEqual(names)
  })

  it.each(['Body Armour', 'Helmet', 'Gloves', 'Boots'])('接受 %s 已有额外掉落孔', (type) => {
    const source = { ...catalog, bases: [{ ...base, type }] }
    const count = type === 'Body Armour' ? 3 : 2
    expect(socketCapacity(source, state)).toBe(count)
    expect(
      socketStateError(source, { ...state, sockets: Array.from({ length: count }, () => null) }),
    ).toBeNull()
    expect(
      socketStateError(source, {
        ...state,
        sockets: Array.from({ length: count + 1 }, () => null),
      }),
    ).not.toBeNull()
  })

  it.each(['Ring', 'Charm'])('不为 %s 套用护甲孔位语义', (type) => {
    const source = { ...catalog, bases: [{ ...base, type }] }
    expect(socketCapacity(source, state)).toBe(0)
    expect(socketCandidates(source, state)).toEqual([])
    expect(socketStateError(source, state)).not.toBeNull()
  })

  it('不从基底 socketLimit 生成缺省孔或零孔', () => {
    for (const sockets of [undefined, []]) {
      const input = { ...state, sockets } as CraftState
      expect(socketStateError(catalog, input)).toBeNull()
      expect(socketCandidates(catalog, input)).toEqual([])
      expect(socketEffects(catalog, input)).toEqual([])
    }
  })

  it.each([
    { name: 'Iron Rune' },
    { category: 'weapon' },
    { localMod: true },
    { type: 'SoulCore' },
    { limit: 1 },
    { limit: 0 },
    { limitId: 'shared' },
    { isSocketBound: true },
  ] satisfies Partial<CatalogAugment>[])('拒绝未核对的类别、限制与绑定：%j', (override) => {
    const source = { ...catalog, augments: [{ ...rune, ...override }] }
    expect(socketCandidates(source, state)).toEqual([])
    expect(socketStateError(source, { ...state, sockets: ['fire'] })).not.toBeNull()
  })

  it('保留 Bonded 来源但生效条目只返回当前孔位的普通效果', () => {
    const effects = socketEffects(catalog, { ...state, sockets: [null, 'fire'] })
    expect(effects).toEqual([{ socketIndex: 1, augment: rune }])
    expect(effects.flatMap((effect) => effect.augment.lines)).toEqual(['+22% to Fire Resistance'])
    expect(socketEffects(catalog, { ...state, sockets: ['unknown'] })).toEqual([])
  })

  it.each([
    'Has 3 Sockets',
    '60% increased effect of Socketed Augment Items',
    'Bonded modifiers are active',
  ])('拒绝特殊固有效果：%s', (implicit) => {
    const source = { ...catalog, bases: [{ ...base, implicit }] }
    expect(socketCandidates(source, state)).toEqual([])
    expect(socketStateError(source, state)).not.toBeNull()
    const legacy = { ...state }
    delete legacy.sockets
    expect(socketStateError(source, legacy)).toBeNull()
  })

  it('拒绝显式效果增强或绑定，不因属性已有具体数值漏过目录规则', () => {
    const input = {
      ...state,
      rarity: 'rare' as const,
      affixes: [{ modId: 'effect', lines: ['25% increased effect of Socketed Augment Items'] }],
    }
    expect(socketStateError(catalog, input)).not.toBeNull()
    expect(socketCandidates(catalog, input)).toEqual([])
  })

  it('拒绝稀疏孔数组与非法元素', () => {
    for (const sockets of [new Array(1), [undefined], [''], [true], null, {}]) {
      expect(socketStateError(catalog, { ...state, sockets } as CraftState)).not.toBeNull()
    }
  })
})
