/** 制作目录仅提供生成资格；概率数据必须单独建立来源。 */
export interface CatalogBase {
  id: string
  name: string
  type: string
  tags: string[]
  requirements: Record<string, number>
  properties: Record<string, number>
  implicit: string | null
  implicitTags: string[][]
  sourceQuality: number | null
  socketLimit: number | null
  hidden: boolean
  runeforged: boolean
  subType?: string
  variantList?: string[]
  grantedSkillsHaveNoReservation?: boolean
  charmLimit?: number
  spirit?: number
  flask?: Record<string, number>
  charm?: { duration: number; chargesUsed: number; chargesMax: number; buff: string[] }
  variant?: {
    visibility: 'visible' | 'hidden' | 'mixed'
    declarations: { sourcePath: string; index: number; hidden: boolean }[]
  }
}

export interface CatalogMod {
  desecratedOnly?: true
  id: string
  kind: 'prefix' | 'suffix'
  name: string
  group: string
  level: number
  lines: string[]
  statOrder: number[]
  tags: string[]
  addsTags: string[]
  eligibility: { tag: string; value: 0 | 1 }[]
  tradeHashes: Record<string, string[]>
}

/** 来源类别映射不等于可执行规则；tierLevel 尚不用于任何等级门槛。 */
export interface CatalogEssence {
  id: string
  name: string
  type: string
  tierLevel: number
  mods: Record<string, string>
}

/** 来源名称和类别组成项目身份；所有限制仅保留声明，不推断缺省含义。 */
export interface CatalogAugment {
  id: string
  name: string
  category: string
  type: 'Rune' | 'SoulCore' | 'Idol' | 'AbyssalEye' | 'CongealedMist'
  localMod: boolean
  /** 仅有 Bonded 的来源类别没有普通效果，lines 和 statOrder 均为空数组。 */
  lines: string[]
  statOrder: number[]
  tradeHashes: Record<string, string[]>
  levelReq: number
  limit?: number
  limitId?: string
  isSocketBound?: boolean
  canSocketInChakraSlots?: boolean
  canSocketInUniqueItems?: boolean
  canSocketInJewellery?: boolean
  canSocketInCorruptedSanctified?: boolean
  bonded?: { lines: string[]; statOrder: number[] }
}

export interface CraftCatalog {
  _meta: {
    schemaVersion: 2
    tier: 'primary'
    sourceCommit: string
    gameVersion: string | null
    generatedAt: string
    weightStatus: 'unknown'
    sources: { path: string; url: string; sha256: string }[]
    /** 名称源独立于固定 PoB 提交；静态响应未声明游戏版本。 */
    nameSources?: {
      locale: 'en' | 'zh-CN' | 'zh-TW'
      url: string
      sha256: string
      fetchedAt: string
      gameVersion: null
    }[]
    excludedDesecratedMods?: { id: string; reason: string }[]
    excludedBases: { id: string; reason: string }[]
  }
  bases: CatalogBase[]
  modifiers: CatalogMod[]
  augments?: CatalogAugment[]
  essences?: CatalogEssence[]
  localizedNames?: { 'zh-CN': Record<string, string>; 'zh-TW': Record<string, string> }
}

export function searchBases(
  bases: readonly CatalogBase[],
  query: string,
  translations: Record<string, string>,
  limit = 40,
): CatalogBase[] {
  const needle = query.trim().toLowerCase()
  const words = needle.split(/\s+/).filter(Boolean)
  const normalized = (base: CatalogBase) => [
    base.name.toLowerCase(),
    (translations[base.name] ?? '').toLowerCase(),
  ]
  const score = (base: CatalogBase) => (normalized(base).some((name) => name === needle) ? 0 : 1)
  return bases
    .filter(
      (base) =>
        !base.hidden &&
        words.every((word) =>
          `${base.name} ${translations[base.name] ?? ''} ${base.type}`.toLowerCase().includes(word),
        ),
    )
    .sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id, 'en'))
    .slice(0, Math.max(0, limit))
}

export interface PoolEntry {
  mod: CatalogMod
  reasons: ('level' | 'conflict')[]
}

/** Genesis Tree 专属生成上下文不是基底的普通制作资格；保留源规则首匹配顺序。 */
export function hasCraftModEligibility(
  base: CatalogBase,
  mod: CatalogMod,
  addedTags: readonly string[] = [],
): boolean {
  const tags = new Set(
    [...base.tags, ...addedTags].filter(
      (tag) => tag !== 'genesis_tree_caster' && tag !== 'genesis_tree_minion',
    ),
  )
  return mod.eligibility.find((rule) => tags.has(rule.tag))?.value === 1
}

export function inspectModPool(
  base: CatalogBase,
  modifiers: readonly CatalogMod[],
  itemLevel: number,
  occupiedGroups: readonly string[] = [],
  addedTags: readonly string[] = [],
  source: 'ordinary' | 'desecrated' = 'ordinary',
): PoolEntry[] {
  if (!Number.isInteger(itemLevel) || itemLevel < 1 || itemLevel > 100)
    throw new Error('物品等级必须是 1–100 的整数')
  const groups = new Set(occupiedGroups)
  return modifiers.flatMap((mod) => {
    if (source === 'ordinary' && mod.desecratedOnly) return []
    // 顺序属于源规则：default 也可出现在中间，不能排序或把拒绝项提前。
    if (!hasCraftModEligibility(base, mod, addedTags)) return []
    const reasons: PoolEntry['reasons'] = []
    if (mod.level > itemLevel) reasons.push('level')
    if (groups.has(mod.group)) reasons.push('conflict')
    return [{ mod, reasons }]
  })
}
