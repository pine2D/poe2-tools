import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
const operation = {
  kind: 'masterwork',
  socketIndex: 0,
  fromAugmentId: id('Greater Rebirth Rune'),
  toAugmentId: id('Perfect Rebirth Rune'),
}
function project() {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-16-v85',
    initialState: {
      baseId: 'Adherent Cuffs',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
      sockets: [null],
    },
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId: id('Greater Rebirth Rune') },
      operation,
    ],
    cursor: 1,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
    pricing: { unit: 'divine', prices: { 'augment:Masterwork Rune': 2 } },
  }
}
it('v85恢复全部未来升级和报价，重放保留升级后身份', () => {
  const p = project()
  const r = loadTargetWorkbenchProject(JSON.stringify(p), catalog)
  if (!r.ok) throw Error(r.error)
  expect(r.value.project).toEqual(p)
  expect(r.value.states[2]?.sockets).toEqual([id('Perfect Rebirth Rune')])
  expect(r.value.project.cursor).toBe(1)
})
it('v2–v84拒绝升级历史、仅报价和嵌套未执行指引', () => {
  const real = { ...catalog, fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) }
  for (let n = 2; n <= 84; n++) {
    const p = project()
    const { sockets: _, nextAffixId: __, ...legacy } = p.initialState
    const base = {
      schemaVersion: 1,
      sourceCommit: p.sourceCommit,
      rulesVersion: `basic-2026-09-${n >= 76 ? '16' : '12'}-v${n}`,
      initialState: n >= 73 ? { ...legacy, nextAffixId: 1 } : legacy,
      operations: [],
      cursor: 0,
      ...(n >= 74 ? { targetDefinitions: p.targetDefinitions, orphanedTargets: [] } : {}),
      ...(n === 75 ? { fluxCatalogSignature: fluxCatalogSignature(real) } : {}),
    }
    const read =
      n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
    expect(read(JSON.stringify(base), real).ok, `v${n}`).toBe(true)
    for (const change of [
      { operations: [operation] },
      { pricing: p.pricing },
      { strategy: { flow: { stages: [{ action: { kind: 'masterwork', socketIndex: 0 } }] } } },
    ])
      expect(read(JSON.stringify({ ...base, ...change }), real), `v${n}`).toMatchObject({
        ok: false,
        error: expect.stringContaining('v85'),
      })
  }
})
it('升级前后身份不符及坏字段不能因游标停在之前而绕过', () => {
  for (const patch of [
    { toAugmentId: id('Perfect Ward Rune') },
    { fromAugmentId: id('Greater Ward Rune') },
    { socketIndex: 5 },
    { extra: true },
  ]) {
    const p = project()
    p.operations[1] = { ...operation, ...patch } as typeof operation
    expect(loadTargetWorkbenchProject(JSON.stringify(p), catalog).ok).toBe(false)
  }
})

it('未执行升级指引也必须绑定符文来源', () => {
  const p = project()
  const { sockets: _, ...initialState } = p.initialState
  const input = {
    ...p,
    initialState,
    operations: [],
    cursor: 0,
    strategy: {
      maxSteps: 10,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'masterwork', socketIndex: 0 } }],
    },
  }
  expect(loadTargetWorkbenchProject(JSON.stringify(input), catalog).ok).toBe(true)
  const { augmentSourceHash: __, ...missing } = input
  expect(loadTargetWorkbenchProject(JSON.stringify(missing), catalog).ok).toBe(false)
})

import { runeforgingCatalogSignature } from './runeforgingCatalog'
import { reuseTargetCraftPlan } from './targetWorkbenchProject'

it('v85继承锻造签名，沿用旧方案不降级或截断未来', () => {
  const real = {
    ...catalog,
    runeforging: JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8')),
  }
  const p = project()
  const input = {
    ...p,
    runeforgingCatalogSignature: runeforgingCatalogSignature(real),
    operations: [
      p.operations[0],
      { kind: 'runeforge', fromBaseId: 'Adherent Cuffs', toBaseId: 'Runeforged Adherent Cuffs' },
      operation,
    ],
  }
  const r = loadTargetWorkbenchProject(JSON.stringify(input), real)
  if (!r.ok) throw Error(r.error)
  const { runeforgingCatalogSignature: _, ...missing } = input
  expect(loadTargetWorkbenchProject(JSON.stringify(missing), real).ok).toBe(false)
  const old = loadTargetWorkbenchProject(
    JSON.stringify({
      ...p,
      rulesVersion: 'basic-2026-09-16-v84',
      operations: [],
      cursor: 0,
      pricing: undefined,
      strategy: {
        maxSteps: 10,
        rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
      },
    }),
    real,
  )
  if (!old.ok) throw Error(old.error)
  const reused = reuseTargetCraftPlan(
    JSON.stringify(r.value.project),
    JSON.stringify(old.value.project),
    real,
  )
  if (!reused.ok) throw Error(reused.error)
  expect(reused.value.project.rulesVersion).toBe('basic-2026-09-16-v85')
  expect(reused.value.project.operations).toEqual(input.operations)
  expect(reused.value.project.cursor).toBe(1)
  expect(reused.value.project.pricing).toEqual(p.pricing)
  expect(reused.value.project.runeforgingCatalogSignature).toBe(input.runeforgingCatalogSignature)
})
