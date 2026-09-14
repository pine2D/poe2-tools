import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { inspectAlloys, parseAlloyCatalog } from './alloys'
import { alloyTestFixture } from './alloyTestFixture'
import type { CraftCatalog } from './catalog'
import { inspectModPool } from './catalog'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const input = () => JSON.parse(JSON.stringify(alloyTestFixture()))
const base = (type: string, subType?: string) => {
  const found = catalog.bases.find((b) => b.type === type && b.subType === subType)
  if (!found) throw new Error(`缺少测试基底 ${type}`)
  return found
}

describe('独立合金关系目录', () => {
  it('连接独立关系，属性只取 primary 目录，查询不扩大普通池', () => {
    const before = inspectModPool(base('Ring'), catalog.modifiers, 100)
    const table = parseAlloyCatalog(input(), catalog)
    expect(table.alloys).toHaveLength(7)
    const entries = inspectAlloys(table, catalog, base('Ring'))
    expect(entries.map((entry) => entry.alloy.name)).toEqual([
      'Runic Alloy',
      'Swift Alloy',
      'Sovereign Alloy',
    ])
    expect(entries[0]?.mod).toBe(catalog.modifiers.find((m) => m.id === 'AlloyMaximumRunicWard1'))
    expect(inspectModPool(base('Ring'), catalog.modifiers, 100)).toEqual(before)
    expect(before.some((entry) => entry.mod.id.startsWith('Alloy'))).toBe(false)
  })

  it('区分长杖和武僧长棍，不把未支持类别推定为所有武器', () => {
    const table = parseAlloyCatalog(input(), catalog)
    const staff = inspectAlloys(table, catalog, base('Staff'))
    const warstaff = inspectAlloys(table, catalog, base('Staff', 'Warstaff'))
    expect(staff.some((e) => e.mod?.id === 'AlloyCastSpeedDamageAsExtraColdHybrid1')).toBe(true)
    expect(warstaff.some((e) => e.mod?.id === 'AlloyCastSpeedDamageAsExtraColdHybrid1')).toBe(false)
    expect(warstaff.some((e) => e.mod?.id === 'AlloyBellLimit1')).toBe(true)
    expect(inspectAlloys(table, catalog, base('Charm'))).toEqual([])
    expect(inspectAlloys(table, catalog, base('Claw'))).toEqual([])
  })

  it('权杖缺失映射显式保留，不能拿旧相似属性代替', () => {
    const entries = inspectAlloys(parseAlloyCatalog(input(), catalog), catalog, base('Sceptre'))
    const adaptive = entries.find((e) => e.alloy.name === 'Adaptive Alloy')
    expect(adaptive?.mod).toBeNull()
    expect(adaptive?.reason).toContain('未对应')
    expect(entries.some((e) => e.mod?.id === 'AlloyManaNearbyAllyAttackSpeedHybrid1')).toBe(false)
  })

  it.each(['commit', 'hash', 'duplicate', 'category', 'mod', 'extra', 'unknown'])(
    '拒绝损坏关系或来源：%s',
    (kind) => {
      const value = input()
      if (kind === 'commit') value._meta.sourceCommit = 'a'.repeat(40)
      if (kind === 'hash') value._meta.modifierSource.sha256 = 'a'.repeat(64)
      if (kind === 'duplicate') value.alloys.push(value.alloys[0])
      if (kind === 'category') value.alloys[0].mappings.push(value.alloys[0].mappings[0])
      if (kind === 'mod') value.alloys[0].mappings[0].modId = 'unknown'
      if (kind === 'extra') value.alloys[0].mappings[0].weight = 100
      if (kind === 'unknown') value.alloys[0].mappings[0].category = 'Charm'
      expect(() => parseAlloyCatalog(value, catalog)).toThrow()
    },
  )

  it('主目录来源不匹配时拒绝关系表', () => {
    expect(() =>
      parseAlloyCatalog(input(), {
        ...catalog,
        _meta: { ...catalog._meta, sourceCommit: 'a'.repeat(40) },
      }),
    ).toThrow()
  })

  it('轻盾使用 Buckler 类别而非仅依据 Shield 类型', () => {
    const buckler = { ...base('Shield'), tags: ['default', 'buckler'] }
    const result = inspectAlloys(parseAlloyCatalog(input(), catalog), catalog, buckler)
    expect(result).toHaveLength(1)
    expect(result[0]?.category).toBe('Buckler')
    expect(result[0]?.mod?.id).toBe('AlloyTotemPlacementSpeed1')
  })
})
