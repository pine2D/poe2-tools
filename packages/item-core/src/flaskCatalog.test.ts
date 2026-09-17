import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import {
  type CatalogBase,
  type CatalogMod,
  hasCraftModEligibility,
  hasExistingModEligibility,
} from './catalog'
import { parseCraftCatalog } from './catalogFormat'
import { FLASK_SOURCE, flaskSourceHash } from './flaskSource'

const source = {
  commit: 'ce566eac45ea8a86477f513c7ee65a1ebe60014e',
  path: 'src/Data/ModFlask.lua',
  url: 'https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModFlask.lua',
  sha256: 'd50d074c1b7e0a57c164b7c49add1670d90ba806a25d946467e4ca7af9feb350',
}
const base: CatalogBase = {
  id: 'Lesser Life Flask',
  name: 'Lesser Life Flask',
  type: 'Flask',
  subType: 'Life',
  tags: ['default', 'flask', 'life_flask'],
  requirements: {},
  properties: {},
  implicit: null,
  implicitTags: [],
  sourceQuality: 20,
  socketLimit: null,
  hidden: false,
  runeforged: false,
  flask: { life: 50, duration: 3, chargesUsed: 10, chargesMax: 60 },
}
const ordinary: CatalogMod = {
  id: 'synthetic',
  name: 'Synthetic',
  group: 'Synthetic',
  level: 1,
  kind: 'prefix',
  lines: ['(1-10)% increased Amount Recovered'],
  statOrder: [1],
  tags: ['flask'],
  addsTags: [],
  eligibility: [{ tag: 'default', value: 1 }],
  tradeHashes: {},
}
const flask = { ...ordinary, flaskOnly: true } as CatalogMod
const catalog = () => ({
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: source.commit,
    gameVersion: null,
    generatedAt: '2026-09-17',
    weightStatus: 'unknown',
    sources: [source],
    excludedBases: [],
    excludedFlaskMods: [{ id: 'disabled', reason: '全零资格' }],
  },
  bases: [base],
  modifiers: [flask],
})
it('Flask/Item/Jewel双向隔离，不受default1与动态标签注入影响', () => {
  const jewel: CatalogBase = { ...base, id: 'Ruby', type: 'Jewel', tags: ['default', 'strjewel'] }
  delete jewel.subType
  for (const current of [base, { ...base, type: 'Ring' }, jewel]) {
    for (const mod of [ordinary, flask, { ...ordinary, jewelOnly: true as const }]) {
      const expected =
        current.type === 'Flask'
          ? mod === flask
          : current.type === 'Jewel'
            ? mod.jewelOnly === true
            : mod === ordinary
      expect(
        hasCraftModEligibility(current, mod, ['flask', 'life_flask', 'strjewel', 'default']),
      ).toBe(expected)
    }
  }
  expect(
    hasExistingModEligibility(
      { ...base, type: 'Ring', tags: ['genesis_tree_caster', 'default'] },
      { ...flask, eligibility: [{ tag: 'genesis_tree_caster', value: 1 }] },
    ),
  ).toBe(false)
})
it('药剂来源与flaskOnly标记及排除审计成对通过目录边界', () => {
  const input = catalog()
  expect(parseCraftCatalog(input)).toBe(input)
  for (const broken of [
    { ...input, _meta: { ...input._meta, sources: [] } },
    { ...input, _meta: { ...input._meta, excludedFlaskMods: undefined } },
    { ...input, _meta: { ...input._meta, sourceCommit: 'a'.repeat(40) } },
    { ...input, _meta: { ...input._meta, sources: [{ ...source, sha256: '0'.repeat(64) }] } },
    {
      ...input,
      _meta: { ...input._meta, sources: [{ ...source, url: 'https://example.test/flask' }] },
    },
    { ...input, _meta: { ...input._meta, sources: [source, source] } },
    { ...input, _meta: { ...input._meta, excludedFlaskMods: [{ id: flask.id, reason: '重复' }] } },
    { ...input, _meta: { ...input._meta, excludedFlaskMods: [{ id: 'x', reason: '' }] } },
    { ...input, modifiers: [{ ...flask, flaskOnly: false }] },
    { ...input, modifiers: [{ ...flask, jewelOnly: true }] },
    { ...input, modifiers: [{ ...flask, desecratedOnly: true }] },
    { ...input, modifiers: [{ ...flask, eligibility: [{ tag: 'default', value: 0 }] }] },
    {
      ...input,
      modifiers: [
        {
          ...flask,
          eligibility: [
            { tag: 'ring', value: 1 },
            { tag: 'default', value: 0 },
          ],
        },
      ],
    },
  ])
    expect(() => parseCraftCatalog(broken)).toThrow()
})

it('固定快照67条药剂及11条禁用审计具有独立可核对来源', () => {
  const current = parseCraftCatalog(JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')))
  expect(flaskSourceHash(current)).toBe(FLASK_SOURCE.sha256)
  const mods = current.modifiers.filter((mod) => mod.flaskOnly)
  expect(mods).toHaveLength(67)
  expect(mods.filter((mod) => mod.kind === 'prefix')).toHaveLength(43)
  expect(mods.filter((mod) => mod.kind === 'suffix')).toHaveLength(24)
  expect(
    mods.filter((mod) =>
      mod.eligibility.some((rule) => rule.tag === 'default' && rule.value === 1),
    ),
  ).toHaveLength(24)
  expect(current._meta.excludedFlaskMods).toHaveLength(11)
  for (const sources of [
    current._meta.sources.filter((entry) => entry.path !== FLASK_SOURCE.path),
    [...current._meta.sources, FLASK_SOURCE],
    current._meta.sources.map((entry) =>
      entry.path === FLASK_SOURCE.path ? { ...entry, sha256: '0'.repeat(64) } : entry,
    ),
    current._meta.sources.map((entry) =>
      entry.path === FLASK_SOURCE.path ? { ...entry, url: 'https://example.test/flask' } : entry,
    ),
  ])
    expect(flaskSourceHash({ ...current, _meta: { ...current._meta, sources } })).toBeNull()
  expect(
    flaskSourceHash({ ...current, _meta: { ...current._meta, sourceCommit: '0'.repeat(40) } }),
  ).toBeNull()
})
