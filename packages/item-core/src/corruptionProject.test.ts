import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { catalog, dictionary, parse } from './catalystTestFixture'
import { compareCraftStates } from './comparison'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { inspectItem } from './export'
import type { CraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'

const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw Error(r.error)
  return r.value
}
const initial: CraftState = {
  baseId: 'Crude Bow',
  itemLevel: 86,
  rarity: 'normal',
  quality: 20,
  sourceText: null,
  affixes: [],
  sockets: [null, null, null],
}
const metadata = () => ({
  schemaVersion: 1,
  rulesVersion: CRAFT_RULES_VERSION,
  sourceCommit: catalog._meta.sourceCommit,
  augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')?.sha256,
})
const core = 'pob2:augment:["Soul Core of Quipolatl","weapon"]'
const steps: CraftStep[] = [
  { kind: 'vaal', outcome: 'socket' },
  { kind: 'socket', socketIndex: 3, augmentId: core },
]
const restore = (p: unknown) => parseCraftProject(JSON.stringify(p), catalog, dictionary)

it('腐化操作所有游标回放，旧规则、未来非法操作、伪造来源和预装状态均拒绝', () => {
  const p = { ...metadata(), initialState: initial, operations: steps, cursor: 2 }
  for (const cursor of [0, 1, 2]) {
    const restored = must(restore({ ...p, cursor }))
    expect(restored.states.map((s) => s.corrupted)).toEqual([undefined, true, true])
    expect(restored.states.map((s) => s.sockets?.length)).toEqual([3, 4, 4])
    expect(restored.states[2]?.sockets?.[3]).toBe(core)
    expect(restored.project.cursor).toBe(cursor)
  }
  const corrupted = must(applyCraftStep(catalog, initial, { kind: 'vaal', outcome: 'socket' }))
  expect(must(compareCraftStates(catalog, initial, corrupted)).corrupted).toEqual({
    before: false,
    after: true,
  })
  for (let version = 2; version <= 58; version++) {
    expect(restore({ ...p, cursor: 0, rulesVersion: `basic-2026-09-12-v${version}` }).ok).toBe(
      false,
    )
    expect(
      restore({
        ...p,
        operations: [],
        initialState: corrupted,
        rulesVersion: `basic-2026-09-12-v${version}`,
      }).ok,
    ).toBe(false)
  }
  expect(restore({ ...p, rulesVersion: 'basic-2026-09-12-v65' }).ok).toBe(false)
  expect(restore({ ...p, operations: [], cursor: 0, initialState: corrupted }).ok).toBe(false)
  for (const invalid of [
    { kind: 'vaal', outcome: 'unchanged' },
    { kind: 'artificer' },
    { currency: 'exalted', modIds: [] },
  ]) {
    expect(restore({ ...p, cursor: 0, operations: [...steps, invalid] }).ok).toBe(false)
  }
  expect(
    restore({
      ...p,
      cursor: 0,
      operations: [{ kind: 'vaal', outcome: 'socket', omen: 'corruption' }],
    }).ok,
  ).toBe(false)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 腐化额外孔导出、导入、覆盖和来源核对形成闭环',
  (locale) => {
    const local = createCraftItemDictionary(
      catalog,
      locale === 'en'
        ? {}
        : Object.fromEntries(
            ['items', 'stats'].map((k) => [
              k,
              JSON.parse(
                readFileSync(
                  new URL(`../../../data/dict/${locale}/${k}.json`, import.meta.url),
                  'utf8',
                ),
              ),
            ]),
          ),
    )
    let state: CraftState = {
      ...initial,
      rarity: 'rare',
      affixes: [{ modId: 'Dexterity1', lines: ['+7 to Dexterity'] }],
    }
    for (const step of steps) state = must(applyCraftStep(catalog, state, step))
    const item = parse(
      must(exportCraftItemText(catalog, state, { locale, dictionary: local })).text,
    )
    expect(item.corrupted).toBe(true)
    const inspection = inspectItem(item, local)
    expect(
      importCraftState(
        catalog,
        initial.baseId,
        item,
        { ...inspection, mods: [] },
        state.sockets,
        undefined,
        local.stats?.entries,
      ).ok,
    ).toBe(false)
    const forged = structuredClone(inspection)
    const stat = forged.mods[0]?.stats[0]
    if (!stat) throw new Error('测试需要实际词缀')
    stat.resolution.english = '+6 to Dexterity'
    expect(
      importCraftState(
        catalog,
        initial.baseId,
        item,
        forged,
        state.sockets,
        undefined,
        local.stats?.entries,
      ).ok,
    ).toBe(false)
    const imported = must(
      importCraftState(
        catalog,
        initial.baseId,
        item,
        inspection,
        state.sockets,
        undefined,
        local.stats?.entries,
      ),
    )
    expect(imported.corrupted).toBe(true)
    expect(imported.sockets).toEqual(state.sockets)
    const p = {
      ...metadata(),
      initialState: imported,
      importedSockets: state.sockets,
      operations: [
        { kind: 'socket', socketIndex: 3, augmentId: 'pob2:augment:["Desert Rune","weapon"]' },
      ],
      cursor: 1,
    }
    expect(parseCraftProject(JSON.stringify(p), catalog, local).ok).toBe(true)
    for (const corrupted of [undefined, false, null])
      expect(
        parseCraftProject(
          JSON.stringify({ ...p, initialState: { ...imported, corrupted } }),
          catalog,
          local,
        ).ok,
      ).toBe(false)
    expect(
      importCraftState(
        catalog,
        initial.baseId,
        { ...item, corrupted: false },
        inspection,
        state.sockets,
      ).ok,
    ).toBe(false)
    expect(
      parseCraftProject(
        JSON.stringify({
          ...p,
          initialState: {
            ...imported,
            sourceText: imported.sourceText?.replace(/^(?:被腐化|已腐化|Corrupted)$/m, ''),
          },
        }),
        catalog,
        local,
      ).ok,
    ).toBe(false)
  },
)
