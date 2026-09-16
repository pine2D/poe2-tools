import { describe, expect, it } from 'vitest'
import type { CatalogAugment, CraftCatalog } from './catalog'
import { parseCraftCatalog } from './catalogFormat'
import { LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { STAT_SCALABILITY_SOURCE } from './statScalability'

const augment: CatalogAugment = {
  id: 'pob2:augment:["Test Rune","armour"]',
  name: 'Test Rune',
  category: 'armour',
  type: 'Rune',
  localMod: false,
  lines: ['+14% to Fire Resistance'],
  statOrder: [14.1],
  tradeHashes: { '42': ['+14% to Fire Resistance'] },
  levelReq: 0,
}
const catalog: CraftCatalog = {
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
  bases: [],
  modifiers: [],
}

describe('液态情感目录边界', () => {
  const emotion = {
    id: 'Metadata/Items/Currency/DistilledEmotion1',
    name: 'Diluted Liquid Ire',
    radiusJewel: false,
    tierLevel: 1,
    mods: {
      Ruby: { prefix: 'JewelArmour' },
      Sapphire: { suffix: 'JewelEnergyShield' },
      Emerald: { prefix: 'A', suffix: 'B' },
      Diamond: {},
    },
  }
  const valid = {
    ...catalog,
    _meta: {
      ...catalog._meta,
      sourceCommit: LIQUID_EMOTION_SOURCE.commit,
      sources: [LIQUID_EMOTION_SOURCE],
    },
    liquidEmotions: [emotion],
  }

  it('兼容旧目录并保留四类别、空映射与双侧效果', () => {
    expect(parseCraftCatalog(catalog)).toBe(catalog)
    expect(parseCraftCatalog(valid)).toBe(valid)
  })

  it('字段和固定来源必须成对出现且指纹精确匹配', () => {
    expect(() => parseCraftCatalog({ ...catalog, liquidEmotions: [emotion] })).toThrow()
    expect(() =>
      parseCraftCatalog({
        ...catalog,
        _meta: {
          ...catalog._meta,
          sourceCommit: LIQUID_EMOTION_SOURCE.commit,
          sources: [LIQUID_EMOTION_SOURCE],
        },
      }),
    ).toThrow()
    for (const source of [
      { ...LIQUID_EMOTION_SOURCE, sha256: '0'.repeat(64) },
      { ...LIQUID_EMOTION_SOURCE, url: 'https://example.test/LiquidEmotions.lua' },
    ])
      expect(() =>
        parseCraftCatalog({ ...valid, _meta: { ...valid._meta, sources: [source] } }),
      ).toThrow()
    expect(() =>
      parseCraftCatalog({
        ...valid,
        _meta: { ...valid._meta, sources: [LIQUID_EMOTION_SOURCE, LIQUID_EMOTION_SOURCE] },
      }),
    ).toThrow()
  })

  it('拒绝重复身份、未知字段、非法类别、侧和值', () => {
    for (const liquidEmotions of [
      [],
      [emotion, emotion],
      [{ ...emotion, futureRule: true }],
      [{ ...emotion, id: '' }],
      [{ ...emotion, name: '' }],
      [{ ...emotion, radiusJewel: 'false' }],
      [{ ...emotion, tierLevel: -1 }],
      [{ ...emotion, tierLevel: 1.5 }],
      [{ ...emotion, mods: { Ruby: {}, Sapphire: {}, Emerald: {} } }],
      [{ ...emotion, mods: { ...emotion.mods, Topaz: {} } }],
      [{ ...emotion, mods: { ...emotion.mods, Ruby: { implicit: 'A' } } }],
      [{ ...emotion, mods: { ...emotion.mods, Ruby: { prefix: '' } } }],
    ])
      expect(() => parseCraftCatalog({ ...valid, liquidEmotions })).toThrow()
  })
})

it('普通镶嵌行允许精确缩放声明，Bonded 与无关文本不进入范围', () => {
  const line = 'Regenerate 0.35% of maximum Life per second'
  const valid = {
    ...catalog,
    _meta: {
      ...catalog._meta,
      sourceCommit: STAT_SCALABILITY_SOURCE.commit,
      sources: [STAT_SCALABILITY_SOURCE],
    },
    augments: [
      { ...augment, lines: [line], bonded: { lines: ['+20 to maximum Life'], statOrder: [1] } },
    ],
    scalability: {
      [line]: [{ scalable: true, formats: ['per_minute_to_per_second_2dp_if_required'] }],
    },
  }
  expect(parseCraftCatalog(valid)).toBe(valid)
  for (const other of ['+20 to maximum Life', '+999 to maximum Mana'])
    expect(() =>
      parseCraftCatalog({ ...valid, scalability: { [other]: [{ scalable: true, formats: [] }] } }),
    ).toThrow()
})

it('缩放表核对固定来源、完整数字声明及当前目录归属', () => {
  const line = '+(10-19) Life'
  const valid = {
    ...catalog,
    _meta: {
      ...catalog._meta,
      sourceCommit: STAT_SCALABILITY_SOURCE.commit,
      sources: [STAT_SCALABILITY_SOURCE],
    },
    modifiers: [
      {
        id: 'Test',
        kind: 'prefix',
        name: 'Test',
        group: 'Test',
        level: 1,
        lines: [line],
        statOrder: [1],
        tags: ['life'],
        addsTags: [],
        eligibility: [{ tag: 'default', value: 1 }],
        tradeHashes: {},
      },
    ],
    scalability: { [line]: [{ scalable: true, formats: [] }] },
  }
  expect(parseCraftCatalog(valid)).toBe(valid)
  for (const scalability of [
    null,
    { [line]: [] },
    { [line]: [{ scalable: 1, formats: [] }] },
    { [line]: [{ scalable: true, formats: [1] }] },
    { [line]: [{ scalable: true, formats: [], extra: true }] },
    { 'Not in catalog': [] },
  ])
    expect(() => parseCraftCatalog({ ...valid, scalability })).toThrow()
  expect(() => parseCraftCatalog({ ...valid, _meta: { ...valid._meta, sources: [] } })).toThrow()
  expect(() =>
    parseCraftCatalog({
      ...valid,
      _meta: { ...valid._meta, sources: [{ ...STAT_SCALABILITY_SOURCE, sha256: '0'.repeat(64) }] },
    }),
  ).toThrow()
})

describe('亵渎专属目录边界', () => {
  const commit = 'ce566eac45ea8a86477f513c7ee65a1ebe60014e'
  const source = {
    path: 'src/Data/ModVeiled.lua',
    url: `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/${commit}/src/Data/ModVeiled.lua`,
    sha256: '95234097bcb70946ad451fbdb80b93cff3bd4a57abfdf29052305905fd32a632',
  }
  const mod = {
    id: 'SyntheticVeiled',
    kind: 'prefix',
    name: 'Synthetic',
    group: 'test',
    level: 1,
    lines: ['+(1-5) to maximum Life'],
    statOrder: [1],
    tags: ['unveiled_mod', 'amanamu_mod'],
    addsTags: [],
    eligibility: [{ tag: 'default', value: 1 }],
    tradeHashes: {},
    desecratedOnly: true,
  }
  const valid = {
    ...catalog,
    _meta: {
      ...catalog._meta,
      sourceCommit: commit,
      sources: [source],
      excludedDesecratedMods: [{ id: 'Skipped', reason: '未声明前后缀' }],
    },
    modifiers: [mod],
  }
  it('旧目录兼容，新目录标记与审计完整保存', () => {
    expect(parseCraftCatalog(catalog)).toBe(catalog)
    expect(parseCraftCatalog(valid)).toBe(valid)
  })
  it('拒绝 false/null、未知键、错误三族/重复标签和缺少固定指纹', () => {
    for (const patch of [
      { desecratedOnly: false },
      { desecratedOnly: null },
      { future: true },
      { tags: ['amanamu_mod'] },
      { tags: ['unveiled_mod'] },
      { tags: ['unveiled_mod', 'amanamu_mod', 'kurgal_mod'] },
      { tags: ['unveiled_mod', 'amanamu_mod', 'amanamu_mod'] },
    ])
      expect(() => parseCraftCatalog({ ...valid, modifiers: [{ ...mod, ...patch }] })).toThrow()
    for (const sources of [
      [],
      [source, source],
      [{ ...source, sha256: 'a'.repeat(64) }],
      [{ ...source, url: 'https://example.test/ModVeiled.lua' }],
    ])
      expect(() => parseCraftCatalog({ ...valid, _meta: { ...valid._meta, sources } })).toThrow()
    expect(() =>
      parseCraftCatalog({ ...valid, _meta: { ...valid._meta, sourceCommit: 'a'.repeat(40) } }),
    ).toThrow()
  })
  it('排除项必须完整唯一且不能与已采纳ID重复；重复source不能静默保留', () => {
    for (const excludedDesecratedMods of [
      null,
      {},
      [{ id: '', reason: 'x' }],
      [{ id: 'x', reason: '' }],
      [{ id: 'x', reason: 'x', unknown: 1 }],
      [
        { id: 'x', reason: 'x' },
        { id: 'x', reason: 'x' },
      ],
      [{ id: mod.id, reason: 'x' }],
    ])
      expect(() =>
        parseCraftCatalog({ ...valid, _meta: { ...valid._meta, excludedDesecratedMods } }),
      ).toThrow()
    expect(() => parseCraftCatalog({ ...valid, modifiers: [mod, mod] })).toThrow()
    expect(() =>
      parseCraftCatalog({
        ...catalog,
        _meta: {
          ...catalog._meta,
          sources: [
            { path: 'same', url: 'x', sha256: 'x' },
            { path: 'same', url: 'x', sha256: 'x' },
          ],
        },
      }),
    ).toThrow()
  })
})

describe('制作镶嵌目录边界', () => {
  it('兼容旧目录并独立保存需求、限制和 Bonded，不补写缺省布尔', () => {
    expect(parseCraftCatalog(catalog)).toBe(catalog)
    const full = {
      ...augment,
      limit: 1,
      limitId: 'AncientAugment',
      isSocketBound: false,
      canSocketInChakraSlots: true,
      canSocketInUniqueItems: false,
      canSocketInJewellery: true,
      canSocketInCorruptedSanctified: false,
      bonded: { lines: ['Bonded effect'], statOrder: [1.2] },
    }
    expect(parseCraftCatalog({ ...catalog, augments: [full] }).augments).toEqual([full])
    const parsed = parseCraftCatalog({ ...catalog, augments: [augment] }).augments?.[0]
    expect(parsed).not.toHaveProperty('isSocketBound')
    expect(parsed).not.toHaveProperty('canSocketInUniqueItems')
  })

  it('拒绝无效集合和重复来源身份', () => {
    for (const augments of [null, {}, 'broken', [augment, augment], Array(10001).fill(augment)]) {
      expect(() => parseCraftCatalog({ ...catalog, augments })).toThrow()
    }
  })

  it('保留只有 Bonded 的声明与空贸易文本，不虚构普通效果', () => {
    const bondedOnly = {
      ...augment,
      lines: [],
      statOrder: [],
      tradeHashes: { '42': [''] },
      bonded: { lines: ['Bonded effect'], statOrder: [1] },
    }
    expect(parseCraftCatalog({ ...catalog, augments: [bondedOnly] }).augments).toEqual([bondedOnly])
  })

  it('逐字段拒绝损坏身份、未知语义、无效需求、排序与限制', () => {
    for (const fields of [
      { id: 'not-source-id' },
      { name: '' },
      { category: '' },
      { type: 'FutureAugment' },
      { localMod: 'false' },
      { lines: [] },
      { lines: [42] },
      { statOrder: [] },
      { statOrder: [Number.NaN] },
      { tradeHashes: { bad: ['effect'] } },
      { tradeHashes: { '42': [42] } },
      { levelReq: -1 },
      { levelReq: 1.5 },
      { limit: 0 },
      { limit: 1.5 },
      { limitId: '' },
      { isSocketBound: 'true' },
      { canSocketInChakraSlots: 1 },
      { canSocketInUniqueItems: null },
      { canSocketInJewellery: 'false' },
      { canSocketInCorruptedSanctified: [] },
      { bonded: null },
      { bonded: { lines: ['effect'], statOrder: [] } },
      { bonded: { lines: ['effect'], statOrder: [1], futureRule: true } },
      { futureRule: true },
    ]) {
      expect(() =>
        parseCraftCatalog({ ...catalog, augments: [{ ...augment, ...fields }] }),
      ).toThrow()
    }
  })
})

describe('制作名称来源边界', () => {
  const nameSources = [
    ['en', 'www.pathofexile.com'],
    ['zh-CN', 'poe.game.qq.com'],
    ['zh-TW', 'pathofexile.tw'],
  ].map(([locale, host]) => ({
    locale,
    url: `https://${host}/api/trade2/data/static`,
    sha256: 'b'.repeat(64),
    fetchedAt: '2026-09-12T10:00:00.000Z',
    gameVersion: null,
  }))
  const localizedNames = {
    'zh-CN': { 'Storm Rune': '风暴符文' },
    'zh-TW': { 'Storm Rune': '暴風符文' },
  }
  const withNames = { ...catalog, localizedNames, _meta: { ...catalog._meta, nameSources } }

  it('兼容不含名称的旧目录，独立保留名称来源而不伪造 PoB 版本', () => {
    expect(parseCraftCatalog(catalog)).toBe(catalog)
    expect(parseCraftCatalog(withNames)).toBe(withNames)
    expect(parseCraftCatalog(withNames)._meta.gameVersion).toBeNull()
  })

  it('名称表必须同时有两服字符串映射与完整的三服溯源', () => {
    for (const invalid of [
      { ...withNames, localizedNames: null },
      { ...withNames, localizedNames: { 'zh-CN': {} } },
      { ...withNames, localizedNames: { ...localizedNames, 'zh-TW': { 'Storm Rune': 42 } } },
      { ...withNames, localizedNames: { ...localizedNames, 'zh-CN': { '': '风暴符文' } } },
      { ...withNames, localizedNames: { ...localizedNames, 'zh-CN': { 'Storm Rune': '' } } },
      { ...withNames, _meta: catalog._meta },
      { ...withNames, _meta: { ...catalog._meta, nameSources: nameSources.slice(1) } },
      {
        ...withNames,
        _meta: { ...catalog._meta, nameSources: [nameSources[0], nameSources[0], nameSources[2]] },
      },
    ])
      expect(() => parseCraftCatalog(invalid)).toThrow()
  })

  it('拒绝伪造源地址、无效 SHA 或抓取时间以及假定的游戏版本', () => {
    for (const fields of [
      { url: 'https://example.com/api/trade2/data/static' },
      { sha256: 'broken' },
      { fetchedAt: 'not-a-date' },
      { gameVersion: '0.5.5' },
      { locale: 'other' },
    ]) {
      expect(() =>
        parseCraftCatalog({
          ...withNames,
          _meta: {
            ...catalog._meta,
            nameSources: [{ ...nameSources[0], ...fields }, ...nameSources.slice(1)],
          },
        }),
      ).toThrow()
    }
  })
})
