import type { CraftCatalog } from './catalog'
import type { ItemDictionary } from './export'

/** 目录仅补充英文显示名身份；原词典优先，碰撞交给原解析器保留歧义。 */
export function createCraftItemDictionary(
  catalog: Pick<CraftCatalog, 'bases'>,
  dictionary: ItemDictionary = {},
): ItemDictionary {
  return {
    ...dictionary,
    items: {
      ...dictionary.items,
      bases: {
        ...Object.fromEntries(catalog.bases.map(({ name }) => [name, name])),
        ...dictionary.items?.bases,
      },
      uniques: dictionary.items?.uniques ?? {},
    },
  }
}
