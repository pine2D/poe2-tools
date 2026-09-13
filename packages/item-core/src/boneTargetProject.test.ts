import { expect, it } from 'vitest'
import { boneCatalog } from './boneTestFixture'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { DESECRATION_SOURCE } from './desecration'

const catalog = boneCatalog()
function project(): CraftProject {
  return {
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
    targetModIds: ['exclusive1'],
    targetValues: [{ modId: 'exclusive1', bounds: [{ index: 0, min: 8 }] }],
    operations: [
      { currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'] },
      { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix' },
      { kind: 'desecration-offer', modIds: ['exclusive1', 'exclusive2', 'suffix3'] },
      { kind: 'desecration-reveal', modId: 'exclusive1', values: [8] },
    ],
    cursor: 0,
  }
}
it('v24全游标恢复专属目标，v23拒绝目标注入但保留合法骨骼历史', () => {
  expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v28')
  const input = project()
  for (let cursor = 0; cursor <= input.operations.length; cursor++)
    expect(parseCraftProject(serializeCraftProject({ ...input, cursor }), catalog)).toMatchObject({
      ok: true,
      value: { project: { targetModIds: ['exclusive1'], cursor } },
    })
  for (let v = 2; v <= 23; v++)
    expect(
      parseCraftProject(
        JSON.stringify({ ...input, rulesVersion: `basic-2026-09-12-v${v}`, operations: [] }),
        catalog,
      ).ok,
    ).toBe(false)
  const { targetModIds: _, targetValues: __, ...old } = input
  expect(
    parseCraftProject(JSON.stringify({ ...old, rulesVersion: 'basic-2026-09-12-v23' }), catalog).ok,
  ).toBe(true)
  const alternativeCatalog = structuredClone(catalog)
  const special = alternativeCatalog.modifiers.find((mod) => mod.id === 'exclusive1')
  if (!special) throw new Error('missing')
  special.group = 'suffix1'
  expect(
    parseCraftProject(
      JSON.stringify({
        ...old,
        operations: [],
        targetModIds: ['suffix1'],
        targetAlternatives: [{ targetModId: 'suffix1', modIds: ['exclusive1'] }],
        rulesVersion: 'basic-2026-09-12-v23',
      }),
      alternativeCatalog,
    ).ok,
  ).toBe(false)
  expect(
    parseCraftProject(
      JSON.stringify({
        ...input,
        operations: input.operations.map((op, i) =>
          i === 3 ? { kind: 'desecration-reveal', modId: 'exclusive1', values: [99] } : op,
        ),
      }),
      catalog,
    ).ok,
  ).toBe(false)
})
