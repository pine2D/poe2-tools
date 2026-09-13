import { expect, it } from 'vitest'
import { boneCatalog } from './boneTestFixture'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { DESECRATION_SOURCE } from './desecration'

it('v26保存首次机会与重选，全游标回放且旧v25未来新操作拒绝', () => {
  const catalog = boneCatalog()
  const project: CraftProject = {
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
        boneId: 'preserved_rib',
        affixKind: 'suffix',
        directionOmen: 'dextral_necromancy',
      },
      {
        kind: 'desecration-offer',
        modIds: ['suffix3', 'suffix4', 'exclusive1'],
        revealOmen: 'abyssal_echoes',
      },
      { kind: 'desecration-reroll', modIds: ['exclusive1', 'exclusive2', 'exclusive3'] },
      { kind: 'desecration-reveal', modId: 'suffix3', values: [8] },
    ],
  }
  expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v30')
  for (let cursor = 0; cursor <= 5; cursor++) {
    const result = parseCraftProject(serializeCraftProject({ ...project, cursor }), catalog)
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.value.states[4]?.pendingDesecration).toMatchObject({
        options: ['suffix3', 'suffix4', 'exclusive1'],
        rerollOptions: ['exclusive1', 'exclusive2', 'exclusive3'],
        revealOmen: 'abyssal_echoes',
      })
  }
  expect(
    parseCraftProject(JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-12-v25' }), catalog)
      .ok,
  ).toBe(false)
})

it('旧2–25禁止首offer新字段和未来reroll，当前非法字段/外来初始pending/来源篡改拒绝', () => {
  const catalog = boneCatalog()
  const initial = {
    baseId: 'Synthetic Base',
    itemLevel: 64,
    rarity: 'normal' as const,
    affixes: [],
    sourceText: null,
  }
  const operations = [
    { currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'] },
    { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix' },
  ]
  const source = {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    desecrationSourceHash: DESECRATION_SOURCE.sha256,
    initialState: initial,
    cursor: 0,
    operations,
  }
  for (let v = 2; v <= 25; v++)
    for (const extra of [
      { revealOmen: 'abyssal_echoes' },
      { revealOmen: '' },
      { revealOmen: false },
      { revealOmen: null },
      { rerollOptions: ['suffix3', 'suffix4', 'exclusive1'] },
    ])
      expect(
        parseCraftProject(
          JSON.stringify({
            ...source,
            rulesVersion: `basic-2026-09-12-v${v}`,
            operations: [
              ...operations,
              { kind: 'desecration-offer', modIds: ['suffix3', 'suffix4', 'exclusive1'], ...extra },
            ],
          }),
          catalog,
        ).ok,
      ).toBe(false)
  const paid = {
    ...source,
    rulesVersion: CRAFT_RULES_VERSION,
    operations: [
      ...operations,
      {
        kind: 'desecration-offer',
        modIds: ['suffix3', 'suffix4', 'exclusive1'],
        revealOmen: 'abyssal_echoes',
      },
    ],
  }
  expect(parseCraftProject(JSON.stringify(paid), catalog).ok).toBe(true)
  expect(
    parseCraftProject(JSON.stringify({ ...paid, desecrationSourceHash: '0'.repeat(64) }), catalog)
      .ok,
  ).toBe(false)
  expect(
    parseCraftProject(
      JSON.stringify({
        ...paid,
        operations: [
          ...paid.operations,
          { kind: 'desecration-reroll', modIds: ['prefix1', 'exclusive1', 'exclusive2'] },
        ],
      }),
      catalog,
    ).ok,
  ).toBe(false)
  expect(
    parseCraftProject(
      JSON.stringify({
        ...paid,
        initialState: {
          ...initial,
          pendingDesecration: {
            boneId: 'preserved_rib',
            kind: 'suffix',
            options: ['suffix1', 'suffix2', 'suffix3'],
            revealOmen: 'abyssal_echoes',
          },
        },
      }),
      catalog,
    ).ok,
  ).toBe(false)
  expect(() =>
    serializeCraftProject({
      ...paid,
      operations: [
        {
          kind: 'desecration-offer',
          modIds: ['suffix3', 'suffix4', 'exclusive1'],
          revealOmen: undefined,
        },
      ],
    } as unknown as CraftProject),
  ).toThrow()
  const old = {
    ...source,
    rulesVersion: 'basic-2026-09-12-v25',
    operations: [
      ...operations,
      { kind: 'desecration-offer', modIds: ['suffix3', 'suffix4', 'exclusive1'] },
      { kind: 'desecration-reveal', modId: 'suffix3', values: [5] },
    ],
  }
  const restored = parseCraftProject(JSON.stringify(old), catalog)
  expect(restored.ok).toBe(true)
  if (restored.ok) expect(restored.value.project.rulesVersion).toBe(CRAFT_RULES_VERSION)
})
