import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { checkRuneforgingSnapshot } from './check-runeforging'

const input = () => JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8'))
it('固定已审核关系内容，JSON对象字段顺序不影响语义', () => {
  const table = input()
  expect(() => checkRuneforgingSnapshot(table)).not.toThrow()
  table.recipes.reverse()
  table.unresolved.reverse()
  expect(() => checkRuneforgingSnapshot(table)).not.toThrow()
})
it.each(['cost', 'sameClassOutput', 'unresolvedReason', 'sourceRow', 'baseHash'])(
  '拒绝计数不变的语义漂移：%s',
  (kind) => {
    const table = input()
    if (kind === 'cost') table.recipes[0].verisium = 999999
    if (kind === 'sameClassOutput')
      [table.recipes[0].toBaseId, table.recipes[1].toBaseId] = [
        table.recipes[1].toBaseId,
        table.recipes[0].toBaseId,
      ]
    if (kind === 'unresolvedReason') table.unresolved[0].reason = 'unknown-base'
    if (kind === 'sourceRow')
      [table.recipes[0].sourceRow, table.recipes[1].sourceRow] = [
        table.recipes[1].sourceRow,
        table.recipes[0].sourceRow,
      ]
    if (kind === 'baseHash') table._meta.baseSources[0].sha256 = 'a'.repeat(64)
    expect(() => checkRuneforgingSnapshot(table)).toThrow()
  },
)
