import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { type CraftResult, type CraftState, craftCandidates, createCraftState } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { socketCandidates } from './sockets'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const rune = (category: string) => `pob2:augment:${JSON.stringify(["Thrud's Might", category])}`
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function initial(baseId = 'Crude Bow'): CraftState {
  return {
    baseId,
    itemLevel: 86,
    rarity: 'normal',
    sourceText: null,
    affixes: [],
    sockets: [null],
    quality: 0,
    nextAffixId: 1,
  }
}
function socket(baseId = 'Crude Bow', category = 'weapon') {
  return must(
    applyCraftStep(catalog, initial(baseId), {
      kind: 'socket',
      socketIndex: 0,
      augmentId: rune(category),
    }),
  )
}

it('攻击武器和施法武器选择正确类别；镶嵌后开放九条独立词缀', () => {
  expect(socketCandidates(catalog, initial()).some((a) => a.id === rune('weapon'))).toBe(true)
  const wand = catalog.bases.find(
    (base) => base.type === 'Wand' && !base.runeforged && !base.hidden,
  )
  if (!wand) throw Error('缺少法杖')
  expect(socketCandidates(catalog, initial(wand.id)).some((a) => a.id === rune('caster'))).toBe(
    true,
  )
  expect(createCraftState(catalog, { ...initial(wand.id), sockets: [rune('weapon')] }).ok).toBe(
    false,
  )
  const current = socket()
  const pool = craftCandidates(catalog, { ...current, rarity: 'rare' }).filter((mod) =>
    mod.id.startsWith('DestructionInfluence'),
  )
  expect(pool).toHaveLength(9)
  expect(
    createCraftState(catalog, { ...current, sockets: [rune('weapon'), rune('caster')] }).ok,
  ).toBe(false)
  expect(
    craftCandidates(catalog, { ...current, rarity: 'rare', itemLevel: 64 }).some((m) =>
      m.id.startsWith('DestructionInfluence'),
    ),
  ).toBe(false)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s 高级基础值及增效头导出回读不重复放大', (locale) => {
  const current = must(
    createCraftState(catalog, {
      ...socket(),
      rarity: 'rare',
      nextAffixId: 4,
      affixes: [
        { affixId: 'a1', modId: 'LocalAddedFireDamage1', lines: ['Adds 2 to 5 Fire Damage'] },
        {
          affixId: 'a2',
          modId: 'DestructionInfluenceFireModifierEffect',
          lines: ['20% increased Explicit Fire Modifier magnitudes'],
        },
        {
          affixId: 'a3',
          modId: 'DestructionInfluenceElementalModifierEffect',
          lines: ['20% increased Explicit Elemental Damage Modifier magnitudes'],
        },
      ],
    }),
  )
  const dictionary = createCraftItemDictionary(
    catalog,
    locale === 'en'
      ? {}
      : {
          items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
          stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
        },
  )
  const text = must(exportCraftItemText(catalog, current, { locale, dictionary })).text
  expect(text).toContain('40% Increased')
  const parsed = parseItem(text)
  if (!parsed.ok) throw Error(parsed.error)
  const restored = must(
    importIdentifiedCraftState(
      catalog,
      current.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      [rune('weapon')],
      undefined,
      dictionary.stats?.entries,
    ),
  )
  expect(restored.affixes.map((a) => a.modId)).toEqual(current.affixes.map((a) => a.modId))
  expect(restored.affixes[0]?.lines[0]).toContain('5')
  expect(restored.affixes[0]?.lines[0]).not.toContain('7')
  expect(createCraftState(catalog, { ...restored, sockets: [null] }).ok).toBe(false)
})
