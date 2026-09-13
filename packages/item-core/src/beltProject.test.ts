import { expect, it } from 'vitest'
import { beltCatalog, beltSource, beltState } from './beltTestFixture'
import { boneCatalog } from './boneTestFixture'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { DESECRATION_SOURCE } from './desecration'
import { importCraftState } from './rehearsalImport'

function project(): CraftProject {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: beltCatalog()._meta.sourceCommit,
    initialState: beltState(),
    cursor: 0,
    operations: [{ currency: 'divine', modIds: [], rolls: [], implicitValues: [2, 15] }],
  }
}
it('v22搜索槽数起点与全游标历史回读，future越界不能隐藏', () => {
  expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v38')
  for (const cursor of [0, 1]) {
    const result = parseCraftProject(serializeCraftProject({ ...project(), cursor }), beltCatalog())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.states[1]?.implicitLines?.[0]).toBe('Has 2(1-2) Charm Slot')
  }
  expect(
    parseCraftProject(
      JSON.stringify({
        ...project(),
        operations: [{ currency: 'divine', modIds: [], rolls: [], implicitValues: [3, 15] }],
      }),
      beltCatalog(),
    ).ok,
  ).toBe(false)
  for (const initialState of [
    { ...beltState(), implicitLines: undefined },
    { ...beltState(), itemLevel: 29 },
    {
      ...beltState(),
      implicitLines: ['Has 1(1-2) Charm Slot', '15(10-20)% increased Flask Charges gained'],
    },
  ])
    expect(
      parseCraftProject(JSON.stringify({ ...project(), initialState }), beltCatalog()).ok,
    ).toBe(false)
  expect(
    parseCraftProject(
      JSON.stringify({ ...project(), rulesVersion: 'basic-2026-09-12-v21' }),
      beltCatalog(),
    ).ok,
  ).toBe(false)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s来源保存旧cap及完整历史，删除字段或篡改不能恢复',
  (locale) => {
    const source = beltSource(locale)
    const catalog = beltCatalog()
    const imported = importCraftState(
      catalog,
      'Synthetic Base',
      source.item,
      source.inspection,
      undefined,
      undefined,
      source.dictionary.stats?.entries,
    )
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    const value = { ...project(), initialState: imported.value }
    for (const cursor of [0, 1]) {
      const restored = parseCraftProject(
        serializeCraftProject({ ...value, cursor }),
        catalog,
        source.dictionary,
      )
      expect(restored.ok).toBe(true)
      if (restored.ok)
        expect(restored.value.states[1]?.implicitLines?.[0]).toBe('Has 2(1-2) Charm Slot')
    }
    for (const initialState of [
      { ...imported.value, implicitLines: undefined },
      { ...imported.value, itemLevel: 79 },
      {
        ...imported.value,
        implicitLines: ['Has 2(1-3) Charm Slot', '15(10-20)% increased Flask Charges gained'],
      },
    ])
      expect(
        parseCraftProject(JSON.stringify({ ...value, initialState }), catalog, source.dictionary)
          .ok,
      ).toBe(false)
  },
)

it('合法v21骨骼及旧无特殊容量腰带仍可升级，不绕过Genesis-only错误资格', () => {
  const catalog = boneCatalog()
  const initialState = {
    baseId: 'Synthetic Base',
    itemLevel: 64,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
  }
  const value = {
    ...project(),
    rulesVersion: 'basic-2026-09-12-v21',
    initialState,
    desecrationSourceHash: DESECRATION_SOURCE.sha256,
    operations: [
      { currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'] },
      { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix' },
    ],
  }
  expect(parseCraftProject(JSON.stringify(value), catalog)).toMatchObject({
    ok: true,
    value: { project: { rulesVersion: CRAFT_RULES_VERSION } },
  })
  expect(
    parseCraftProject(JSON.stringify({ ...value, operations: [] }), boneCatalog('Belt')).ok,
  ).toBe(true)
})
