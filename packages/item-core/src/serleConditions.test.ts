import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import {
  type CraftStrategyCondition,
  evaluateCraftStrategy,
  readCraftStrategy,
} from './craftStrategy'
import { addCraftAffix, type CraftResult, type CraftState, craftCandidates } from './rehearsal'
import { requiresSerleProjectVersion } from './serleProjectVersion'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const augmentId = 'pob2:augment:["Serle\'s Triumph","armour"]'
const before: CraftState = {
  baseId: 'Twig Focus',
  itemLevel: 86,
  rarity: 'rare',
  affixes: [],
  sockets: [null],
  sourceText: null,
}
const strategy = (condition: CraftStrategyCondition) => ({
  maxSteps: 20,
  rules: [{ conditions: [condition], action: { kind: 'stop' as const } }],
})
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}

it('第四空后缀只匹配实际已生效容量，七组条件在第七组后匹配', () => {
  const after = must(applyCraftStep(catalog, before, { kind: 'socket', socketIndex: 0, augmentId }))
  const open = strategy({ kind: 'open-suffix', min: 4 })
  expect(evaluateCraftStrategy(catalog, before, open, 0)).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
  expect(evaluateCraftStrategy(catalog, after, open, 0)).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
  const full = strategy({ kind: 'affix-count', min: 7 })
  let current = after
  for (const kind of [
    'prefix',
    'prefix',
    'prefix',
    'suffix',
    'suffix',
    'suffix',
    'suffix',
  ] as const) {
    expect(evaluateCraftStrategy(catalog, current, full, 0)).toMatchObject({
      ok: true,
      value: { kind: 'unmatched' },
    })
    const mod = craftCandidates(catalog, current).find((entry) => entry.kind === kind)
    if (!mod) throw Error('缺少合法候选')
    current = must(addCraftAffix(catalog, current, mod.id))
  }
  expect(evaluateCraftStrategy(catalog, current, full, 0)).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
  expect(evaluateCraftStrategy(catalog, current, open, 0)).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
  expect(before.affixes).toEqual([])
})

it('不放开第四前缀、第六后缀、九组或非整数条件', () => {
  for (const condition of [
    { kind: 'open-prefix', min: 4 },
    { kind: 'open-suffix', min: 6 },
    { kind: 'affix-count', min: 9 },
    { kind: 'affix-count', min: 6.5 },
  ] as CraftStrategyCondition[])
    expect(readCraftStrategy(strategy(condition)).ok).toBe(false)
})

it('仅含未执行嵌套扩容条件也要求 v88 与固定来源，v91 保留规则', () => {
  const augmentSourceHash = catalog._meta.sources.find(
    (source) => source.path === 'src/Data/ModRunes.lua',
  )?.sha256
  for (const leaf of [
    { kind: 'affix-count', min: 7 },
    { kind: 'open-suffix', min: 4 },
  ] as const) {
    const input = {
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: 'basic-2026-09-16-v88',
      augmentSourceHash,
      initialState: {
        baseId: 'Twig Focus',
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
        nextAffixId: 1,
      },
      operations: [],
      cursor: 0,
      targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
      orphanedTargets: [],
      strategy: strategy({ kind: 'not', condition: { kind: 'any', conditions: [leaf] } }),
    }
    expect(requiresSerleProjectVersion(input, catalog)).toBe(true)
    for (const version of ['v88', 'v91']) {
      const project = { ...input, rulesVersion: `basic-2026-09-16-${version}` }
      expect(must(loadTargetWorkbenchProject(JSON.stringify(project), catalog)).project).toEqual(
        project,
      )
    }
    expect(
      loadTargetWorkbenchProject(
        JSON.stringify({ ...input, rulesVersion: 'basic-2026-09-16-v87' }),
        catalog,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('v88') })
    expect(
      loadTargetWorkbenchProject(JSON.stringify({ ...input, augmentSourceHash: 'bad' }), catalog),
    ).toMatchObject({ ok: false, error: expect.stringContaining('来源') })
  }
})
