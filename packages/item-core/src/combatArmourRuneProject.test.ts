import { expect, it } from 'vitest'
import { catalog, dictionary } from './catalystTestFixture'
import { collectCraftCosts } from './craftCosts'
import { exportCraftItemText } from './craftItemText'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { essenceSourceHash } from './essences'
import { inspectItem } from './export'
import { parseItem } from './parse'
import type { CraftResult } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { statScalabilitySourceHash } from './statScalability'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const version = 'basic-2026-09-16-v80'
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function project() {
  return {
    schemaVersion: 1,
    rulesVersion: version,
    sourceCommit: catalog._meta.sourceCommit,
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    initialState: {
      baseId: 'Rusted Greathelm',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      nextAffixId: 1,
      sourceText: null,
      sockets: [],
      quality: 0,
    },
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
    operations: [
      { kind: 'artificer' },
      { kind: 'socket', socketIndex: 0, augmentId: id('Tempered Rune') },
      { kind: 'socket', socketIndex: 0, augmentId: id('Greater Rune of Tithing') },
    ],
    cursor: 3,
  }
}
const read = (p: unknown) => parseTargetCraftProject(JSON.stringify(p), catalog, dictionary)

it('v80完整回放镶入和覆盖，每游标费用不返还，序列化可恢复', () => {
  for (const cursor of [0, 1, 2, 3]) {
    const result = must(read({ ...project(), cursor }))
    expect(result.states[cursor]?.sockets).toEqual(
      [[], [null], [id('Tempered Rune')], [id('Greater Rune of Tithing')]][cursor],
    )
    const costs = must(collectCraftCosts(catalog, result.project.operations.slice(0, cursor)))
    expect(costs.reduce((sum, c) => sum + c.count, 0)).toBe(cursor)
    const text = must(serializeTargetCraftProject(result.project, catalog, dictionary))
    expect(must(loadTargetWorkbenchProject(text, catalog, dictionary)).project).toEqual(
      result.project,
    )
  }
})

it('v79及更早拒绝起点、声明、未来步骤及未命中指引夹带新效果', () => {
  const saved = must(read(project()))
  const final = saved.states.at(-1)
  if (!final) throw Error('缺少终态')
  const text = must(exportCraftItemText(catalog, final)).text
  const parsed = parseItem(text)
  if (!parsed.ok) throw Error('无法解析导出')
  const imported = must(
    importIdentifiedCraftState(
      catalog,
      final.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      final.sockets,
      undefined,
      dictionary.stats?.entries,
    ),
  )
  const plain = { ...project(), operations: [], cursor: 0 }
  const patches = [
    { initialState: imported, importedSockets: final.sockets },
    { operations: project().operations },
    {
      strategy: {
        maxSteps: 10,
        rules: [
          { conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
          {
            conditions: [{ kind: 'always' }],
            action: {
              kind: 'socket',
              socketIndex: 'first-empty',
              augmentId: id('Greater Rune of Leadership'),
            },
          },
        ],
      },
    },
  ]
  for (const patch of patches) {
    const current = { ...plain, ...patch }
    expect(read(current).ok).toBe(true)
    for (const old of [
      'basic-2026-09-12-v74',
      'basic-2026-09-12-v75',
      'basic-2026-09-16-v76',
      'basic-2026-09-16-v77',
      'basic-2026-09-16-v78',
      'basic-2026-09-16-v79',
    ]) {
      expect(read({ ...current, rulesVersion: old })).toMatchObject({
        ok: false,
        error: expect.stringContaining('v80'),
      })
    }
  }
  const legacy = {
    ...plain,
    rulesVersion: 'basic-2026-09-12-v72',
    operations: project().operations,
  }
  expect(parseCraftProject(JSON.stringify(legacy), catalog, dictionary)).toMatchObject({
    ok: false,
    error: expect.stringContaining('v80'),
  })
  expect(read({ ...project(), augmentSourceHash: '0'.repeat(64) }).ok).toBe(false)
})

it('沿用新镶嵌指引升级旧项目，保留接收历史；沿用旧指引不降级v80', () => {
  const current = {
    ...project(),
    rulesVersion: 'basic-2026-09-12-v74',
    operations: [{ kind: 'artificer' }],
    cursor: 1,
  }
  const template = {
    ...project(),
    operations: [],
    cursor: 0,
    strategy: {
      maxSteps: 4,
      rules: [
        {
          conditions: [{ kind: 'always' }],
          action: {
            kind: 'socket',
            socketIndex: 'first-empty',
            augmentId: id('Greater Rune of Alacrity'),
          },
        },
      ],
    },
  }
  const next = must(
    reuseTargetCraftPlan(JSON.stringify(current), JSON.stringify(template), catalog, dictionary),
  )
  expect(next.project.rulesVersion).toBe(version)
  expect(next.project.operations).toEqual(current.operations)
  expect(next.states.at(-1)?.sockets).toEqual([null])
  const oldTemplate = {
    ...template,
    rulesVersion: 'basic-2026-09-12-v74',
    strategy: {
      maxSteps: 4,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  const retained = must(
    reuseTargetCraftPlan(
      JSON.stringify(project()),
      JSON.stringify(oldTemplate),
      catalog,
      dictionary,
    ),
  )
  expect(retained.project.rulesVersion).toBe(version)
  expect(retained.project.operations).toEqual(project().operations)
})

it('合法v72和v73基线可读，旧实例入口同样拒绝未来的新符文', () => {
  const { targetDefinitions: _targets, orphanedTargets: _orphaned, ...rest } = project()
  const { nextAffixId: _next, ...plainInitial } = rest.initialState
  const legacy = {
    ...rest,
    rulesVersion: 'basic-2026-09-12-v72',
    initialState: plainInitial,
    operations: [],
    cursor: 0,
  }
  expect(parseCraftProject(JSON.stringify(legacy), catalog, dictionary).ok).toBe(true)
  const identity = {
    ...legacy,
    rulesVersion: 'basic-2026-09-12-v73',
    initialState: rest.initialState,
  }
  expect(parseIdentityCraftProject(JSON.stringify(identity), catalog, dictionary).ok).toBe(true)
  expect(
    parseCraftProject(
      JSON.stringify({ ...legacy, operations: project().operations }),
      catalog,
      dictionary,
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('v80') })
  expect(
    parseIdentityCraftProject(
      JSON.stringify({ ...identity, operations: project().operations }),
      catalog,
      dictionary,
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('v80') })
})

it('v80直接继承高催化品质语义，仍逐项要求独立来源', () => {
  const high = {
    ...project(),
    operations: [],
    cursor: 0,
    initialState: {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      nextAffixId: 1,
      sourceText: null,
      catalyst: { id: 'Flesh', quality: 40, declared: true },
    },
    essenceSourceHash: essenceSourceHash(catalog),
    scalabilitySourceHash: statScalabilitySourceHash(catalog),
  }
  expect(must(read(high)).states[0]?.catalyst?.quality).toBe(40)
  expect(read({ ...high, essenceSourceHash: '0'.repeat(64) }).ok).toBe(false)
  expect(read({ ...high, scalabilitySourceHash: '0'.repeat(64) }).ok).toBe(false)
})
