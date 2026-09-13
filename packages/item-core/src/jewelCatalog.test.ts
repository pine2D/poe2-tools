import { expect, it } from 'vitest'
import { parseCraftCatalog } from './catalogFormat'
import { JEWEL_SOURCE } from './jewels'
import { jewelFixture } from './jewelTestFixture'

it('珠宝标记要求唯一固定来源及无重叠排除审计', () => {
  const { catalog } = jewelFixture()
  catalog._meta.sources = [JEWEL_SOURCE]
  catalog._meta.excludedJewelMods = [{ id: 'excluded', reason: '范围珠宝' }]
  expect(parseCraftCatalog(catalog)).toEqual(catalog)
  const variants = [
    { ...catalog, _meta: { ...catalog._meta, sources: [] } },
    {
      ...catalog,
      _meta: { ...catalog._meta, sources: [{ ...JEWEL_SOURCE, sha256: 'a'.repeat(64) }] },
    },
    { ...catalog, _meta: { ...catalog._meta, sources: [JEWEL_SOURCE, JEWEL_SOURCE] } },
    {
      ...catalog,
      _meta: { ...catalog._meta, excludedJewelMods: [{ id: 'prefix1', reason: '冲突' }] },
    },
    { ...catalog, modifiers: [{ ...catalog.modifiers[0], jewelOnly: false }] },
    { ...catalog, modifiers: [{ ...catalog.modifiers[0], desecratedOnly: true }] },
  ]
  for (const invalid of variants) expect(() => parseCraftCatalog(invalid)).toThrow()
})
