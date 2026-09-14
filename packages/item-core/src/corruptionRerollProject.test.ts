import { expect, it } from 'vitest'
import { catalog, dictionary } from './catalystTestFixture'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'

const replacements = [
  { removeModId: 'IncreasedLife1', modId: 'IncreasedLife2', values: [25] },
  { removeModId: 'IncreasedLife2', modId: 'IncreasedLife3', values: [35] },
]
const project = {
  schemaVersion: 1,
  rulesVersion: CRAFT_RULES_VERSION,
  sourceCommit: catalog._meta.sourceCommit,
  initialState: {
    baseId: 'Gold Ring',
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
  },
  operations: [
    {
      currency: 'transmutation',
      modIds: ['IncreasedLife1'],
      rolls: [{ modId: 'IncreasedLife1', values: [19] }],
    },
    { kind: 'vaal', outcome: 'reroll', replacements },
  ],
  cursor: 2,
}
const restore = (value: unknown) => parseCraftProject(JSON.stringify(value), catalog, dictionary)

it('顺序重选项目完整回放，旧版和游标后的非法步骤不可注入', () => {
  for (const cursor of [0, 1, 2]) {
    const result = restore({ ...project, cursor })
    if (!result.ok) throw Error(result.error)
    expect(result.value.states[2]).toMatchObject({
      corrupted: true,
      rarity: 'magic',
      affixes: [{ modId: 'IncreasedLife3', lines: ['+35(30-39) to maximum Life'] }],
    })
    expect(result.value.project.operations[1]).toEqual(project.operations[1])
    expect(result.value.project.cursor).toBe(cursor)
  }
  for (let version = 2; version <= 60; version++)
    expect(
      restore({ ...project, cursor: 0, rulesVersion: `basic-2026-09-12-v${version}` }).ok,
    ).toBe(false)
  for (const changed of [
    [],
    [replacements[0], replacements[0]],
    [{ ...replacements[0], values: [999] }],
  ])
    expect(
      restore({
        ...project,
        cursor: 0,
        operations: [
          project.operations[0],
          { kind: 'vaal', outcome: 'reroll', replacements: changed },
        ],
      }).ok,
    ).toBe(false)
})
