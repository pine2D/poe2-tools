import { expect, it } from 'vitest'
import { catalog, dictionary, parse } from './catalystTestFixture'
import { compareCraftStates } from './comparison'
import { collectCraftCosts } from './craftCosts'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { estimateDefences } from './defences'
import { inspectItem } from './export'
import { isItemStructureLine } from './parse'
import { type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { estimateResistances } from './resistances'
import { socketCandidates, socketEffects } from './sockets'

const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}
const initial: CraftState = {
  baseId: 'Crude Bow',
  itemLevel: 86,
  rarity: 'normal',
  quality: 20,
  affixes: [],
  sourceText: null,
  sockets: [null],
}
const vaal: CraftStep = { kind: 'vaal', outcome: 'unchanged' }
const destroy = { kind: 'architect', outcome: 'destroy' } as unknown as CraftStep

it('建筑师摧毁保留历史快照并计费，终止后不能制作、镶嵌、估算或导出装备', () => {
  const corrupted = must(applyCraftStep(catalog, initial, vaal))
  const terminal = must(applyCraftStep(catalog, corrupted, destroy))
  expect(terminal).toEqual({ ...corrupted, destroyed: true })
  expect(corrupted).not.toHaveProperty('destroyed')
  expect(createCraftState(catalog, terminal).ok).toBe(false)
  for (const next of [
    destroy,
    vaal,
    { kind: 'artificer' },
    { currency: 'transmutation', modIds: ['Dexterity1'] },
    { kind: 'socket', socketIndex: 0, augmentId: 'pob2:augment:["Desert Rune","weapon"]' },
  ])
    expect(applyCraftStep(catalog, terminal, next as CraftStep)).toMatchObject({
      ok: false,
      error: expect.stringContaining('摧毁'),
    })
  expect(socketCandidates(catalog, terminal)).toEqual([])
  expect(socketEffects(catalog, terminal)).toEqual([])
  expect(estimateDefences(catalog, terminal).ok).toBe(false)
  expect(Object.values(estimateResistances(catalog, terminal)).every((result) => !result.ok)).toBe(
    true,
  )
  expect(exportCraftItemText(catalog, terminal, { locale: 'en' }).ok).toBe(false)
  expect(must(compareCraftStates(catalog, corrupted, terminal))).toEqual({
    destroyed: { before: false, after: true },
    rarity: null,
    affixes: [],
    implicit: null,
  })
  expect(must(collectCraftCosts(catalog, [vaal, destroy]))).toEqual([
    { id: 'currency:vaal', name: 'Vaal Orb', count: 1 },
    { id: 'currency:architect', name: "Architect's Orb", count: 1 },
  ])
})

it('建筑师步骤严格验证目标与字段，不允许伪造成功分支、预兆或已摧毁起点', () => {
  const corrupted = must(applyCraftStep(catalog, initial, vaal))
  expect(applyCraftStep(catalog, initial, destroy).ok).toBe(false)
  for (const step of [
    { kind: 'architect' },
    { kind: 'architect', outcome: 'enchant' },
    { kind: 'architect', outcome: 'destroy', omen: 'corruption' },
  ])
    expect(applyCraftStep(catalog, corrupted, step as unknown as CraftStep).ok).toBe(false)
  for (const patch of [{ rarity: 'unique' }, { baseId: 'Ruby' }, { pendingDesecration: {} }])
    expect(applyCraftStep(catalog, { ...corrupted, ...patch } as CraftState, destroy).ok).toBe(
      false,
    )
  for (const destroyed of [true, false, undefined, null])
    expect(createCraftState(catalog, { ...initial, destroyed } as CraftState).ok).toBe(false)
})

it('摧毁项目在所有游标恢复，完整拒绝终止之后的操作、旧规则和伪造起点', () => {
  const project = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    initialState: initial,
    operations: [vaal, destroy],
    cursor: 2,
  }
  const restore = (p: unknown) => parseCraftProject(JSON.stringify(p), catalog, dictionary)
  for (const cursor of [0, 1, 2]) {
    const restored = must(restore({ ...project, cursor }))
    expect(restored.states[2]).toMatchObject({ destroyed: true, corrupted: true })
    expect(restored.project.cursor).toBe(cursor)
    expect(restored.project.operations).toEqual([vaal, destroy])
  }
  for (let version = 2; version <= 61; version++)
    expect(
      restore({ ...project, cursor: 0, rulesVersion: `basic-2026-09-12-v${version}` }).ok,
    ).toBe(false)
  expect(restore({ ...project, cursor: 0, operations: [vaal, destroy, vaal] }).ok).toBe(false)
  expect(
    restore({
      ...project,
      cursor: 0,
      operations: [],
      initialState: { ...initial, destroyed: true },
    }).ok,
  ).toBe(false)
})

it('Twice Corrupted 作为独立状态保留，二重腐化原文不能降格为普通腐化导入', () => {
  const raw =
    'Item Class: Rings\nRarity: Rare\nTest Ring\nGold Ring\n--------\nItem Level: 86\n--------\n{ Implicit Modifier }\n10(6-15)% increased Rarity of Items found\n--------\n{ Prefix Modifier "Hale" }\n+19(10-19) to maximum Life\n--------\nTwice Corrupted'
  const item = parse(raw)
  expect(item).toMatchObject({ corrupted: true, twiceCorrupted: true, diagnostics: [] })
  expect(isItemStructureLine('Twice Corrupted')).toBe(true)
  const inspection = inspectItem(item, dictionary)
  expect(importCraftState(catalog, 'Gold Ring', item, inspection)).toMatchObject({
    ok: false,
    error: expect.stringContaining('二重腐化'),
  })
  const { twiceCorrupted: _, ...forged } = item
  expect(importCraftState(catalog, 'Gold Ring', forged, inspection).ok).toBe(false)
  expect(parse(raw.replace('Twice Corrupted', 'Corrupted'))).not.toHaveProperty('twiceCorrupted')
})
