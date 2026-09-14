import type { CatalogBase, CatalogMod, CraftCatalog } from './catalog'
import { essenceCategory } from './essences'

/** gray 关系表与 primary 属性目录分开，不能据此授权普通生成。 */
export interface AlloyCatalog {
  _meta: {
    schemaVersion: 1
    tier: 'gray'
    reviewedAt: string
    sourceCommit: string
    modifierSource: { path: string; url: string; sha256: string }
  }
  alloys: {
    id: string
    name: string
    source: string
    mappings: { category: string; modId: string | null }[]
  }[]
}

const COMMIT = 'ce566eac45ea8a86477f513c7ee65a1ebe60014e'
const MOD_HASH = '774257f577f8cee8ac59d7848df4bc7a109d266a615eb97c2a2c08ecb6b47cf4'
const MOD_PATH = 'src/Data/ModItem.lua'
const MOD_URL = `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/${COMMIT}/${MOD_PATH}`
const CATEGORIES = new Set([
  'Ring',
  'Amulet',
  'Belt',
  'Helmet',
  'Body Armour',
  'Gloves',
  'Boots',
  'Shield',
  'Buckler',
  'Focus',
  'Quiver',
  'One Hand Sword',
  'One Hand Axe',
  'One Hand Mace',
  'Two Hand Sword',
  'Two Hand Axe',
  'Two Hand Mace',
  'Spear',
  'Bow',
  'Warstaff',
  'Dagger',
  'Crossbow',
  'Flail',
  'Talisman',
  'Sceptre',
  'Staff',
  'Wand',
])

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function keys(value: Record<string, unknown>, allowed: string[]): boolean {
  return (
    Object.keys(value).length === allowed.length &&
    allowed.every((key) => Object.hasOwn(value, key))
  )
}

/** 所有关系在入口一次校验；缺失只允许显式 null，拼错 ID 不能静默退化。 */
export function parseAlloyCatalog(value: unknown, catalog: CraftCatalog): AlloyCatalog {
  const invalid = (): never => {
    throw new Error('合金关系目录格式或属性来源不匹配。')
  }
  if (!record(value) || !keys(value, ['_meta', 'alloys']) || !record(value._meta)) return invalid()
  const meta = value._meta
  const source = meta.modifierSource
  const current = catalog._meta.sources.filter((entry) => entry.path === MOD_PATH)
  if (
    !keys(meta, ['schemaVersion', 'tier', 'reviewedAt', 'sourceCommit', 'modifierSource']) ||
    meta.schemaVersion !== 1 ||
    meta.tier !== 'gray' ||
    meta.sourceCommit !== COMMIT ||
    typeof meta.reviewedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(meta.reviewedAt) ||
    !record(source) ||
    !keys(source, ['path', 'url', 'sha256']) ||
    source.path !== MOD_PATH ||
    source.url !== MOD_URL ||
    source.sha256 !== MOD_HASH ||
    catalog._meta.sourceCommit !== COMMIT ||
    current.length !== 1 ||
    current[0]?.url !== MOD_URL ||
    current[0]?.sha256 !== MOD_HASH ||
    !Array.isArray(value.alloys) ||
    value.alloys.length > 13
  )
    return invalid()
  const ids = new Set<string>()
  const names = new Set<string>()
  // 关系只允许 Alloy ID；无需为普通装备和珠宝词缀分配索引。
  const mods = new Map<string, CatalogMod>()
  for (const mod of catalog.modifiers) if (mod.id.startsWith('Alloy')) mods.set(mod.id, mod)
  for (const alloy of value.alloys) {
    if (
      !record(alloy) ||
      !keys(alloy, ['id', 'name', 'source', 'mappings']) ||
      typeof alloy.id !== 'string' ||
      !/^Metadata\/Items\/Currency\/CurrencyVerisiumAlloy(?:[1-9]|1[0-3])$/.test(alloy.id) ||
      ids.has(alloy.id) ||
      typeof alloy.name !== 'string' ||
      names.has(alloy.name) ||
      !/^[A-Za-z ']+ Alloy$/.test(alloy.name) ||
      alloy.name.length > 80 ||
      alloy.source !==
        `https://poe2db.tw/us/${alloy.name.replaceAll("'", '').replaceAll(' ', '_')}` ||
      !Array.isArray(alloy.mappings) ||
      alloy.mappings.length === 0 ||
      alloy.mappings.length > CATEGORIES.size
    )
      return invalid()
    ids.add(alloy.id)
    names.add(alloy.name)
    const categories = new Set<string>()
    for (const mapping of alloy.mappings) {
      if (
        !record(mapping) ||
        !keys(mapping, ['category', 'modId']) ||
        typeof mapping.category !== 'string' ||
        !CATEGORIES.has(mapping.category) ||
        categories.has(mapping.category)
      )
        return invalid()
      categories.add(mapping.category)
      if (mapping.modId === null) continue
      if (typeof mapping.modId !== 'string' || !/^Alloy[A-Za-z0-9]+$/.test(mapping.modId))
        return invalid()
      const mod = mods.get(mapping.modId)
      if (!mod || mod.jewelOnly || mod.desecratedOnly) return invalid()
    }
  }
  return value as unknown as AlloyCatalog
}

export interface AlloyInspection {
  alloy: AlloyCatalog['alloys'][number]
  category: string
  mod: CatalogMod | null
  reason: string | null
}

function findMappedMod(catalog: CraftCatalog, modId: string): CatalogMod | null {
  // 单类别只有少量映射；反向查找保留原 Map 的重复 ID 后项优先行为。
  for (let index = catalog.modifiers.length - 1; index >= 0; index--) {
    const mod = catalog.modifiers[index]
    if (mod?.id === modId) return mod
  }
  return null
}

export function inspectAlloys(
  table: AlloyCatalog,
  catalog: CraftCatalog,
  base: CatalogBase,
): AlloyInspection[] {
  const category = essenceCategory(base)
  return table.alloys.flatMap((alloy) => {
    const mapping = alloy.mappings.find((entry) => entry.category === category)
    if (!mapping) return []
    const mod = mapping.modId === null ? null : findMappedMod(catalog, mapping.modId)
    return [
      {
        alloy,
        category,
        mod,
        reason: mod === null ? '此材料效果在当前授权属性快照中未对应，暂不能据此模拟。' : null,
      },
    ]
  })
}

/** 项目记录规范化关系签名；空白、日期变化不影响身份，关系和名字变化会失配。 */
export function alloyCatalogSignature(catalog: CraftCatalog): string | null {
  if (!catalog.alloys) return null
  try {
    const table = parseAlloyCatalog(catalog.alloys, catalog)
    return JSON.stringify([
      COMMIT,
      MOD_HASH,
      table.alloys
        .map((entry) => [
          entry.id,
          entry.name,
          entry.mappings
            .map((mapping) => [mapping.category, mapping.modId])
            .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'en')),
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'en')),
    ])
  } catch {
    return null
  }
}

export function inspectCraftAlloys(catalog: CraftCatalog, base: CatalogBase): AlloyInspection[] {
  if (!catalog.alloys) return []
  try {
    // 查询只需验证关系；项目签名的排序和序列化留给实际保存／核对入口。
    return inspectAlloys(parseAlloyCatalog(catalog.alloys, catalog), catalog, base)
  } catch {
    return []
  }
}

export function isAlloyMappedMod(catalog: CraftCatalog, base: CatalogBase, modId: string): boolean {
  if (!modId.startsWith('Alloy')) return false
  return inspectCraftAlloys(catalog, base).some((entry) => entry.mod?.id === modId)
}
