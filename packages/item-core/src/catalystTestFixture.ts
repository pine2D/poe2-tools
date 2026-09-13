import { readFileSync } from 'node:fs'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { type ItemDictionary, inspectItem } from './export'
import { parseItem } from './parse'
import { importCraftState } from './rehearsalImport'
export const catalog: CraftCatalog = JSON.parse(
  readFileSync(new URL('../../../data/craft/catalog.json', import.meta.url), 'utf8'),
)
export const dictionary: ItemDictionary = createCraftItemDictionary(catalog, {
  items: JSON.parse(
    readFileSync(new URL('../../../data/dict/zh-CN/items.json', import.meta.url), 'utf8'),
  ),
  stats: JSON.parse(
    readFileSync(new URL('../../../data/dict/zh-CN/stats.json', import.meta.url), 'utf8'),
  ),
})
export const raw =
  'Item Class: Rings\nRarity: Rare\nTest Ring\nGold Ring\n--------\nQuality (Life Modifiers): +20% (augmented)\n--------\nItem Level: 86\n--------\n{ Implicit Modifier }\n10(6-15)% increased Rarity of Items found\n--------\n{ Prefix Modifier "Hale" — Life — 20% Increased }\n+19(10-19) to maximum Life'
export function parse(text = raw) {
  const result = parseItem(text)
  if (!result.ok) throw new Error(result.error)
  return result.item
}
export function imported(text = raw, declaration?: string) {
  const item = parse(text)
  return importCraftState(
    catalog,
    'Gold Ring',
    item,
    inspectItem(item, dictionary),
    undefined,
    undefined,
    dictionary.stats?.entries,
    declaration,
  )
}
