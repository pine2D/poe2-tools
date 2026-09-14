import { expect, it } from 'vitest'
import {
  hasCraftModEligibility,
  hasExistingModEligibility,
  hasGenesisModEligibility,
} from './catalog'
import { parseCraftCatalog } from './catalogFormat'
import { JEWEL_SOURCE } from './jewels'
import { jewelFixture } from './jewelTestFixture'
import { LIQUID_EMOTION_SOURCE } from './liquidEmotions'

it('范围词缀按基底身份隔离，动态标签不能跨普通珠宝或装备域', () => {
  const { catalog, base } = jewelFixture()
  const ordinary = catalog.modifiers[0]
  if (!ordinary) throw new Error('缺少合成珠宝词缀')
  const radius = {
    ...ordinary,
    radiusJewelOnly: true as const,
    eligibility: [
      { tag: 'int_radius_jewel', value: 1 as const },
      { tag: 'default', value: 0 as const },
    ],
  }
  const timeLost = {
    ...base,
    id: 'Time-Lost Sapphire',
    name: 'Time-Lost Sapphire',
    subType: 'Radius',
    tags: ['default', 'jewel', 'radius_jewel', 'int_radius_jewel'],
  }
  expect(hasCraftModEligibility(timeLost, radius)).toBe(true)
  expect(hasExistingModEligibility(timeLost, radius)).toBe(true)
  expect(hasCraftModEligibility(base, radius, ['int_radius_jewel'])).toBe(false)
  expect(hasCraftModEligibility(timeLost, ordinary, base.tags)).toBe(false)
  expect(hasCraftModEligibility({ ...timeLost, type: 'Helmet' }, radius)).toBe(false)
  expect(hasCraftModEligibility({ ...timeLost, id: 'Timeless Jewel' }, radius)).toBe(false)
})

it('范围身份需要 jewelOnly 且不得混入工艺或亵渎声明', () => {
  const { catalog } = jewelFixture()
  catalog._meta.excludedJewelMods = []
  catalog._meta.sources = [JEWEL_SOURCE]
  const original = catalog.modifiers[0]
  if (!original) throw new Error('缺少合成珠宝词缀')
  const mod = {
    ...original,
    radiusJewelOnly: true,
    eligibility: [
      { tag: 'radius_jewel', value: 1 },
      { tag: 'jewel', value: 0 },
      { tag: 'default', value: 0 },
    ],
  }
  const valid = { ...catalog, modifiers: [mod] }
  expect(parseCraftCatalog(valid)).toEqual(valid)
  for (const extra of [
    { radiusJewelOnly: false },
    { jewelOnly: undefined },
    { craftedOnly: true },
    { desecratedOnly: true },
  ])
    expect(() => parseCraftCatalog({ ...valid, modifiers: [{ ...mod, ...extra }] })).toThrow()
})

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

function craftedFixture() {
  const { catalog, base } = jewelFixture()
  catalog._meta.sources = [JEWEL_SOURCE, LIQUID_EMOTION_SOURCE]
  catalog._meta.excludedJewelMods = []
  const mod = catalog.modifiers[0]
  if (!mod) throw new Error('缺少合成珠宝词缀')
  mod.craftedOnly = true
  mod.eligibility = [
    { tag: 'jewel', value: 0 },
    { tag: 'default', value: 0 },
  ]
  catalog.liquidEmotions = [
    {
      id: 'Metadata/Items/Currency/DistilledEmotion11',
      name: '合成材料',
      radiusJewel: false,
      tierLevel: 3,
      mods: { Ruby: {}, Sapphire: { [mod.kind]: mod.id }, Emerald: {}, Diamond: {} },
    },
  ]
  const emotion = catalog.liquidEmotions[0]
  if (!emotion) throw new Error('缺少合成材料')
  return { catalog, base, mod, emotion }
}

it('工艺专属珠宝声明要求双来源、全零资格和精确非范围侧别引用', () => {
  const fixture = craftedFixture()
  expect(parseCraftCatalog(fixture.catalog)).toEqual(fixture.catalog)
  const changes: ((value: typeof fixture) => void)[] = [
    ({ mod }) => {
      delete mod.jewelOnly
    },
    ({ mod }) => {
      Object.assign(mod, { craftedOnly: false })
    },
    ({ mod }) => {
      Object.assign(mod, { craftedOnly: undefined })
    },
    ({ mod }) => {
      Object.assign(mod, { craftedOnly: 'true' })
    },
    ({ mod }) => {
      Object.assign(mod, { nodeType: 1 })
    },
    ({ mod }) => {
      mod.eligibility.push({ tag: 'intjewel', value: 1 })
    },
    ({ emotion }) => {
      emotion.radiusJewel = true
    },
    ({ emotion }) => {
      emotion.mods.Sapphire = {}
    },
    ({ emotion, mod }) => {
      emotion.mods.Sapphire = { suffix: mod.id }
    },
    ({ emotion, mod }) => {
      emotion.mods.Ruby = { suffix: mod.id }
    },
    ({ catalog }) => {
      catalog._meta.sources = [JEWEL_SOURCE]
      delete catalog.liquidEmotions
    },
    ({ catalog }) => {
      catalog._meta.sources = [LIQUID_EMOTION_SOURCE]
    },
    ({ catalog }) => {
      catalog._meta.sources[1] = { ...LIQUID_EMOTION_SOURCE, sha256: 'a'.repeat(64) }
    },
  ]
  for (const mutate of changes) {
    const invalid = structuredClone(fixture)
    mutate(invalid)
    expect(() => parseCraftCatalog(invalid.catalog)).toThrow()
  }
})

it('工艺专属身份即使被注入正向标签也不能走普通或已有身份入口', () => {
  const { base, mod } = craftedFixture()
  mod.eligibility = [{ tag: 'default', value: 1 }]
  expect(hasCraftModEligibility(base, mod)).toBe(false)
  expect(hasExistingModEligibility(base, mod)).toBe(false)
  const genesisBase = { ...base, type: 'Ring', tags: ['genesis_tree_caster'] }
  mod.eligibility = [{ tag: 'genesis_tree_caster', value: 1 }]
  expect(hasGenesisModEligibility(genesisBase, mod)).toBe(false)
  expect(hasExistingModEligibility(genesisBase, mod)).toBe(false)
})
