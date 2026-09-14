import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { catalog, dictionary, parse } from './catalystTestFixture'
import { collectCraftCosts } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, type CraftProject, parseCraftProject } from './craftProject'
import { inspectItem } from './export'
import { importCraftState } from './rehearsalImport'

const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
const project = (): CraftProject => ({
  schemaVersion: 1,
  sourceCommit: catalog._meta.sourceCommit,
  rulesVersion: CRAFT_RULES_VERSION,
  augmentSourceHash: catalog._meta.sources.find((entry) => entry.path === 'src/Data/ModRunes.lua')
    ?.sha256 as string,
  initialState: {
    baseId: 'Rusted Greathelm',
    itemLevel: 1,
    rarity: 'normal',
    affixes: [],
    quality: 0,
    sockets: [],
    sourceText: null,
  },
  operations: [
    { kind: 'artificer' },
    { kind: 'socket', socketIndex: 0, augmentId: id('Body Rune') },
    { kind: 'socket', socketIndex: 0, augmentId: id('Mind Rune') },
  ],
  cursor: 3,
})
const restore = (value: unknown) => parseCraftProject(JSON.stringify(value), catalog, dictionary)

it('v63 保存打孔及新增符文覆盖，逐游标回放且费用不返还', () => {
  expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v63')
  expect(restore({ ...project(), rulesVersion: 'basic-2026-09-12-v64' }).ok).toBe(false)
  for (const cursor of [0, 1, 2, 3]) {
    const result = restore({ ...project(), cursor })
    if (!result.ok) throw Error(result.error)
    expect(result.value.states[cursor]?.sockets).toEqual(
      [[], [null], [id('Body Rune')], [id('Mind Rune')]][cursor],
    )
    const costs = collectCraftCosts(catalog, result.value.project.operations.slice(0, cursor))
    if (!costs.ok) throw Error(costs.error)
    expect(costs.value.reduce((sum, entry) => sum + entry.count, 0)).toBe(cursor)
  }
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 导出与重新声明孔位可完整核对新增符文贡献',
  (locale) => {
    const localDictionary = createCraftItemDictionary(
      catalog,
      locale === 'en'
        ? {}
        : {
            items: JSON.parse(
              readFileSync(
                new URL(`../../../data/dict/${locale}/items.json`, import.meta.url),
                'utf8',
              ),
            ),
            stats: JSON.parse(
              readFileSync(
                new URL(`../../../data/dict/${locale}/stats.json`, import.meta.url),
                'utf8',
              ),
            ),
          },
    )
    const restored = restore(project())
    if (!restored.ok) throw Error(restored.error)
    const state = restored.value.states[3]
    if (!state) throw Error('缺少状态')
    const output = exportCraftItemText(catalog, state, { locale, dictionary: localDictionary })
    if (!output.ok) throw Error(output.error)
    const item = parse(output.value.text)
    const imported = importCraftState(
      catalog,
      state.baseId,
      item,
      inspectItem(item, localDictionary),
      state.sockets,
      undefined,
      localDictionary.stats?.entries,
    )
    expect(imported).toMatchObject({
      ok: true,
      value: { sockets: state.sockets, runeSourceLines: ['+30 to maximum Mana'] },
    })
  },
)

it('v2–55 不能在合法来源起点、导入声明、撤销后操作或未命中规则藏新符文', () => {
  const plain = { ...project(), operations: [], cursor: 0 }
  const output = exportCraftItemText(catalog, { ...plain.initialState, sockets: [id('Body Rune')] })
  if (!output.ok) throw Error(output.error)
  const item = parse(output.value.text)
  const imported = importCraftState(
    catalog,
    plain.initialState.baseId,
    item,
    inspectItem(item, dictionary),
    [id('Body Rune')],
    undefined,
    dictionary.stats?.entries,
  )
  if (!imported.ok) throw Error(imported.error)
  const patches = [
    { initialState: imported.value, importedSockets: [id('Body Rune')] },
    { operations: project().operations },
    {
      strategy: {
        maxSteps: 10,
        rules: [
          { conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
          {
            conditions: [{ kind: 'always' }],
            action: { kind: 'socket', augmentId: id('Body Rune'), socketIndex: 'first-empty' },
          },
        ],
      },
    },
  ]
  for (const patch of patches) {
    const current = restore({ ...plain, ...patch })
    if (!current.ok) throw Error(`${JSON.stringify(patch)}: ${current.error}`)
    for (let v = 2; v <= 55; v++) {
      const result = restore({ ...plain, ...patch, rulesVersion: `basic-2026-09-12-v${v}` })
      expect(result.ok).toBe(false)
      if (v === 55 && !result.ok) expect(result.error).toContain('v55 及更早项目不能包含新增')
    }
  }
  expect(restore({ ...plain, rulesVersion: 'basic-2026-09-12-v55' })).toMatchObject({
    ok: true,
    value: { project: { rulesVersion: CRAFT_RULES_VERSION } },
  })
  expect(restore({ ...project(), augmentSourceHash: '0'.repeat(64) }).ok).toBe(false)
})
