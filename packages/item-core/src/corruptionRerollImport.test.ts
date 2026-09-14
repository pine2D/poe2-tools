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

it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s 顺序重选后的完整文本可继续导入比较', (locale) => {
  const dictionary = createCraftItemDictionary(
    catalog,
    locale === 'en'
      ? {}
      : Object.fromEntries(
          ['items', 'stats'].map((key) => [
            key,
            JSON.parse(
              readFileSync(
                new URL(`../../../data/dict/${locale}/${key}.json`, import.meta.url),
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
    sourceText: null,
    implicitLines: ['10(6-15)% increased Rarity of Items found'],
    catalyst: { id: "Xoph's", quality: 20, declared: true },
    affixes: [{ modId: 'ColdResist1', lines: ['+10(6-10)% to Cold Resistance'] }],
  }
  const result = applyCraftStep(catalog, initial, {
    kind: 'vaal',
    outcome: 'reroll',
    replacements: [{ removeModId: 'ColdResist1', modId: 'FireResist1', values: [10] }],
  })
  if (!result.ok) throw Error(result.error)
  const exported = exportCraftItemText(catalog, result.value, { locale, dictionary })
  if (!exported.ok) throw Error(exported.error)
  const item = parse(exported.value.text)
  const restored = importCraftState(
    catalog,
    initial.baseId,
    item,
    inspectItem(item, dictionary),
    undefined,
    undefined,
    dictionary.stats?.entries,
  )
  if (!restored.ok) throw Error(restored.error)
  expect(restored.value.corrupted).toBe(true)
  expect(restored.value.affixes).toEqual(result.value.affixes)
  expect(restored.value.implicitLines).toEqual(initial.implicitLines)
  expect(restored.value.catalyst).toMatchObject({ id: "Xoph's", quality: 20 })
  expect(estimateResistances(catalog, restored.value).fireResistance).toEqual({
    ok: true,
    value: 12,
  })
})
