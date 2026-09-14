import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { catalog, dictionary, parse } from './catalystTestFixture'
import { collectCraftCosts } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { inspectItem } from './export'
import { importCraftState } from './rehearsalImport'
import { socketEffects } from './sockets'

const id = (name: string, category = 'weapon') => `pob2:augment:${JSON.stringify([name, category])}`
const metadata = () => ({
  schemaVersion: 1,
  rulesVersion: CRAFT_RULES_VERSION,
  sourceCommit: catalog._meta.sourceCommit,
  augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')?.sha256,
})
function project() {
  const source = {
    baseId: 'Crude Bow',
    itemLevel: 86,
    rarity: 'normal' as const,
    quality: 20,
    sourceText: null,
    affixes: [],
    sockets: [id('Body Rune'), id('Tempered Rune')],
  }
  const output = exportCraftItemText(catalog, source)
  if (!output.ok) throw Error(output.error)
  const item = parse(output.value.text)
  const initial = importCraftState(
    catalog,
    source.baseId,
    item,
    inspectItem(item, dictionary),
    source.sockets,
  )
  if (!initial.ok) throw Error(initial.error)
  return {
    ...metadata(),
    initialState: initial.value,
    importedSockets: source.sockets,
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId: id('Mind Rune') },
      { kind: 'socket', socketIndex: 1, augmentId: id('Robust Rune') },
    ],
    cursor: 2,
  }
}
const restore = (p: unknown) => parseCraftProject(JSON.stringify(p), catalog, dictionary)
it('v58 回放新增武器符文覆盖、所有游标与费用；未知未来规则拒绝', () => {
  expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v66')
  expect(restore({ ...project(), rulesVersion: 'basic-2026-09-12-v67' }).ok).toBe(false)
  for (const cursor of [0, 1, 2]) {
    const result = restore({ ...project(), cursor })
    if (!result.ok) throw Error(result.error)
    const current = result.value.states[cursor]
    if (!current) throw Error('缺少状态')
    expect(current.sockets).toEqual(
      [
        [id('Body Rune'), id('Tempered Rune')],
        [id('Mind Rune'), id('Tempered Rune')],
        [id('Mind Rune'), id('Robust Rune')],
      ][cursor],
    )
    const costs = collectCraftCosts(catalog, result.value.project.operations.slice(0, cursor))
    if (!costs.ok) throw Error(costs.error)
    expect(costs.value.reduce((n, c) => n + c.count, 0)).toBe(cursor)
  }
})
it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 攻击与两种施法类别独立词典导出回读新增效果',
  (locale) => {
    const local = createCraftItemDictionary(
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
    for (const [baseId, category, names] of [
      ['Crude Bow', 'weapon', ['Body Rune', 'Tempered Rune']],
      ['Attuned Wand', 'wand', ['Body Rune', 'Inspiration Rune']],
      ['Ashen Staff', 'staff', ['Mind Rune', 'Vision Rune']],
    ] as const) {
      const initial = {
        baseId,
        itemLevel: 86,
        rarity: 'normal' as const,
        sourceText: null,
        ...(category === 'weapon'
          ? {}
          : {
              implicitLines: [
                `Grants Skill: Level 10 ${baseId === 'Attuned Wand' ? 'Mana Drain' : 'Firebolt'}`,
              ],
            }),
        affixes: [],
        sockets: names.map((n) => id(n, category)),
      }
      const output = exportCraftItemText(catalog, initial, { locale, dictionary: local })
      if (!output.ok) throw Error(output.error)
      const item = parse(output.value.text)
      const result = importCraftState(
        catalog,
        baseId,
        item,
        inspectItem(item, local),
        initial.sockets,
        undefined,
        local.stats?.entries,
      )
      if (!result.ok) throw Error(result.error)
      expect(result.value.runeSourceLines).toEqual(
        socketEffects(catalog, initial).flatMap((x) => x.augment.lines),
      )
    }
  },
)
it('旧v2–56禁止在起点、导入声明、撤销后的操作或未命中指引夹带新分支', () => {
  const source = project()
  const plain = {
    ...metadata(),
    initialState: {
      baseId: 'Crude Bow',
      itemLevel: 86,
      rarity: 'normal',
      quality: 20,
      sourceText: null,
      affixes: [],
      sockets: [],
    },
    operations: [],
    cursor: 0,
  }
  for (const p of [
    source,
    {
      ...plain,
      operations: [
        { kind: 'artificer' },
        { kind: 'socket', socketIndex: 0, augmentId: id('Body Rune') },
      ],
    },
    {
      ...plain,
      strategy: {
        maxSteps: 10,
        rules: [
          { conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
          {
            conditions: [{ kind: 'always' }],
            action: { kind: 'socket', augmentId: id('Tempered Rune'), socketIndex: 'first-empty' },
          },
        ],
      },
    },
  ]) {
    expect(restore(p)).toMatchObject({ ok: true })
    for (let version = 2; version <= 56; version++) {
      const result = restore({ ...p, rulesVersion: `basic-2026-09-12-v${version}` })
      expect(result.ok).toBe(false)
      if (version === 56 && !result.ok) expect(result.error).toContain('v56 及更早')
    }
  }
  expect(restore({ ...plain, rulesVersion: 'basic-2026-09-12-v56' })).toMatchObject({ ok: true })
  expect(restore({ ...source, augmentSourceHash: '0'.repeat(64) }).ok).toBe(false)
})
