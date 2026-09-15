import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { inspectModPool } from './catalog'
import { FLUXES, type FluxCatalog, inspectFluxes, parseFluxCatalog } from './fluxes'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const input = (): FluxCatalog => JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8'))
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('测试目录缺少所需条目')
  return value
}
const base = (id: string) => {
  const found = catalog.bases.find((entry) => entry.id === id || entry.type === id)
  if (!found) throw new Error(`缺少测试基底 ${id}`)
  return found
}

describe('独立溶剂关系目录', () => {
  it('绑定三份来源，生成有向关系，元素转混沌的多对一档位保留', () => {
    const table = parseFluxCatalog(input(), catalog)
    expect(table.rows).toHaveLength(15)
    expect(FLUXES.map((flux) => [flux.name, flux.target])).toEqual([
      ['Blazing Flux', 'fire'],
      ['Chilling Flux', 'cold'],
      ['Crackling Flux', 'lightning'],
      ['Void Flux', 'chaos'],
    ])
    const entries = inspectFluxes(table, catalog, base('Ring'))
    expect(entries.filter((entry) => entry.rowId === 'equivalence-1')).toHaveLength(9)
    expect(entries.every((entry) => entry.fromElement !== entry.flux.target)).toBe(true)
    expect(entries.some((entry) => String(entry.fromElement) === 'chaos')).toBe(false)
    expect(
      entries
        .filter((entry) => entry.fromElement === 'fire' && entry.toMod?.id === 'ChaosResist4')
        .map((entry) => entry.fromMod?.id),
    ).toEqual(['FireResist4', 'FireResist5'])
    expect(entries[0]?.fromMod).toBe(catalog.modifiers.find((mod) => mod.id === 'ColdResist1'))
  })

  it('相同最大抗性文字仍区分装备、普通珠宝及范围珠宝，咒符无关系', () => {
    const table = parseFluxCatalog(input(), catalog)
    const rows = (id: string) => [
      ...new Set(inspectFluxes(table, catalog, base(id)).map((e) => e.rowId)),
    ]
    expect(rows('Shield')).toContain('equivalence-10')
    expect(rows('Shield')).not.toContain('equivalence-15')
    expect(rows('Ring')).toContain('equivalence-10')
    expect(rows('Ruby')).toEqual(['equivalence-15'])
    expect(rows('Time-Lost Ruby')).toEqual(['equivalence-14'])
    expect(rows('Timeless Jewel')).toEqual([])
    expect(rows('Charm')).toEqual([])
  })

  it('普通生成不能证明适用的装备关系仍保留并提示，不硬编码特殊来源', () => {
    const entries = inspectFluxes(parseFluxCatalog(input(), catalog), catalog, base('Ring'))
    for (const rowId of ['equivalence-10', 'equivalence-13']) {
      const unconfirmed = entries.filter((entry) => entry.rowId === rowId)
      expect(unconfirmed).toHaveLength(9)
      expect(unconfirmed.every((entry) => entry.reason?.includes('仅供关系对照'))).toBe(true)
    }
    expect(entries.find((entry) => entry.rowId === 'equivalence-1')?.reason).toBeUndefined()
  })

  it('工艺珠宝的全零资格不丢失关系，也不加入普通生成池', () => {
    const jewel = base('Time-Lost Ruby')
    const before = inspectModPool(jewel, catalog.modifiers, 100)
    const entries = inspectFluxes(parseFluxCatalog(input(), catalog), catalog, jewel)
    expect(entries).toHaveLength(9)
    expect(entries.every((entry) => entry.fromMod?.craftedOnly && entry.toMod?.craftedOnly)).toBe(
      true,
    )
    expect(inspectModPool(jewel, catalog.modifiers, 100)).toEqual(before)
    expect(before.some((entry) => entry.mod.id === 'CraftedJewelRadiusFireResistance')).toBe(false)
  })

  it('只凭同一明确关系跨普通珠宝颜色显示结果，不把转换结果当普通候选', () => {
    const jewel = base('Ruby')
    const entries = inspectFluxes(parseFluxCatalog(input(), catalog), catalog, jewel)
    expect(entries).toHaveLength(9)
    expect(entries.some((entry) => entry.toMod?.id === 'CraftedJewelMaximumChaosResistance')).toBe(
      true,
    )
    expect(entries.some((entry) => entry.toMod?.id === 'JewelMaximumColdResistance')).toBe(true)
    expect(
      inspectModPool(jewel, catalog.modifiers, 100).some(
        (e) => e.mod.id === 'JewelMaximumColdResistance',
      ),
    ).toBe(false)
  })

  it('显式缺失保留原关系并说明，不能拿同组或同数值属性补齐', () => {
    const value = input()
    required(value.rows[0]).members.cold.modId = null
    const entries = inspectFluxes(parseFluxCatalog(value, catalog), catalog, base('Ring'))
    const missing = entries.filter(
      (entry) =>
        entry.rowId === 'equivalence-1' &&
        (entry.fromElement === 'cold' || entry.flux.target === 'cold'),
    )
    expect(missing).toHaveLength(5)
    expect(missing.every((entry) => entry.reason?.includes('未对应'))).toBe(true)
    expect(missing.every((entry) => entry.fromMod === null || entry.toMod === null)).toBe(true)
  })

  it.each([
    'commit',
    'hash',
    'missing-source',
    'duplicate-source',
    'source-url',
    'extra',
    'unknown',
    'domain',
    'duplicate-row',
    'ambiguous-element',
    'wrong-element',
    'member-source',
  ])('拒绝损坏、歧义关系或不匹配来源：%s', (kind) => {
    const value = input()
    const first = required(value.rows[0])
    if (kind === 'commit') value._meta.sourceCommit = 'a'.repeat(40)
    if (kind === 'hash') required(value._meta.modifierSources[1]).sha256 = 'a'.repeat(64)
    if (kind === 'missing-source') value._meta.modifierSources.pop()
    if (kind === 'duplicate-source')
      value._meta.modifierSources[1] = required(value._meta.modifierSources[0])
    if (kind === 'source-url') value._meta.source = 'https://example.com/Blazing_Flux'
    if (kind === 'extra') Object.assign(first.members.fire, { weight: 100 })
    if (kind === 'unknown') first.members.fire.modId = 'UnknownResist'
    if (kind === 'domain') first.members.fire.domain = 'jewel'
    if (kind === 'duplicate-row') value.rows.push(first)
    if (kind === 'ambiguous-element') required(value.rows[1]).members.fire = first.members.fire
    if (kind === 'wrong-element') first.members.fire.modId = 'ColdResist1'
    if (kind === 'member-source') first.members.fire.source = 'https://example.com/mod'
    expect(() => parseFluxCatalog(value, catalog)).toThrow()
  })

  it('主目录来源与身份冲突拒绝，不能由后出现的重复 ID 覆盖', () => {
    expect(() =>
      parseFluxCatalog(input(), {
        ...catalog,
        _meta: { ...catalog._meta, sourceCommit: 'b'.repeat(40) },
      }),
    ).toThrow()
    const mod = required(catalog.modifiers.find((entry) => entry.id === 'FireResist1'))
    expect(() =>
      parseFluxCatalog(input(), { ...catalog, modifiers: [...catalog.modifiers, { ...mod }] }),
    ).toThrow()
    expect(() =>
      parseFluxCatalog(input(), {
        ...catalog,
        modifiers: catalog.modifiers.map((entry) =>
          entry.id === mod.id ? { ...entry, desecratedOnly: true } : entry,
        ),
      }),
    ).toThrow()
  })

  it('同一行不能把普通珠宝和范围珠宝拼成跨域转换', () => {
    const value = input()
    const row = required(value.rows[14])
    row.members.cold = required(value.rows[13]).members.cold
    value.rows = [row]
    expect(() => parseFluxCatalog(value, catalog)).toThrow()
  })

  it.each([0, 1, 2])('逐项验证主目录的来源 URL 和 SHA：%s', (index) => {
    const expected = required(input()._meta.modifierSources[index])
    for (const change of [{ sha256: '0'.repeat(64) }, { url: 'https://example.com/data.lua' }]) {
      const modified = {
        ...catalog,
        _meta: {
          ...catalog._meta,
          sources: catalog._meta.sources.map((source) =>
            source.path === expected.path ? { ...source, ...change } : source,
          ),
        },
      }
      expect(() => parseFluxCatalog(input(), modified)).toThrow()
    }
  })
})
