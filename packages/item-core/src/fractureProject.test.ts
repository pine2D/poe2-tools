import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { boneCatalog } from './boneTestFixture'
import { CRAFT_RULES_VERSION, parseCraftProject, serializeCraftProject } from './craftProject'

function fixture() {
  const catalog = boneCatalog()
  required(catalog.bases[0]).socketLimit = null
  const sourceText =
    'Item Class: Helmets\nRarity: Rare\nSynthetic Name\nSynthetic Base\n--------\nItem Level: 64\n--------\n{ Prefix Modifier "prefix1" }\nprefix1 5\n{ Prefix Modifier "prefix2" }\nprefix2 5\n{ Suffix Modifier "suffix1" }\nsuffix1 5\n{ Suffix Modifier "suffix2" }\nsuffix2 5'
  const project = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: {
      baseId: 'Synthetic Base',
      itemLevel: 64,
      rarity: 'rare',
      sourceText,
      affixes: ['prefix1', 'prefix2', 'suffix1', 'suffix2'].map((modId) => ({
        modId,
        lines: [`${modId} 5`],
      })),
    },
    cursor: 1,
    operations: [{ kind: 'fracture', modId: 'prefix1' }],
  }
  return { catalog, project }
}

it('所有游标回放破裂，序列化保持true标记并拒绝非法值', () => {
  const { catalog, project } = fixture()
  for (const cursor of [0, 1]) {
    const restored = parseCraftProject(JSON.stringify({ ...project, cursor }), catalog)
    expect(restored).toMatchObject({
      ok: true,
      value: {
        states: [
          expect.anything(),
          {
            affixes: expect.arrayContaining([
              { modId: 'prefix1', lines: ['prefix1 5'], fractured: true },
            ]),
          },
        ],
      },
    })
    if (restored.ok)
      expect(parseCraftProject(serializeCraftProject(restored.value.project), catalog).ok).toBe(
        true,
      )
  }
  expect(() =>
    serializeCraftProject({
      ...project,
      initialState: {
        ...project.initialState,
        affixes: [{ modId: 'prefix1', lines: ['prefix1 5'], fractured: undefined }],
      },
    } as never),
  ).toThrow()
})

it('旧v2–27拒绝起点字段、原文标记和游标之后的新操作', () => {
  const { catalog, project } = fixture()
  for (let version = 2; version <= 27; version++) {
    const old = { ...project, rulesVersion: `basic-2026-09-12-v${version}`, cursor: 0 }
    for (const value of [
      old,
      {
        ...old,
        operations: [],
        initialState: {
          ...old.initialState,
          affixes: old.initialState.affixes.map((a, i) => (i ? a : { ...a, fractured: true })),
        },
      },
      {
        ...old,
        operations: [],
        initialState: {
          ...old.initialState,
          sourceText: `${old.initialState.sourceText}\n--------\nFractured Item`,
        },
      },
    ])
      expect(parseCraftProject(JSON.stringify(value), catalog)).toMatchObject({
        ok: false,
        error: expect.stringContaining('破裂'),
      })
  }
})

it('未来步骤不能移除锁定；破裂步骤不接受额外字段', () => {
  const { catalog, project } = fixture()
  expect(
    parseCraftProject(
      JSON.stringify({
        ...project,
        cursor: 0,
        operations: [
          ...project.operations,
          { currency: 'annulment', modIds: [], removeModId: 'prefix1' },
        ],
      }),
      catalog,
    ).ok,
  ).toBe(false)
  expect(
    parseCraftProject(
      JSON.stringify({
        ...project,
        operations: [{ kind: 'fracture', modId: 'prefix1', extra: true }],
      }),
      catalog,
    ).ok,
  ).toBe(false)
})

it('不足四词缀的已有破裂稀有来源可恢复，剥除或错配标记不能恢复', () => {
  const { catalog, project } = fixture()
  const initialState = {
    ...project.initialState,
    affixes: [{ modId: 'prefix1', lines: ['prefix1 5'], fractured: true }],
    sourceText:
      project.initialState.sourceText
        .split('{ Prefix Modifier "prefix2" }')[0]
        ?.trim()
        .replace('prefix1 5', 'prefix1 5 (fractured)') ?? '',
  }
  const saved = { ...project, initialState, cursor: 0, operations: [] }
  expect(parseCraftProject(JSON.stringify(saved), catalog).ok).toBe(true)
  expect(
    parseCraftProject(
      JSON.stringify({
        ...saved,
        initialState: { ...initialState, affixes: [{ modId: 'prefix1', lines: ['prefix1 5'] }] },
      }),
      catalog,
    ).ok,
  ).toBe(false)
  expect(
    parseCraftProject(
      JSON.stringify({ ...saved, initialState: { ...initialState, sourceText: null } }),
      catalog,
    ).ok,
  ).toBe(false)
})

it('首次候选前及Echoes两组期间插入破裂，所有游标保持选项与最终结果', () => {
  const { catalog, project } = fixture()
  const ids = ['prefix1', 'prefix2', 'prefix3']
  const initialState = {
    ...project.initialState,
    affixes: ids.map((modId) => ({ modId, lines: [`${modId} 5`] })),
    sourceText:
      'Item Class: Helmets\nRarity: Rare\nSynthetic Name\nSynthetic Base\n--------\nItem Level: 64\n--------\n' +
      ids.map((id) => `{ Prefix Modifier "${id}" }\n${id} 5`).join('\n'),
  }
  const phases = [
    { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix' },
    {
      kind: 'desecration-offer',
      modIds: ['suffix1', 'suffix2', 'suffix3'],
      revealOmen: 'abyssal_echoes',
    },
    { kind: 'desecration-reroll', modIds: ['suffix2', 'exclusive1', 'exclusive2'] },
  ]
  for (const at of [1, 2, 3]) {
    const operations = [
      ...phases.slice(0, at),
      { kind: 'fracture', modId: 'prefix1' },
      ...phases.slice(at),
      { kind: 'desecration-reveal', modId: 'suffix1', values: [8] },
    ]
    for (let cursor = 0; cursor <= operations.length; cursor++) {
      const restored = parseCraftProject(
        JSON.stringify({
          ...project,
          initialState,
          operations,
          cursor,
          desecrationSourceHash: required(catalog._meta.sources[0]).sha256,
        }),
        catalog,
      )
      expect(restored.ok).toBe(true)
      if (!restored.ok) continue
      expect(restored.value.states[at + 1]?.pendingDesecration).toEqual(
        restored.value.states[at]?.pendingDesecration,
      )
      expect(restored.value.states.at(-1)?.affixes).toEqual([
        ...initialState.affixes.map((a, i) => (i ? a : { ...a, fractured: true })),
        { modId: 'suffix1', lines: ['suffix1 8(1-10)'], desecrated: true },
      ])
    }
  }
})
