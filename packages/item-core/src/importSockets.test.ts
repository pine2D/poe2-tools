import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { importCraftState, importSocketCount } from './rehearsalImport'

const hash = 'c'.repeat(64)
const runeId = 'test-fire'
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'test',
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    excludedBases: [],
    sources: [{ path: 'src/Data/ModRunes.lua', url: 'https://example.test/source', sha256: hash }],
  },
  bases: [
    {
      id: 'Test Helmet',
      name: 'Test Helmet',
      type: 'Helmet',
      tags: ['default'],
      requirements: {},
      properties: {},
      implicit: null,
      implicitTags: [],
      sourceQuality: null,
      socketLimit: 3,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: [],
  augments: [
    {
      id: runeId,
      name: 'Lesser Desert Rune',
      category: 'armour',
      type: 'Rune',
      localMod: false,
      lines: ['+10% to Fire Resistance'],
      statOrder: [1],
      tradeHashes: {},
      levelReq: 0,
    },
  ],
}
const raw = 'Item Class: Helmets\nRarity: Normal\nTest Helmet\n--------\nItem Level: 46'
function item(text = raw) {
  const parsed = parseItem(text)
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.item
}
function run(text = raw, sockets?: readonly (string | null)[], source = catalog) {
  const parsed = item(text)
  return importCraftState(
    source,
    'Test Helmet',
    parsed,
    inspectItem(parsed, {
      items: { bases: { 'Test Helmet': '测试头盔' }, uniques: {} },
    }),
    sockets,
  )
}

describe('导入孔位的独立核对声明', () => {
  it('缺行只返回未知；声明零孔与未声明状态分开', () => {
    expect(importSocketCount(item())).toEqual({ ok: true, value: null })
    expect(run()).toMatchObject({ ok: true })
    const unknown = run()
    if (unknown.ok) expect(unknown.value.sockets).toBeUndefined()
    expect(run(raw, [])).toMatchObject({ ok: true, value: { sockets: [], sourceText: raw } })
  })
  it.each(['Sockets: S S', '插槽: S S', '插槽連線： S S'])('只读取 %s 个数，不推断为空', (line) => {
    const text = `${raw}\n--------\n${line}`
    expect(importSocketCount(item(text))).toEqual({ ok: true, value: 2 })
    expect(run(text).ok).toBe(false)
    expect(run(text, [null, runeId])).toMatchObject({
      ok: true,
      value: { sockets: [null, runeId] },
    })
    expect(run(text, [null]).ok).toBe(false)
    expect(run(text, []).ok).toBe(false)
  })
  it.each([
    'Sockets:',
    'Sockets: A',
    'Sockets: s',
    'Sockets: S-S',
    'Sockets: S extra',
    'Sockets: S\nSockets: S',
  ])('畸形或重复行 %s 不得被声明覆盖', (line) => {
    const text = `${raw}\n--------\n${line}`
    expect(importSocketCount(item(text)).ok).toBe(false)
    expect(run(text, [null]).ok).toBe(false)
  })
  it('缺行可声明已有符文，状态独立复制且原文不插入虚构行', () => {
    const sockets = [runeId, null]
    const result = run(raw, sockets)
    expect(result).toMatchObject({ ok: true, value: { sockets: [runeId, null], sourceText: raw } })
    if (!result.ok) return
    sockets[0] = null
    expect(result.value.sockets).toEqual([runeId, null])
    result.value.sockets?.push(null)
    expect(sockets).toEqual([null, null])
  })
  it.each([[null, null, null], ['unknown'], [''], [12], null].map((sockets) => ({ sockets })))(
    '拒绝超限或无效声明 $sockets',
    ({ sockets }) => {
      expect(run(raw, sockets as (string | null)[]).ok).toBe(false)
    },
  )
  it('未支持符文即使存在于目录也不开放', () => {
    const source = structuredClone(catalog)
    if (!source.augments?.[0]) throw new Error('缺少符文')
    source.augments[0].name = 'Unknown Rune'
    expect(run(raw, [runeId], source).ok).toBe(false)
  })
  it('零孔也须核对目录来源与已支持基底容量', () => {
    for (const patch of [
      { _meta: { ...catalog._meta, sources: [] } },
      {
        _meta: {
          ...catalog._meta,
          sources: [{ path: 'src/Data/ModRunes.lua', url: '', sha256: 'bad' }],
        },
      },
      { augments: [] },
      { bases: catalog.bases.map((base) => ({ ...base, runeforged: true })) },
    ])
      expect(run(raw, [], { ...catalog, ...patch }).ok).toBe(false)
    expect(
      run(raw, [], {
        ...catalog,
        bases: catalog.bases.map((base) => ({ ...base, type: 'Focus' })),
      }).ok,
    ).toBe(true)
    const missingAugments = structuredClone(catalog)
    delete missingAugments.augments
    expect(run(raw, [], missingAugments).ok).toBe(false)
  })
  it('腐化来源保留状态并允许核对已有普通孔', () => {
    expect(run(`${raw}\n--------\nCorrupted`, [runeId])).toMatchObject({
      ok: true,
      value: { corrupted: true, sockets: [runeId] },
    })
  })
  it.each([
    `${raw}\n--------\nMirrored`,
    `${raw}\n--------\nUnidentified`,
    raw.replace('Rarity: Normal', 'Rarity: Unique'),
    raw.replace('Helmets', 'Charms'),
    raw.replace('Item Level: 46', ''),
    `${raw}\n--------\nItem Level: 46`,
    `${raw}\n--------\nUnknown Property`,
    `${raw}\n--------\n+10% to Cold Resistance (rune)`,
    `${raw}\n--------\n{ Rune Modifier }\n+10% to Cold Resistance`,
    `${raw}\n--------\n{ Fractured Prefix Modifier }\n+10 to maximum Life`,
    `${raw}\n--------\nGrants Skill: Test Skill`,
  ])('声明不能绕过原文特殊状态 %s', (text) => {
    expect(run(text, []).ok).toBe(false)
    expect(run(text, [null]).ok).toBe(false)
  })
  it('没有声明时也不能丢弃授予技能进入演练', () => {
    expect(run(`${raw}\n--------\nGrants Skill: Test Skill`).ok).toBe(false)
  })
  it('零孔不能绕过固有特殊孔位规则', () => {
    const source = structuredClone(catalog)
    if (!source.bases[0]) throw new Error('缺少基底')
    source.bases[0].implicit = 'Has 1 additional Rune Socket'
    const text = `${raw}\n--------\n{ Implicit Modifier }\nHas 1 additional Rune Socket`
    expect(run(text, [], source).ok).toBe(false)
  })
  it('核对声明保留完整显式词缀，未知词缀及特殊词缀头仍拒绝', () => {
    const source = structuredClone(catalog)
    source.modifiers = [
      {
        id: 'life',
        kind: 'prefix',
        name: 'Test',
        group: 'life',
        level: 1,
        lines: ['+(10-20) to maximum Life'],
        statOrder: [1],
        tags: ['life'],
        addsTags: [],
        eligibility: [{ tag: 'default', value: 1 }],
        tradeHashes: {},
      },
    ]
    const text = `${raw.replace('Rarity: Normal', 'Rarity: Rare')}\n--------\n{ Prefix Modifier "Test" (Tier: 1) — Life }\n+14(10-20) to maximum Life`
    expect(run(text, [runeId], source)).toMatchObject({
      ok: true,
      value: {
        rarity: 'rare',
        affixes: [{ modId: 'life', lines: ['+14(10-20) to maximum Life'] }],
        sockets: [runeId],
        sourceText: text,
      },
    })
    expect(run(text.replace('maximum Life', 'unknown stat'), [runeId], source).ok).toBe(false)
    expect(
      run(text.replace('Prefix Modifier', 'Fractured Prefix Modifier'), [runeId], source),
    ).toMatchObject({
      ok: true,
      value: {
        affixes: [{ modId: 'life', lines: ['+14(10-20) to maximum Life'], fractured: true }],
        sockets: [runeId],
      },
    })
  })
})
