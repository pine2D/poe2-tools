// 天赋：repoe 提供字符串 id ↔ 数字 hash ↔ 英文名；poe2db 树 JSON 按同一 hash 给中文名。
// 词典范围只到"节点标题"（name），不含数值文案。
import type { NamedDict, NamedEntry } from '@poe2-tools/build-core'

export interface RepoePassive {
  id: string
  name: string
}

export interface RepoePassives {
  passives: Record<string, RepoePassive>
}

export interface Poe2dbNode {
  id?: string
  name?: string
}

export interface Poe2dbTree {
  nodes: Record<string, Poe2dbNode>
}

export interface PassivesAudit {
  repoeNodes: number
  joined: number
  missingInTree: number
  idMismatch: number
  emptyName: number
  duplicateId: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseRepoePassives(raw: unknown): RepoePassives {
  if (!isRecord(raw) || !isRecord(raw.passives))
    throw new Error('repoe 形态不对：缺少 passives 对象')
  const passives: Record<string, RepoePassive> = {}
  for (const [hash, node] of Object.entries(raw.passives)) {
    if (!isRecord(node) || typeof node.id !== 'string')
      throw new Error(`repoe 形态不对：passives.${hash}.id 不是字符串`)
    if (typeof node.name !== 'string')
      throw new Error(`repoe 形态不对：passives.${hash}.name 不是字符串`)
    passives[hash] = { id: node.id, name: node.name }
  }
  return { passives }
}

export function parsePoe2dbTree(raw: unknown): Poe2dbTree {
  if (!isRecord(raw) || !isRecord(raw.nodes)) throw new Error('poe2db 树形态不对：缺少 nodes 对象')
  const nodes: Record<string, Poe2dbNode> = {}
  for (const [hash, node] of Object.entries(raw.nodes)) {
    if (!isRecord(node)) throw new Error(`poe2db 树形态不对：nodes.${hash} 不是对象`)
    const parsed: Poe2dbNode = {}
    if (typeof node.id === 'string') parsed.id = node.id
    if (typeof node.name === 'string') parsed.name = node.name
    nodes[hash] = parsed
  }
  return { nodes }
}

export function buildPassivesDict(
  repoe: RepoePassives,
  tree: Poe2dbTree,
  meta: { source: string; gameVersion: string; fetchedAt: string },
): { dict: NamedDict; audit: PassivesAudit } {
  const entries: Record<string, NamedEntry> = {}
  const audit: PassivesAudit = {
    repoeNodes: 0,
    joined: 0,
    missingInTree: 0,
    idMismatch: 0,
    emptyName: 0,
    duplicateId: 0,
  }
  for (const [hash, passive] of Object.entries(repoe.passives)) {
    audit.repoeNodes += 1
    const node = tree.nodes[hash]
    if (node === undefined) {
      audit.missingInTree += 1
      continue
    }
    if (node.id !== passive.id) {
      audit.idMismatch += 1
      continue
    }
    const text = node.name ?? ''
    if (passive.name === '' || text === '') {
      audit.emptyName += 1
      continue
    }
    if (entries[passive.id] !== undefined) audit.duplicateId += 1
    entries[passive.id] = { en: passive.name, text }
    audit.joined += 1
  }
  return {
    dict: { _meta: { ...meta, tier: 'gray', count: Object.keys(entries).length }, entries },
    audit,
  }
}
