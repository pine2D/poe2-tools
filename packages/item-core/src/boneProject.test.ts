import { describe, expect, it } from 'vitest'
import { boneCatalog } from './boneTestFixture'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { DESECRATION_SOURCE } from './desecration'

function project(): CraftProject {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: DESECRATION_SOURCE.commit,
    initialState: {
      baseId: 'Synthetic Base',
      itemLevel: 64,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
    },
    cursor: 0,
    desecrationSourceHash: DESECRATION_SOURCE.sha256,
    operations: [
      { currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'] },
      { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix' },
      { kind: 'desecration-offer', modIds: ['suffix3', 'exclusive1', 'exclusive2'] },
      { kind: 'desecration-reveal', modId: 'exclusive1', values: [5] },
      { currency: 'annulment', modIds: [], removeModId: 'exclusive1' },
    ],
  }
}
describe('骨骼v21完整项目历史', () => {
  it('每个游标保存固定offer与来源，揭示和移除后也必须保留hash', () => {
    const source = project()
    for (let cursor = 0; cursor <= source.operations.length; cursor++) {
      const restored = parseCraftProject(
        serializeCraftProject({ ...source, cursor }),
        boneCatalog(),
      )
      expect(restored.ok).toBe(true)
      if (!restored.ok) continue
      expect(restored.value.project.rulesVersion).toBe('basic-2026-09-12-v45')
      expect(restored.value.project.cursor).toBe(cursor)
      expect(restored.value.states[3]).toMatchObject({
        pendingDesecration: { options: ['suffix3', 'exclusive1', 'exclusive2'] },
      })
      expect(restored.value.states[4]?.affixes.at(-1)).toMatchObject({
        modId: 'exclusive1',
        desecrated: true,
      })
      expect(restored.value.states[5]).not.toHaveProperty('pendingDesecration')
    }
    for (const desecrationSourceHash of [undefined, '', 'b'.repeat(64)])
      expect(
        parseCraftProject(JSON.stringify({ ...source, desecrationSourceHash }), boneCatalog()).ok,
      ).toBe(false)
  })
  it('旧v2-v20拒绝新kind及pending，未来步骤篡改不能藏在cursor之后', () => {
    const source = project()
    for (let version = 2; version <= 20; version++) {
      expect(
        parseCraftProject(
          JSON.stringify({ ...source, rulesVersion: `basic-2026-09-12-v${version}` }),
          boneCatalog(),
        ).ok,
      ).toBe(false)
      expect(
        parseCraftProject(
          JSON.stringify({
            ...source,
            operations: [],
            initialState: { ...source.initialState, pendingDesecration: null },
            rulesVersion: `basic-2026-09-12-v${version}`,
          }),
          boneCatalog(),
        ).ok,
      ).toBe(false)
    }
    for (const replacement of [
      { kind: 'desecration-offer', modIds: ['suffix3', 'suffix3', 'exclusive1'] },
      { kind: 'desecration-offer', modIds: ['prefix3', 'suffix3', 'exclusive1'] },
      { kind: 'desecration-offer', modIds: ['suffix3', 'exclusive1', 'missing'] },
      { kind: 'desecration-reveal', modId: 'exclusive1', values: [100] },
      { kind: 'desecration-reveal', modId: 'exclusive3', values: [5] },
      { kind: 'desecration-future', modIds: [] },
    ]) {
      const operations = [...source.operations]
      operations[replacement.kind === 'desecration-reveal' ? 3 : 2] = replacement as never
      expect(
        parseCraftProject(JSON.stringify({ ...source, cursor: 0, operations }), boneCatalog()).ok,
      ).toBe(false)
    }
    expect(
      parseCraftProject(
        JSON.stringify({
          ...source,
          operations: [],
          initialState: {
            ...source.initialState,
            rarity: 'rare',
            pendingDesecration: { boneId: 'preserved_rib', kind: 'suffix' },
          },
        }),
        boneCatalog(),
      ).ok,
    ).toBe(false)
    expect(
      parseCraftProject(
        JSON.stringify({
          ...source,
          operations: [],
          desecrationSourceHash: undefined,
          rulesVersion: 'basic-2026-09-12-v20',
        }),
        boneCatalog(),
      ),
    ).toMatchObject({ ok: true })
  })
  it('序列化不丢弃非法pending或操作own undefined字段', () => {
    for (const pendingDesecration of [
      undefined,
      null,
      { boneId: 'preserved_rib', kind: 'suffix', options: undefined },
    ]) {
      const source = project()
      expect(() =>
        serializeCraftProject({
          ...source,
          initialState: { ...source.initialState, pendingDesecration },
        } as never),
      ).toThrow()
    }
    for (const operation of [
      { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix', removeModId: undefined },
      { kind: 'desecration-offer', modIds: undefined },
      { kind: 'desecration-reveal', modId: 'suffix3', values: undefined },
    ])
      expect(() =>
        serializeCraftProject({ ...project(), operations: [operation] } as never),
      ).toThrow()
  })
})
