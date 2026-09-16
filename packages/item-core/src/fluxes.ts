import type { CatalogBase, CatalogMod, CraftCatalog } from './catalog'
import { hasExistingModEligibility } from './catalog'
import { DESECRATION_SOURCE } from './desecration'
import { isBasicJewel, isRadiusJewel, JEWEL_SOURCE } from './jewels'

export type FluxElement = 'fire' | 'cold' | 'lightning' | 'chaos'

/** 材料身份与方向来自公开说明；关系查询不授权执行或普通生成。 */
export const FLUXES = [
  { id: 'Metadata/Items/Currency/CurrencyArcaneFluxFire', name: 'Blazing Flux', target: 'fire' },
  { id: 'Metadata/Items/Currency/CurrencyArcaneFluxCold', name: 'Chilling Flux', target: 'cold' },
  {
    id: 'Metadata/Items/Currency/CurrencyArcaneFluxLightning',
    name: 'Crackling Flux',
    target: 'lightning',
  },
  { id: 'Metadata/Items/Currency/CurrencyArcaneFluxChaos', name: 'Void Flux', target: 'chaos' },
] as const

export interface FluxCatalog {
  _meta: {
    schemaVersion: 1
    tier: 'gray'
    reviewedAt: string
    sourceCommit: string
    modifierSources: { path: string; url: string; sha256: string }[]
    source: string
  }
  rows: {
    id: string
    members: Record<
      FluxElement,
      { modId: string | null; domain: 'item' | 'jewel' | 'abyss'; source: string }
    >
  }[]
}

export interface FluxInspection {
  rowId: string
  flux: (typeof FLUXES)[number]
  fromElement: Exclude<FluxElement, 'chaos'>
  fromMod: CatalogMod | null
  toMod: CatalogMod | null
  reason?: string
}

const ELEMENTS: FluxElement[] = ['fire', 'cold', 'lightning', 'chaos']
const FROM_ELEMENTS = ['fire', 'cold', 'lightning'] as const
const COMMIT = 'ce566eac45ea8a86477f513c7ee65a1ebe60014e'
const MODIFIER_SOURCES = [
  {
    path: 'src/Data/ModItem.lua',
    url: `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/${COMMIT}/src/Data/ModItem.lua`,
    sha256: '774257f577f8cee8ac59d7848df4bc7a109d266a615eb97c2a2c08ecb6b47cf4',
  },
  JEWEL_SOURCE,
  DESECRATION_SOURCE,
] as const

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function keys(value: Record<string, unknown>, allowed: string[]): boolean {
  return (
    Object.keys(value).length === allowed.length &&
    allowed.every((key) => Object.hasOwn(value, key))
  )
}

function validMemberSource(source: unknown, modId: unknown): boolean {
  if (typeof source !== 'string') return false
  if (/^https:\/\/cdn\.poe2db\.tw\/cache2\/us\/Poe_Data_Mods_hover\/[a-f0-9]{64}$/.test(source))
    return true
  try {
    const url = new URL(source)
    const identity = url.searchParams.get('s')
    return (
      url.origin === 'https://poe2db.tw' &&
      url.pathname === '/us/Blazing_Flux' &&
      !url.hash &&
      [...url.searchParams].length === 1 &&
      identity !== null &&
      /^Data\\Mods\/[A-Za-z0-9_]+$/.test(identity) &&
      (modId === null || identity === `Data\\Mods/${String(modId)}`)
    )
  } catch {
    return false
  }
}

/** 缺失必须显式声明；固定快照、域、元素及唯一来源身份在入口统一校验。 */
export function parseFluxCatalog(value: unknown, catalog: CraftCatalog): FluxCatalog {
  return resolveFluxCatalog(value, catalog).table
}

/** 每次调用重新核对可变目录；只索引关系涉及的属性，并供后续资格查询复用。 */
function resolveFluxCatalog(
  value: unknown,
  catalog: CraftCatalog,
): { table: FluxCatalog; mods: ReadonlyMap<string, CatalogMod> } {
  const invalid = (): never => {
    throw new Error('溶剂关系目录格式或属性来源不匹配。')
  }
  if (!record(value) || !keys(value, ['_meta', 'rows']) || !record(value._meta)) return invalid()
  const meta = value._meta
  if (
    !keys(meta, [
      'schemaVersion',
      'tier',
      'reviewedAt',
      'sourceCommit',
      'modifierSources',
      'source',
    ]) ||
    meta.schemaVersion !== 1 ||
    meta.tier !== 'gray' ||
    meta.sourceCommit !== COMMIT ||
    catalog._meta.sourceCommit !== COMMIT ||
    typeof meta.reviewedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(meta.reviewedAt) ||
    meta.source !== 'https://poe2db.tw/us/Blazing_Flux' ||
    !Array.isArray(meta.modifierSources) ||
    meta.modifierSources.length !== MODIFIER_SOURCES.length ||
    !Array.isArray(value.rows) ||
    value.rows.length > 15
  )
    return invalid()
  for (const expected of MODIFIER_SOURCES) {
    const declared = meta.modifierSources.filter(
      (source: unknown) => record(source) && source.path === expected.path,
    )
    const current = catalog._meta.sources.filter((source) => source.path === expected.path)
    if (
      declared.length !== 1 ||
      !record(declared[0]) ||
      !keys(declared[0], ['path', 'url', 'sha256']) ||
      declared[0].url !== expected.url ||
      declared[0].sha256 !== expected.sha256 ||
      current.length !== 1 ||
      current[0]?.url !== expected.url ||
      current[0]?.sha256 !== expected.sha256
    )
      return invalid()
  }
  const referencedIds = new Set(
    value.rows.flatMap((row: unknown) =>
      record(row) && record(row.members)
        ? Object.values(row.members).flatMap((member) =>
            record(member) && typeof member.modId === 'string' ? [member.modId] : [],
          )
        : [],
    ),
  )
  const mods = new Map<string, CatalogMod>()
  const duplicateMods = new Set<string>()
  for (const mod of catalog.modifiers) {
    if (!referencedIds.has(mod.id)) continue
    if (mods.has(mod.id)) duplicateMods.add(mod.id)
    mods.set(mod.id, mod)
  }
  const rowIds = new Set<string>()
  const sourceIds = new Set<string>()
  for (const row of value.rows) {
    if (
      !record(row) ||
      !keys(row, ['id', 'members']) ||
      typeof row.id !== 'string' ||
      !/^equivalence-(?:[1-9]|1[0-5])$/.test(row.id) ||
      rowIds.has(row.id) ||
      !record(row.members) ||
      !keys(row.members, ELEMENTS)
    )
      return invalid()
    rowIds.add(row.id)
    const domains = new Set<string>()
    const jewelKinds = new Set<boolean>()
    for (const element of ELEMENTS) {
      const member = row.members[element]
      if (
        !record(member) ||
        !keys(member, ['modId', 'domain', 'source']) ||
        !['item', 'jewel', 'abyss'].includes(String(member.domain)) ||
        !validMemberSource(member.source, member.modId)
      )
        return invalid()
      domains.add(member.domain === 'jewel' ? 'jewel' : 'equipment')
      if (member.modId === null) continue
      if (typeof member.modId !== 'string' || duplicateMods.has(member.modId)) return invalid()
      const mod = mods.get(member.modId)
      if (
        !mod?.tags.includes(`${element}_resistance`) ||
        (member.domain === 'jewel') !== (mod.jewelOnly === true) ||
        (member.domain === 'abyss') !== (mod.desecratedOnly === true)
      )
        return invalid()
      if (mod.jewelOnly) jewelKinds.add(mod.radiusJewelOnly === true)
      // 只有混沌是终点，允许多个元素档位汇聚；元素身份重复会造成目标歧义。
      if (element !== 'chaos') {
        if (sourceIds.has(mod.id)) return invalid()
        sourceIds.add(mod.id)
      }
    }
    if (domains.size !== 1 || jewelKinds.size > 1) return invalid()
  }
  return { table: value as unknown as FluxCatalog, mods }
}

/** 这里只隔离结构域；基底生成资格不足时保留关系并说明，不能据此执行制作。 */
export function inspectFluxes(
  table: FluxCatalog,
  catalog: CraftCatalog,
  base: CatalogBase,
): FluxInspection[] {
  if (
    base.type === 'Charm' ||
    (base.type === 'Jewel' && !isBasicJewel(base) && !isRadiusJewel(base))
  )
    return []
  const mods = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  const resolve = (member: FluxCatalog['rows'][number]['members'][FluxElement]) =>
    member.modId === null ? null : (mods.get(member.modId) ?? null)
  return table.rows.flatMap((row) => {
    if ((row.members.fire.domain === 'jewel') !== (base.type === 'Jewel')) return []
    const known = ELEMENTS.map((element) => resolve(row.members[element])).filter(
      (mod) => mod !== null,
    )
    if (
      base.type === 'Jewel' &&
      known.length > 0 &&
      !known.some((mod) => (mod.radiusJewelOnly === true) === isRadiusJewel(base))
    )
      return []
    return FLUXES.flatMap((flux) =>
      FROM_ELEMENTS.filter((element) => element !== flux.target).map((fromElement) => {
        const fromMod = resolve(row.members[fromElement])
        const toMod = resolve(row.members[flux.target])
        const entry: FluxInspection = { rowId: row.id, flux, fromElement, fromMod, toMod }
        if (fromMod === null || toMod === null)
          entry.reason = '此转换关系的属性在当前授权快照中未对应；保留关系供对照。'
        else if (
          !hasExistingModEligibility(base, fromMod) &&
          !hasExistingModEligibility(base, toMod)
        )
          entry.reason = '当前基底的适用性未由属性快照确认；此条仅供关系对照。'
        return entry
      }),
    )
  })
}

/** 关系签名绑定来源与精确成员，排列和审核日期不改变项目身份。 */
export function fluxCatalogSignature(catalog: CraftCatalog): string | null {
  if (!catalog.fluxes) return null
  try {
    const table = parseFluxCatalog(catalog.fluxes, catalog)
    return JSON.stringify([
      COMMIT,
      MODIFIER_SOURCES.map((source) => [source.path, source.sha256]),
      FLUXES.map((flux) => [flux.id, flux.name, flux.target]),
      table.rows
        .map((row) => [
          row.id,
          ELEMENTS.map((element) => {
            const member = row.members[element]
            return [element, member.modId, member.domain, member.source]
          }),
        ])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0]), 'en')),
    ])
  } catch {
    return null
  }
}

/** 一次构造供完整状态/目标组合共用；来源标记不被合并成普通生成资格。 */
export function fluxEligibleModIds(
  catalog: CraftCatalog,
  base: CatalogBase,
): {
  ordinary: ReadonlySet<string>
  desecrated: ReadonlySet<string>
} {
  const ordinary = new Set<string>(),
    desecrated = new Set<string>()
  if (
    !catalog.fluxes ||
    base.type === 'Charm' ||
    (base.type === 'Jewel' && !isBasicJewel(base) && !isRadiusJewel(base))
  )
    return { ordinary, desecrated }
  let resolved: ReturnType<typeof resolveFluxCatalog>
  try {
    resolved = resolveFluxCatalog(catalog.fluxes, catalog)
  } catch {
    return { ordinary, desecrated }
  }
  const { table, mods } = resolved
  for (const row of table.rows) {
    if ((row.members.fire.domain === 'jewel') !== (base.type === 'Jewel')) continue
    const members = ELEMENTS.flatMap((element) => {
      const member = row.members[element]
      const mod = member.modId === null ? undefined : mods.get(member.modId)
      return mod ? [{ element, mod }] : []
    })
    if (
      base.type === 'Jewel' &&
      members.some(({ mod }) => (mod.radiusJewelOnly === true) !== isRadiusJewel(base))
    )
      continue
    for (const marked of [false, true]) {
      // 混沌不能逆推；实际工艺来源的转换尚未核实，不能作为可达资格的起点。
      const reachable = members.some(
        ({ element, mod }) =>
          element !== 'chaos' &&
          !mod.craftedOnly &&
          (mod.desecratedOnly === true) === marked &&
          hasExistingModEligibility(base, mod),
      )
      if (!reachable) continue
      const result = marked ? desecrated : ordinary
      for (const { mod } of members) result.add(mod.id)
    }
  }
  return { ordinary, desecrated }
}

export function hasFluxModEligibility(
  catalog: CraftCatalog,
  base: CatalogBase,
  mod: CatalogMod,
  source?: { desecrated?: true },
): boolean {
  const eligible = fluxEligibleModIds(catalog, base)
  return (source?.desecrated ? eligible.desecrated : eligible.ordinary).has(mod.id)
}

/** 只描述已识别实例的族共存，调用方仍须核对来源标记、容量及所有其他冲突。 */
export function fluxModsCanCoexist(
  catalog: CraftCatalog,
  base: CatalogBase,
  left: CatalogMod,
  right: CatalogMod,
): boolean {
  if (left.group !== right.group) return false
  const eligible = fluxEligibleModIds(catalog, base)
  const supported = (mod: CatalogMod) =>
    eligible.ordinary.has(mod.id) || eligible.desecrated.has(mod.id)
  return supported(left) && supported(right)
}
