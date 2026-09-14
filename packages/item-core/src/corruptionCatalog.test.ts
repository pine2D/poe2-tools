import { expect, it } from 'vitest'
import { parseCraftCatalog } from './catalogFormat'
import { catalog } from './catalystTestFixture'
import { CORRUPTION_SOURCE, corruptionSourceHash } from './corruptionSource'

it('固定腐化目录独立保留127条、无default资格和特殊空资格，原前后缀池不混入', () => {
  const parsed = parseCraftCatalog(catalog)
  expect(corruptionSourceHash(parsed)).toBe(CORRUPTION_SOURCE.sha256)
  expect(parsed.corruptions).toHaveLength(127)
  expect(parsed.corruptions?.filter((mod) => mod.kind === 'special-corrupted')).toHaveLength(8)
  expect(
    parsed.corruptions?.find((mod) => mod.id === 'CorruptionJewelStrength1')?.eligibility,
  ).toEqual([{ tag: 'jewel', value: 1 }])
  expect(
    parsed.corruptions?.filter((mod) => !mod.eligibility.some((rule) => rule.value === 1)),
  ).toHaveLength(13)
  const normalIds = new Set(parsed.modifiers.map((mod) => mod.id))
  expect(parsed.corruptions?.some((mod) => normalIds.has(mod.id))).toBe(false)
})

it('独立字段、重复ID、假层与来源损坏不能进入腐化目录', () => {
  for (const patch of [
    { kind: 'prefix' },
    { id: catalog.modifiers[0]?.id },
    { craftedOnly: true },
    { future: 1 },
    { eligibility: [{ tag: 'weapon', value: 25 }] },
  ]) {
    const broken = structuredClone(catalog)
    if (!broken.corruptions?.[0]) throw new Error('缺少腐化数据')
    Object.assign(broken.corruptions[0], patch)
    expect(() => parseCraftCatalog(broken)).toThrow()
  }
  for (const patch of [{ sha256: '0'.repeat(64) }, { url: 'https://example.test/unknown' }]) {
    const broken = structuredClone(catalog)
    const source = broken._meta.sources.find((s) => s.path === CORRUPTION_SOURCE.path)
    if (!source) throw new Error('缺少固定来源')
    Object.assign(source, patch)
    expect(() => parseCraftCatalog(broken)).toThrow()
  }
})
