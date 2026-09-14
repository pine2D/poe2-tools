import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { catalog, dictionary, parse } from './catalystTestFixture'
import { collectCraftCosts } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { inspectItem } from './export'
import { importCraftState } from './rehearsalImport'
import { isSupportedSoulCore } from './soulCoreEffects'

const id = (name: string, category = 'weapon') =>
  `pob2:augment:${JSON.stringify([`Soul Core of ${name}`, category])}`
const metadata = () => ({
  schemaVersion: 1,
  rulesVersion: CRAFT_RULES_VERSION,
  sourceCommit: catalog._meta.sourceCommit,
  augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')?.sha256,
})
const initial = () => ({
  baseId: 'Crude Bow',
  itemLevel: 86,
  rarity: 'normal' as const,
  quality: 20,
  sourceText: null,
  affixes: [],
  sockets: [],
})
const restore = (p: unknown) => parseCraftProject(JSON.stringify(p), catalog, dictionary)
const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw Error(r.error)
  return r.value
}

it('v66 保存打孔和魂核替换，所有游标回放且旧规则不注入新操作或指引', () => {
  expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v68')
  const p = {
    ...metadata(),
    initialState: initial(),
    operations: [
      { kind: 'artificer' },
      { kind: 'socket', socketIndex: 0, augmentId: id('Quipolatl') },
      { kind: 'socket', socketIndex: 0, augmentId: id('Tacati') },
    ],
    cursor: 3,
  }
  for (const cursor of [0, 1, 2, 3]) {
    const value = must(restore({ ...p, cursor }))
    expect(value.states[cursor]?.sockets).toEqual(
      [[], [null], [id('Quipolatl')], [id('Tacati')]][cursor],
    )
    expect(
      must(collectCraftCosts(catalog, value.project.operations.slice(0, cursor))).reduce(
        (n, c) => n + c.count,
        0,
      ),
    ).toBe(cursor)
  }
  const pending = { ...p, cursor: 0 }
  const strategy = {
    ...metadata(),
    initialState: initial(),
    operations: [],
    cursor: 0,
    strategy: {
      maxSteps: 10,
      rules: [
        { conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
        {
          conditions: [{ kind: 'always' }],
          action: { kind: 'socket', socketIndex: 'first-empty', augmentId: id('Quipolatl') },
        },
      ],
    },
  }
  for (const project of [pending, strategy]) {
    expect(restore(project).ok).toBe(true)
    for (let v = 2; v <= 57; v++) {
      const result = restore({ ...project, rulesVersion: `basic-2026-09-12-v${v}` })
      expect(result.ok).toBe(false)
      if (v === 57 && !result.ok) expect(result.error).toContain('v57 及更早')
    }
  }
  expect(restore({ ...p, rulesVersion: 'basic-2026-09-12-v69' }).ok).toBe(false)
  expect(restore({ ...p, augmentSourceHash: '0'.repeat(64) }).ok).toBe(false)
  expect(
    restore({
      ...metadata(),
      rulesVersion: 'basic-2026-09-12-v57',
      initialState: initial(),
      operations: [],
      cursor: 0,
    }).ok,
  ).toBe(true)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 十四分支与恐惧增效使用独立词典导出回读，来源和旧规则门禁不绕过',
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
    const cores = catalog.augments?.filter(isSupportedSoulCore) ?? []
    expect(cores).toHaveLength(14)
    for (const core of cores)
      for (const amplified of core.category === 'weapon' ? [false] : [false, true]) {
        const baseId =
          core.category === 'weapon'
            ? 'Crude Bow'
            : core.category === 'boots'
              ? 'Rawhide Boots'
              : 'Adherent Cuffs'
        const state = {
          ...initial(),
          baseId,
          rarity: amplified ? ('rare' as const) : ('normal' as const),
          sockets: [core.id],
          affixes: amplified
            ? [
                {
                  modId: 'EssenceLocalRuneAndSoulCoreEffect1',
                  crafted: true as const,
                  lines: ['60% increased effect of Socketed Augment Items'],
                },
              ]
            : [],
        }
        const output = must(exportCraftItemText(catalog, state, { locale, dictionary: local }))
        const item = parse(output.text)
        const imported = must(
          importCraftState(
            catalog,
            baseId,
            item,
            inspectItem(item, local),
            state.sockets,
            undefined,
            local.stats?.entries,
          ),
        )
        const p = {
          ...metadata(),
          initialState: imported,
          importedSockets: state.sockets,
          operations: [],
          cursor: 0,
        }
        expect(parseCraftProject(JSON.stringify(p), catalog, local).ok).toBe(true)
        const old = parseCraftProject(
          JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-12-v57' }),
          catalog,
          local,
        )
        expect(old.ok).toBe(false)
        if (!old.ok) expect(old.error).toContain('v57 及更早')
        expect(imported.sockets).toEqual(state.sockets)
        expect(imported.runeSourceLines).toHaveLength(1)
      }
  },
  20_000,
)
