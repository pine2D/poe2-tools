import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { parseRuneforgingCatalog } from './runeforgingCatalog'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const sources = catalog._meta.sources.filter((s) =>
  /^src\/Data\/Bases\/(body|helmet|gloves|boots|shield|focus)\.lua$/.test(s.path),
)
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('测试样本缺失')
  return value
}

const input = () => ({
  _meta: {
    schemaVersion: 1,
    tier: 'gray',
    reviewedAt: '2026-09-16',
    gameVersion: null,
    sourceCommit: catalog._meta.sourceCommit,
    baseSources: structuredClone(sources),
    recipeSource: {
      url: 'https://poe2db.tw/us/Runeforging',
      sha256: 'ea9b7564ae111fe0f957d1d35c689ff8b40e54e1e6a8eda6f2515c9551510f23',
    },
    sourceRowCount: 2,
  },
  recipes: [
    {
      sourceRow: 1,
      fromBaseId: 'Adherent Cuffs',
      toBaseId: 'Runeforged Adherent Cuffs',
      verisium: 350,
      implicit: 'preserve',
    },
    {
      sourceRow: 2,
      fromBaseId: 'Flowing Raiment',
      toBaseId: 'Runeforged Flowing Raiment',
      verisium: 490,
      implicit: 'replace',
    },
  ],
  unresolved: [] as { sourceRow: number; reason: string }[],
})

it('连接固定基底身份并显式区分固有属性转换，不修改主目录', () => {
  const before = JSON.stringify(catalog)
  const table = input()
  expect(parseRuneforgingCatalog(table, catalog)).toEqual(table)
  expect(JSON.stringify(catalog)).toBe(before)
})

it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
  '拒绝不合法材料数量 %s',
  (value) => {
    const table = input()
    required(table.recipes[0]).verisium = value
    expect(() => parseRuneforgingCatalog(table, catalog)).toThrow()
  },
)

it.each([
  'commit',
  'baseHash',
  'recipeHash',
  'duplicateSource',
  'unknownBase',
  'wrongClass',
  'reverse',
  'implicit',
  'extra',
  'missingRow',
  'duplicateRow',
])('拒绝失配目录：%s', (kind) => {
  const table = input()
  if (kind === 'commit') table._meta.sourceCommit = 'a'.repeat(40)
  if (kind === 'baseHash') required(table._meta.baseSources[0]).sha256 = 'a'.repeat(64)
  if (kind === 'recipeHash') table._meta.recipeSource.sha256 = 'wrong'
  if (kind === 'duplicateSource') table._meta.baseSources.push(required(table._meta.baseSources[0]))
  if (kind === 'unknownBase') required(table.recipes[0]).fromBaseId = 'Unknown'
  if (kind === 'wrongClass') required(table.recipes[0]).fromBaseId = 'Crude Bow'
  if (kind === 'reverse')
    [required(table.recipes[0]).fromBaseId, required(table.recipes[0]).toBaseId] = [
      required(table.recipes[0]).toBaseId,
      required(table.recipes[0]).fromBaseId,
    ]
  if (kind === 'implicit') required(table.recipes[1]).implicit = 'preserve'
  if (kind === 'extra') Object.assign(required(table.recipes[0]), { weight: 100 })
  if (kind === 'missingRow') table.recipes.pop()
  if (kind === 'duplicateRow') table.unresolved.push({ sourceRow: 1, reason: 'ambiguous-base' })
  expect(() => parseRuneforgingCatalog(table, catalog)).toThrow()
})

it('未解析行必须有明确原因且不能与可用配方重叠', () => {
  const table = input()
  table.recipes.pop()
  table.unresolved.push({ sourceRow: 2, reason: 'ambiguous-base' })
  expect(parseRuneforgingCatalog(table, catalog).unresolved).toHaveLength(1)
  required(table.unresolved[0]).reason = 'guess-first'
  expect(() => parseRuneforgingCatalog(table, catalog)).toThrow()
})

it('拒绝重复输入关系、隐藏输出及篡改基底语义', () => {
  const table = input()
  table.recipes[1] = { ...required(table.recipes[0]), sourceRow: 2 }
  expect(() => parseRuneforgingCatalog(table, catalog)).toThrow()
  for (const changes of [{ hidden: true }, { tags: ['gloves'] }, { type: 'Wand' }]) {
    const altered = structuredClone(catalog)
    Object.assign(
      required(altered.bases.find((b) => b.id === 'Runeforged Adherent Cuffs')),
      changes,
    )
    expect(() => parseRuneforgingCatalog(input(), altered)).toThrow()
  }
})

it('入库配方逐行记账，保留固有替换与未解析关系', () => {
  const table = parseRuneforgingCatalog(
    JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8')),
    catalog,
  )
  expect(table._meta.sourceRowCount).toBe(409)
  expect(table.recipes).toHaveLength(376)
  expect(table.unresolved).toHaveLength(33)
  expect(table.recipes.filter((r) => r.implicit === 'replace').map((r) => r.fromBaseId)).toEqual([
    'Flowing Raiment',
  ])
  expect(table.recipes.find((r) => r.fromBaseId === 'Adherent Cuffs')?.verisium).toBe(350)
  expect(table.recipes.some((r) => r.fromBaseId === 'Cassis Helm')).toBe(false)
})
