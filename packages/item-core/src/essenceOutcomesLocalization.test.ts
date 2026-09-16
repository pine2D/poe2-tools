import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { addCraftAffix, type CraftResult, type CraftState, craftCandidates } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
function must<T>(r: CraftResult<T>): T {
  if (!r.ok) throw Error(r.error)
  return r.value
}
it.each(['zh-CN', 'zh-TW'] as const)('%s三种工艺结果使用独立词典导出回读', (locale) => {
  const dictionary = createCraftItemDictionary(catalog, {
    items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
    stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
  })
  for (const attribute of ['Strength', 'Dexterity', 'Intelligence']) {
    let state: CraftState = {
      baseId: 'Amber Amulet',
      rarity: 'rare',
      itemLevel: 86,
      affixes: [],
      sourceText: null,
    }
    const mod = craftCandidates(catalog, state).find((m) => m.kind === 'prefix')
    if (!mod) throw Error('缺少前缀')
    state = must(addCraftAffix(catalog, state, mod.id))
    const resultModId = `EssencePercent${attribute}1`
    const crafted = must(
      applyCraftStep(catalog, state, {
        kind: 'essence',
        essenceId: 'Metadata/Items/Currency/CurrencyPerfectEssenceAttribute',
        resultModId,
        removeModId: mod.id,
        values: [8],
      }),
    )
    const text = must(exportCraftItemText(catalog, crafted, { locale, dictionary })).text
    expect(text).not.toContain(`increased ${attribute}`)
    const parsed = parseItem(text)
    if (!parsed.ok) throw Error(parsed.error)
    const restored = must(
      importIdentifiedCraftState(
        catalog,
        state.baseId,
        parsed.item,
        inspectItem(parsed.item, dictionary),
        undefined,
        undefined,
        dictionary.stats?.entries,
      ),
    )
    expect(restored.affixes).toMatchObject([
      { modId: resultModId, crafted: true, lines: [`8(7-10)% increased ${attribute}`] },
    ])
  }
})
