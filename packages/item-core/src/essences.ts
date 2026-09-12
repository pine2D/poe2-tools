import type { CatalogBase, CatalogEssence, CatalogMod, CraftCatalog } from './catalog'

export interface EssenceInspection {
  essence: CatalogEssence
  category: string
  modId: string
  mod: CatalogMod | null
}

export function essenceCategory(base: CatalogBase): string {
  if (base.type === 'Staff' && base.subType === 'Warstaff') return 'Warstaff'
  if (base.type === 'Shield' && base.tags.includes('buckler')) return 'Buckler'
  return base.type
}

/** 只连接来源声明，不从普通生成资格推断精华的使用规则。 */
export function inspectEssences(catalog: CraftCatalog, base: CatalogBase): EssenceInspection[] {
  const category = essenceCategory(base)
  const mods = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  return (catalog.essences ?? []).flatMap((essence) => {
    if (!Object.hasOwn(essence.mods, category)) return []
    const modId = essence.mods[category]
    if (modId === undefined) return []
    return [{ essence, category, modId, mod: mods.get(modId) ?? null }]
  })
}

/** 按源目录真实 ID 分类，不用 tierLevel 推断操作规则。 */
export function essenceCraftMode(id: string): 'upgrade' | 'replace' | null {
  if (
    /^Metadata\/Items\/Currency\/Currency(?:LesserEssence|Essence|GreaterEssence)[A-Za-z0-9]+$/.test(
      id,
    )
  )
    return 'upgrade'
  if (
    /^Metadata\/Items\/Currency\/Currency(?:PerfectEssence|CorruptedEssence)[A-Za-z0-9]+$/.test(id)
  )
    return 'replace'
  return null
}

export function supportedEssenceId(id: string): boolean {
  return essenceCraftMode(id) !== null
}

export function essenceSourceHash(catalog: CraftCatalog): string | null {
  const sources = catalog._meta.sources.filter((source) => source.path === 'src/Data/Essence.lua')
  const hash = sources[0]?.sha256
  return sources.length === 1 && typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)
    ? hash
    : null
}

/** 精确类别映射才可授权普通池之外的已存工艺属性。 */
export function isEssenceMappedMod(
  catalog: CraftCatalog,
  base: CatalogBase,
  modId: string,
): boolean {
  return (
    essenceSourceHash(catalog) !== null &&
    inspectEssences(catalog, base).some(
      (entry) => supportedEssenceId(entry.essence.id) && entry.mod?.id === modId,
    )
  )
}
