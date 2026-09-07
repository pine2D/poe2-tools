import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildPassivesDict, parsePoe2dbTree, parseRepoePassives } from './passives'

const fixtures = fileURLToPath(new URL('../../fixtures/', import.meta.url))
const repoe = parseRepoePassives(
  JSON.parse(readFileSync(`${fixtures}repoe-default-mini.json`, 'utf8')),
)
const tree = parsePoe2dbTree(
  JSON.parse(readFileSync(`${fixtures}poe2db-tree-cn-mini.json`, 'utf8')),
)
const meta = { source: 'repoe+poe2db', gameVersion: '0.5', fetchedAt: '2026-09-07T00:00:00Z' }

describe('parse', () => {
  it('repoe 缺 passives 或条目缺 id/name 时抛错', () => {
    expect(() => parseRepoePassives({})).toThrow('passives')
    expect(() => parseRepoePassives({ passives: { '1': { id: 'x' } } })).toThrow('passives.1.name')
  })
  it('poe2db 树缺 nodes 时抛错；节点字段可缺省', () => {
    expect(() => parsePoe2dbTree({})).toThrow('nodes')
    expect(parsePoe2dbTree({ nodes: { root: {} } }).nodes.root).toEqual({})
  })
})

describe('buildPassivesDict', () => {
  const { dict, audit } = buildPassivesDict(repoe, tree, meta)
  it('按 hash 对齐且 id 相同才采纳，空名跳过', () => {
    expect(dict.entries).toEqual({
      strength16: { en: 'Attribute', text: '属性' },
      dexterity30_: { en: 'Attribute', text: '属性' },
    })
    expect(dict._meta).toEqual({ ...meta, tier: 'gray', count: 2 })
  })
  it('审计计数', () => {
    expect(audit).toEqual({
      repoeNodes: 5,
      joined: 2,
      missingInTree: 1,
      idMismatch: 1,
      emptyName: 1,
      duplicateId: 0,
    })
  })
})
