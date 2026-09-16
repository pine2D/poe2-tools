import type { CatalogBase, CatalogEssence, CatalogMod, CraftCatalog } from './catalog'
import { createEssenceResultResolver, essenceCategory } from './essenceOutcomes'

export { essenceCategory } from './essenceOutcomes'

export interface EssenceInspection {
  essence: CatalogEssence
  category: string
  modId: string
  resultModId?: string
  mod: CatalogMod | null
}

/** 只连接来源声明，不从普通生成资格推断精华的使用规则。 */
export function inspectEssences(catalog: CraftCatalog, base: CatalogBase): EssenceInspection[] {
  const category = essenceCategory(base)
  const resolve = createEssenceResultResolver(catalog)
  const mods = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  return (catalog.essences ?? []).flatMap((essence) => {
    if (!Object.hasOwn(essence.mods, category)) return []
    const modId = essence.mods[category]
    if (modId === undefined) return []
    const results = resolve(base, essence)
    if (results.length === 0) return [{ essence, category, modId, mod: null }]
    return results.map((id) => ({
      essence,
      category,
      modId: id,
      mod: mods.get(id) ?? null,
      ...(results.length > 1 ? { resultModId: id } : {}),
    }))
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
  if (essenceSourceHash(catalog) === null) return false
  const resolve = createEssenceResultResolver(catalog)
  return (catalog.essences ?? []).some(
    (essence) => supportedEssenceId(essence.id) && resolve(base, essence).includes(modId),
  )
}
