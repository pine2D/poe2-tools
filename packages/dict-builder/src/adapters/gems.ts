// 宝石中文名：repoe skill_gems.json 给 gameId → 英文显示名（primary），poe2db /{us,cn,tw}/Gem 列表页给
// slug → 名称（gray）。键为 gameId 末段（build-core gemKey），与 .build 的 skills[].id 两种前缀都能对上。
import { gemKey, type NamedDict, type NamedEntry } from '@poe2-tools/build-core'
import { type JoinAudit, lookupName, newJoinAudit } from './poe2dbList'

export interface RepoeGem {
  gameId: string
  name: string
}

export interface GemsAudit extends JoinAudit {
  repoeGems: number
  // base_item 为 null 的条目（没有可见名字）
  noBaseItem: number
  // "[DNT-UNUSED] …" 开发条目与 "Spectre: {0}" 之类带占位符的模板名
  skippedPlaceholder: number
  // 两个 gameId 末段相同（后者覆盖前者）
  duplicateKey: number
}

export interface GemsBuildInput {
  gems: readonly RepoeGem[]
  noBaseItem: number
  en: ReadonlyMap<string, string>
  target: ReadonlyMap<string, string>
  meta: { source: string; gameVersion: string; fetchedAt: string }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseRepoeSkillGems(raw: unknown): { gems: RepoeGem[]; noBaseItem: number } {
  if (!isRecord(raw)) throw new Error('repoe skill_gems 形态不对：顶层不是对象')
  const gems: RepoeGem[] = []
  let noBaseItem = 0
  for (const [gameId, value] of Object.entries(raw)) {
    if (!isRecord(value)) throw new Error(`repoe skill_gems 形态不对：${gameId} 不是对象`)
    const base = value.base_item
    if (base === null || base === undefined) {
      noBaseItem += 1
      continue
    }
    if (!isRecord(base) || typeof base.display_name !== 'string')
      throw new Error(`repoe skill_gems 形态不对：${gameId}.base_item.display_name 不是字符串`)
    gems.push({ gameId, name: base.display_name })
  }
  return { gems, noBaseItem }
}

export function buildGemsDict(input: GemsBuildInput): { dict: NamedDict; audit: GemsAudit } {
  const entries: Record<string, NamedEntry> = {}
  const audit: GemsAudit = {
    ...newJoinAudit(),
    repoeGems: input.gems.length,
    noBaseItem: input.noBaseItem,
    skippedPlaceholder: 0,
    duplicateKey: 0,
  }
  for (const gem of input.gems) {
    if (gem.name.startsWith('[DNT') || gem.name.includes('{')) {
      audit.skippedPlaceholder += 1
      continue
    }
    const text = lookupName(gem.name, input.en, input.target, audit)
    if (text === null) continue
    const key = gemKey(gem.gameId)
    if (entries[key] !== undefined) audit.duplicateKey += 1
    entries[key] = { en: gem.name, text }
  }
  return {
    dict: { _meta: { ...input.meta, tier: 'gray', count: Object.keys(entries).length }, entries },
    audit,
  }
}
