import type { CraftCatalog } from './catalog'
import { isRuneforgedArmourBase } from './runeforgedArmour'

/** 配方关系不代替操作资格；转换动作还须核对当前装备状态。 */
export interface RuneforgingCatalog {
  _meta: {
    schemaVersion: 1
    tier: 'gray'
    reviewedAt: string
    gameVersion: null
    sourceCommit: string
    baseSources: { path: string; url: string; sha256: string }[]
    recipeSource: { url: string; sha256: string }
    sourceRowCount: number
  }
  recipes: {
    sourceRow: number
    fromBaseId: string
    toBaseId: string
    verisium: number
    implicit: 'preserve' | 'replace'
  }[]
  unresolved: {
    sourceRow: number
    reason: 'ambiguous-base' | 'unknown-base' | 'unsupported-recipe'
  }[]
}

const COMMIT = 'ce566eac45ea8a86477f513c7ee65a1ebe60014e'
const PAGE = 'https://poe2db.tw/us/Runeforging'
const PAGE_HASH = 'ea9b7564ae111fe0f957d1d35c689ff8b40e54e1e6a8eda6f2515c9551510f23'
const BASE_PATH = /^src\/Data\/Bases\/(body|helmet|gloves|boots|shield|focus)\.lua$/

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  )
}

/** 一次校验全部来源、关系及未解析行；不允许丢行后冒称完整覆盖。 */
export function parseRuneforgingCatalog(value: unknown, catalog: CraftCatalog): RuneforgingCatalog {
  const invalid = (): never => {
    throw new Error('锻造配方目录格式、基底身份或来源不匹配。')
  }
  if (!record(value) || !keys(value, ['_meta', 'recipes', 'unresolved']) || !record(value._meta))
    return invalid()
  const meta = value._meta
  if (
    !keys(meta, [
      'schemaVersion',
      'tier',
      'reviewedAt',
      'gameVersion',
      'sourceCommit',
      'baseSources',
      'recipeSource',
      'sourceRowCount',
    ]) ||
    meta.schemaVersion !== 1 ||
    meta.tier !== 'gray' ||
    meta.gameVersion !== null ||
    typeof meta.reviewedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(meta.reviewedAt) ||
    meta.sourceCommit !== COMMIT ||
    catalog._meta.sourceCommit !== COMMIT ||
    !record(meta.recipeSource) ||
    !keys(meta.recipeSource, ['url', 'sha256']) ||
    meta.recipeSource.url !== PAGE ||
    meta.recipeSource.sha256 !== PAGE_HASH ||
    !Array.isArray(meta.baseSources) ||
    meta.baseSources.length !== 6 ||
    !Number.isSafeInteger(meta.sourceRowCount) ||
    (meta.sourceRowCount as number) < 1 ||
    (meta.sourceRowCount as number) > 10000 ||
    !Array.isArray(value.recipes) ||
    !Array.isArray(value.unresolved) ||
    value.recipes.length + value.unresolved.length !== meta.sourceRowCount
  )
    return invalid()
  const paths = new Set<string>()
  for (const source of meta.baseSources) {
    if (
      !record(source) ||
      !keys(source, ['path', 'url', 'sha256']) ||
      typeof source.path !== 'string' ||
      !BASE_PATH.test(source.path) ||
      paths.has(source.path)
    )
      return invalid()
    const current = catalog._meta.sources.filter((entry) => entry.path === source.path)
    if (
      current.length !== 1 ||
      current[0]?.url !== source.url ||
      current[0]?.sha256 !== source.sha256
    )
      return invalid()
    paths.add(source.path)
  }
  const rows = new Set<number>()
  const row = (n: unknown) => {
    if (
      typeof n !== 'number' ||
      !Number.isSafeInteger(n) ||
      n < 1 ||
      n > (meta.sourceRowCount as number) ||
      rows.has(n)
    )
      return invalid()
    rows.add(n)
  }
  const bases = new Map(catalog.bases.map((base) => [base.id, base]))
  const inputs = new Set<string>()
  const outputs = new Set<string>()
  for (const recipe of value.recipes) {
    if (
      !record(recipe) ||
      !keys(recipe, ['sourceRow', 'fromBaseId', 'toBaseId', 'verisium', 'implicit']) ||
      typeof recipe.fromBaseId !== 'string' ||
      typeof recipe.toBaseId !== 'string' ||
      !Number.isSafeInteger(recipe.verisium) ||
      (recipe.verisium as number) <= 0 ||
      inputs.has(recipe.fromBaseId) ||
      outputs.has(recipe.toBaseId)
    )
      return invalid()
    row(recipe.sourceRow)
    const from = bases.get(recipe.fromBaseId)
    const to = bases.get(recipe.toBaseId)
    if (
      !from ||
      !to ||
      from.hidden ||
      from.runeforged ||
      from.variantList !== undefined ||
      !from.tags.includes('armour') ||
      from.type !== to.type ||
      !isRuneforgedArmourBase(to) ||
      recipe.implicit !== (from.implicit === to.implicit ? 'preserve' : 'replace')
    )
      return invalid()
    inputs.add(from.id)
    outputs.add(to.id)
  }
  for (const unresolved of value.unresolved) {
    if (
      !record(unresolved) ||
      !keys(unresolved, ['sourceRow', 'reason']) ||
      !['ambiguous-base', 'unknown-base', 'unsupported-recipe'].includes(String(unresolved.reason))
    )
      return invalid()
    row(unresolved.sourceRow)
  }
  return value as unknown as RuneforgingCatalog
}
