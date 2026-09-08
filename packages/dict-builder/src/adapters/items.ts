// 物品基底与传奇的中文名：trade2 en /items 给英文规范名（primary，也是 .build 备注首行的书写形式），
// poe2db 装备分类页与 Unique_item 列表页给 slug → 名称（gray）。键为英文规范名。
import type { ItemsDict } from '@poe2-tools/build-core'
import { type JoinAudit, lookupName, newJoinAudit } from './poe2dbList'

export interface Trade2ItemNames {
  bases: string[]
  uniques: string[]
}

export interface NameLists {
  en: ReadonlyMap<string, string>
  target: ReadonlyMap<string, string>
}

export interface ItemsAudit {
  bases: JoinAudit
  uniques: JoinAudit
}

export interface ItemsBuildInput {
  names: Trade2ItemNames
  bases: NameLists
  uniques: NameLists
  meta: { source: string; gameVersion: string; fetchedAt: string }
}

// 只收装备类分组；gem / currency / map / sanctum / wombgift 不是备注首行会写的基底
const BASE_GROUPS: ReadonlySet<string> = new Set([
  'accessory',
  'armour',
  'flask',
  'jewel',
  'weapon',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseTrade2Items(raw: unknown): Trade2ItemNames {
  if (!isRecord(raw) || !Array.isArray(raw.result))
    throw new Error('trade2 items 形态不对：缺少 result 数组')
  const bases = new Set<string>()
  const uniques = new Set<string>()
  for (const [g, group] of raw.result.entries()) {
    const where = `result[${g}]`
    if (!isRecord(group) || typeof group.id !== 'string' || !Array.isArray(group.entries))
      throw new Error(`trade2 items 形态不对：${where} 缺少 id 或 entries`)
    for (const [e, entry] of group.entries.entries()) {
      if (!isRecord(entry) || typeof entry.type !== 'string')
        throw new Error(`trade2 items 形态不对：${where}.entries[${e}].type 不是字符串`)
      if (BASE_GROUPS.has(group.id) && entry.type !== '') bases.add(entry.type)
      const flags = entry.flags
      if (
        isRecord(flags) &&
        flags.unique === true &&
        typeof entry.name === 'string' &&
        entry.name !== ''
      )
        uniques.add(entry.name)
    }
  }
  return { bases: [...bases].sort(), uniques: [...uniques].sort() }
}

function joinAll(
  names: readonly string[],
  lists: NameLists,
  audit: JoinAudit,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of names) {
    const text = lookupName(name, lists.en, lists.target, audit)
    if (text !== null) out[name] = text
  }
  return out
}

export function buildItemsDict(input: ItemsBuildInput): { dict: ItemsDict; audit: ItemsAudit } {
  const audit: ItemsAudit = { bases: newJoinAudit(), uniques: newJoinAudit() }
  const bases = joinAll(input.names.bases, input.bases, audit.bases)
  const uniques = joinAll(input.names.uniques, input.uniques, audit.uniques)
  return {
    dict: {
      _meta: {
        ...input.meta,
        tier: 'gray',
        count: Object.keys(bases).length + Object.keys(uniques).length,
      },
      bases,
      uniques,
    },
    audit,
  }
}
