import { expect, it } from 'vitest'
import { boneCatalog } from './boneTestFixture'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { analyzeCraftTargets } from './targets'

function fixture(): CraftProject {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: boneCatalog()._meta.sourceCommit,
    initialState: {
      baseId: 'Synthetic Base',
      itemLevel: 64,
      rarity: 'normal',
      sourceText: null,
      affixes: [],
    },
    operations: [
      {
        currency: 'alchemy',
        modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'],
        rolls: ['prefix1', 'prefix2', 'suffix1', 'suffix2'].map((modId) => ({
          modId,
          values: [5],
        })),
      },
      { kind: 'fracture', modId: 'prefix1' },
    ],
    cursor: 0,
    targetModIds: ['prefix1'],
    targetFracturedModId: 'prefix1',
  }
}

it('全游标保存目标并回放完整历史，只有破裂后完成', () => {
  const catalog = boneCatalog()
  for (const cursor of [0, 1, 2]) {
    const result = parseCraftProject(serializeCraftProject({ ...fixture(), cursor }), catalog)
    expect(result).toMatchObject({
      ok: true,
      value: {
        project: { targetFracturedModId: 'prefix1', cursor },
        states: [
          {},
          {},
          {
            affixes: expect.arrayContaining([
              expect.objectContaining({ modId: 'prefix1', fractured: true }),
            ]),
          },
        ],
      },
    })
    if (!result.ok) continue
    expect(
      result.value.states.map((state) => {
        const advice = analyzeCraftTargets(
          catalog,
          state,
          ['prefix1'],
          [],
          [],
          undefined,
          [],
          'prefix1',
        )
        return advice.ok && advice.value.targets[0]?.matched
      }),
    ).toEqual([false, false, true])
    expect(parseCraftProject(serializeCraftProject(result.value.project), catalog)).toEqual(result)
  }
})

it('非法字段类型、空值、未选主目标以及 undefined 自有键不能静默序列化', () => {
  for (const targetFracturedModId of [
    undefined,
    null,
    false,
    '',
    [],
    {},
    1,
    'missing',
    'suffix1',
  ]) {
    const project = { ...fixture(), targetFracturedModId }
    expect(() => serializeCraftProject(project as never)).toThrow()
    if (targetFracturedModId !== undefined)
      expect(parseCraftProject(JSON.stringify(project), boneCatalog()).ok).toBe(false)
  }
})

it('合法但锁错组或锁错值的项目保留要求，游标后非法操作仍拒绝', () => {
  const catalog = boneCatalog()
  for (const modId of ['prefix1', 'suffix1']) {
    const project = {
      ...fixture(),
      targetValues: [{ modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }],
      operations: [fixture().operations[0], { kind: 'fracture', modId }],
      cursor: 0,
    }
    const result = parseCraftProject(JSON.stringify(project), catalog)
    expect(result).toMatchObject({
      ok: true,
      value: {
        project: {
          targetFracturedModId: 'prefix1',
          targetValues: [{ modId: 'prefix1', bounds: [{ min: 8 }] }],
        },
      },
    })
    expect(
      parseCraftProject(
        JSON.stringify({
          ...project,
          operations: [
            ...project.operations,
            { currency: 'annulment', modIds: [], removeModId: modId },
          ],
        }),
        catalog,
      ).ok,
    ).toBe(false)
  }
})

it('v2–28 无新字段核对升级，任何新字段注入拒绝且序列化不吞 undefined', () => {
  for (let version = 2; version <= 28; version++) {
    const { targetFracturedModId: _, ...plain } = fixture()
    const old = { ...plain, operations: [], rulesVersion: `basic-2026-09-12-v${version}` }
    expect(parseCraftProject(JSON.stringify(old), boneCatalog())).toMatchObject({
      ok: true,
      value: { project: { rulesVersion: CRAFT_RULES_VERSION } },
    })
    for (const targetFracturedModId of [undefined, null, '', false, 'prefix1']) {
      const injected = { ...old, targetFracturedModId }
      expect(() => serializeCraftProject(injected as never)).toThrow()
      if (targetFracturedModId !== undefined)
        expect(parseCraftProject(JSON.stringify(injected), boneCatalog())).toMatchObject({
          ok: false,
          error: expect.stringContaining('破裂'),
        })
    }
  }
})
