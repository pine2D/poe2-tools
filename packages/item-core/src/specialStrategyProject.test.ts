import { expect, it } from 'vitest'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { DESECRATION_SOURCE } from './desecration'
import { essenceHash, essenceId, specialCatalog } from './specialStrategyFixture'

const project: CraftProject = {
  schemaVersion: 1,
  rulesVersion: CRAFT_RULES_VERSION,
  sourceCommit: specialCatalog()._meta.sourceCommit,
  initialState: {
    baseId: 'Synthetic Base',
    itemLevel: 64,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
  },
  operations: [],
  cursor: 0,
  strategy: {
    maxSteps: 20,
    rules: [
      { conditions: [{ kind: 'rarity', value: 'magic' }], action: { kind: 'essence', essenceId } },
    ],
  },
  essenceSourceHash: essenceHash,
}
it('尚未操作的特殊策略必须校验材料来源和目录身份', () => {
  const source = specialCatalog()
  expect(parseCraftProject(serializeCraftProject(project), source).ok).toBe(true)
  for (const essenceSourceHash of [undefined, 'c'.repeat(64)])
    expect(parseCraftProject(JSON.stringify({ ...project, essenceSourceHash }), source).ok).toBe(
      false,
    )
  const missing = { ...source, essences: [] }
  expect(parseCraftProject(JSON.stringify(project), missing).ok).toBe(false)
  const bone = {
    ...project,
    strategy: {
      maxSteps: 20,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'reveal' } }],
    },
  }
  expect(parseCraftProject(JSON.stringify(bone), source).ok).toBe(false)
  expect(
    parseCraftProject(
      JSON.stringify({ ...bone, desecrationSourceHash: DESECRATION_SOURCE.sha256 }),
      source,
    ).ok,
  ).toBe(true)
})
it('v39拒绝新增动作及条件，合法通货规则可升级', () => {
  expect(
    parseCraftProject(
      JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-12-v39' }),
      specialCatalog(),
    ).ok,
  ).toBe(false)
  for (const condition of [
    { kind: 'affix-count', min: 4 },
    { kind: 'desecration-stage', value: 'unrevealed' },
  ])
    expect(
      parseCraftProject(
        JSON.stringify({
          ...project,
          rulesVersion: 'basic-2026-09-12-v39',
          strategy: {
            maxSteps: 20,
            rules: [{ conditions: [condition], action: { kind: 'stop' } }],
          },
        }),
        specialCatalog(),
      ).ok,
    ).toBe(false)
  const legacy = {
    ...project,
    rulesVersion: 'basic-2026-09-12-v39',
    strategy: {
      maxSteps: 20,
      rules: [
        {
          conditions: [{ kind: 'always' }],
          action: { kind: 'currency', currency: 'transmutation' },
        },
      ],
    },
  }
  expect(parseCraftProject(JSON.stringify(legacy), specialCatalog()).ok).toBe(true)
})
