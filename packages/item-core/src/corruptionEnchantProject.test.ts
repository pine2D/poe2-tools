import { expect, it } from 'vitest'
import { catalog, dictionary } from './catalystTestFixture'
import { CORRUPTION_SOURCE } from './corruptionSource'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import type { CraftState } from './rehearsal'

const initial: CraftState = {
  baseId: 'Crude Bow',
  itemLevel: 86,
  rarity: 'normal',
  quality: 20,
  sourceText: null,
  affixes: [],
  sockets: [],
}
const project = {
  schemaVersion: 1,
  rulesVersion: CRAFT_RULES_VERSION,
  sourceCommit: catalog._meta.sourceCommit,
  augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')?.sha256,
  corruptionSourceHash: CORRUPTION_SOURCE.sha256,
  initialState: initial,
  operations: [
    {
      kind: 'vaal',
      outcome: 'enchant',
      modId: 'CorruptionLocalAddedChaosDamage1',
      values: [7, 12],
    },
  ],
  cursor: 1,
}
const restore = (value: unknown) => parseCraftProject(JSON.stringify(value), catalog, dictionary)
it('强化项目完整游标回放，恢复来源指纹与独立层', () => {
  for (const cursor of [0, 1]) {
    const result = restore({ ...project, cursor })
    if (!result.ok) throw Error(result.error)
    expect(result.value.states[1]?.corruption).toEqual({
      modId: 'CorruptionLocalAddedChaosDamage1',
      lines: ['Adds 7(7-11) to 12(12-18) Chaos damage'],
    })
    expect(result.value.project.corruptionSourceHash).toBe(CORRUPTION_SOURCE.sha256)
    expect(result.value.project.cursor).toBe(cursor)
  }
  for (const hash of [undefined, '0'.repeat(64)])
    expect(restore({ ...project, corruptionSourceHash: hash }).ok).toBe(false)
  for (let version = 2; version <= 59; version++)
    expect(
      restore({ ...project, cursor: 0, rulesVersion: `basic-2026-09-12-v${version}` }).ok,
    ).toBe(false)
  expect(
    restore({
      ...project,
      cursor: 0,
      operations: [...project.operations, { kind: 'vaal', outcome: 'unchanged' }],
    }).ok,
  ).toBe(false)
})
