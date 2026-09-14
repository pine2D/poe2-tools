import { expect, it } from 'vitest'
import { boneCatalog } from './boneTestFixture'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { DESECRATION_SOURCE } from './desecration'

it('v25双预兆与固定三项逐游标回放，旧v24任何预兆字段拒绝', () => {
  const catalog = boneCatalog('Ring')
  const input: CraftProject = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    desecrationSourceHash: DESECRATION_SOURCE.sha256,
    initialState: {
      baseId: 'Synthetic Base',
      itemLevel: 64,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
    },
    cursor: 0,
    operations: [
      { currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'] },
      {
        kind: 'desecrate',
        boneId: 'preserved_collarbone',
        affixKind: 'suffix',
        directionOmen: 'dextral_necromancy',
        lichOmen: 'liege',
      },
      { kind: 'desecration-offer', modIds: ['exclusive1', 'exclusive2', 'exclusive3'] },
      { kind: 'desecration-reveal', modId: 'exclusive2', values: [5] },
    ],
  }
  expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v67')
  for (let cursor = 0; cursor <= 4; cursor++) {
    const result = parseCraftProject(serializeCraftProject({ ...input, cursor }), catalog)
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.value.states[3]?.pendingDesecration).toMatchObject({
        directionOmen: 'dextral_necromancy',
        lichOmen: 'liege',
        options: ['exclusive1', 'exclusive2', 'exclusive3'],
      })
  }
  expect(
    parseCraftProject(JSON.stringify({ ...input, rulesVersion: 'basic-2026-09-12-v24' }), catalog)
      .ok,
  ).toBe(false)
  const old = {
    ...input,
    operations: input.operations.map((op) =>
      'kind' in op && op.kind === 'desecrate'
        ? { kind: 'desecrate', boneId: 'preserved_collarbone', affixKind: 'suffix' }
        : op,
    ),
    rulesVersion: 'basic-2026-09-12-v24',
  }
  expect(parseCraftProject(JSON.stringify(old), catalog).ok).toBe(true)
})

it('旧版本字段存在即拒绝，v25序列化不吞undefined，future保证篡改被拒绝', () => {
  const catalog = boneCatalog('Ring')
  const initial = {
    baseId: 'Synthetic Base',
    itemLevel: 64,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
  }
  const source = {
    schemaVersion: 1,
    rulesVersion: 'basic-2026-09-12-v24',
    sourceCommit: catalog._meta.sourceCommit,
    desecrationSourceHash: DESECRATION_SOURCE.sha256,
    initialState: initial,
    cursor: 0,
    operations: [{ currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'] }],
  }
  for (let version = 2; version <= 24; version++)
    for (const key of ['directionOmen', 'lichOmen'])
      for (const value of ['', null, 'unknown'])
        expect(
          parseCraftProject(
            JSON.stringify({
              ...source,
              rulesVersion: `basic-2026-09-12-v${version}`,
              operations: [
                ...source.operations,
                {
                  kind: 'desecrate',
                  boneId: 'preserved_collarbone',
                  affixKind: 'suffix',
                  [key]: value,
                },
              ],
            }),
            catalog,
          ).ok,
        ).toBe(false)
  const operation = {
    kind: 'desecrate' as const,
    boneId: 'preserved_collarbone' as const,
    affixKind: 'suffix' as const,
    lichOmen: undefined,
  }
  expect(() =>
    serializeCraftProject({
      ...source,
      rulesVersion: CRAFT_RULES_VERSION,
      initialState: { ...initial, rarity: 'normal' },
      operations: [operation],
    } as unknown as CraftProject),
  ).toThrow()
  const sample = catalog.modifiers.find((mod) => mod.id === 'suffix4')
  if (!sample) throw new Error('fixture')
  catalog.modifiers.push({ ...sample, id: 'suffix5', group: 'suffix5' })
  const result = parseCraftProject(
    JSON.stringify({
      ...source,
      rulesVersion: CRAFT_RULES_VERSION,
      operations: [
        ...source.operations,
        {
          kind: 'desecrate',
          boneId: 'preserved_collarbone',
          affixKind: 'suffix',
          lichOmen: 'liege',
        },
        { kind: 'desecration-offer', modIds: ['suffix3', 'suffix4', 'suffix5'] },
      ],
    }),
    catalog,
  )
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error).toContain('候选')
})
