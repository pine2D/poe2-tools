import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { catalog, parse } from './catalystTestFixture'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import type { CraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { estimateResistances } from './resistances'

const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw Error(r.error)
  return r.value
}
it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 腐化属性与显式同组、催化品质往返且抗性计入两层',
  (locale) => {
    const dictionary = createCraftItemDictionary(
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
    const initial: CraftState = {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'rare',
      affixes: [{ modId: 'ChaosResist1', lines: ['+5(4-7)% to Chaos Resistance'] }],
      sourceText: null,
      implicitLines: ['10(6-15)% increased Rarity of Items found'],
      catalyst: { id: "Chayula's", quality: 20, declared: true },
    }
    const state = must(
      applyCraftStep(catalog, initial, {
        kind: 'vaal',
        outcome: 'enchant',
        modId: 'CorruptionChaosResistance1',
        values: [15],
      }),
    )
    const text = must(exportCraftItemText(catalog, state, { locale, dictionary })).text
    const item = parse(text)
    expect(item.mods.map((m) => m.kind)).toEqual(['enchant', 'implicit', 'suffix'])
    const imported = must(
      importCraftState(
        catalog,
        initial.baseId,
        item,
        inspectItem(item, dictionary),
        undefined,
        undefined,
        dictionary.stats?.entries,
      ),
    )
    expect(imported.corruption).toEqual(state.corruption)
    expect(imported.affixes).toEqual(state.affixes)
    expect(estimateResistances(catalog, imported).chaosResistance).toEqual({ ok: true, value: 24 })
    const forged = inspectItem(item, dictionary)
    const stat = forged.mods[0]?.stats[0]
    if (!stat) throw Error('缺少强化属性')
    stat.resolution.english = '+16(13-19)% to Chaos Resistance'
    expect(
      importCraftState(
        catalog,
        initial.baseId,
        item,
        forged,
        undefined,
        undefined,
        dictionary.stats?.entries,
      ).ok,
    ).toBe(false)
  },
)
