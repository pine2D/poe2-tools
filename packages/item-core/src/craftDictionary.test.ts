import { expect, it } from 'vitest'
import type { CatalogBase } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { resolveBase } from './resolve'

const base: CatalogBase = {
  id: 'variant-id',
  name: 'Plain Spear',
  type: 'Spear',
  tags: [],
  requirements: {},
  properties: {},
  implicit: null,
  implicitTags: [],
  sourceQuality: null,
  socketLimit: null,
  hidden: false,
  runeforged: false,
}
it('只添加去重的目录 name 身份，原译名优先且不修改输入', () => {
  const catalog = {
    bases: [base, { ...base, id: 'variant-id-2' }, { ...base, id: 'known', name: 'Known Base' }],
  }
  const dictionary = {
    items: { bases: { 'Known Base': '原中文名' }, uniques: { Unique: '传奇' } },
    stats: { entries: [] },
  }
  const snapshot = JSON.stringify({ catalog, dictionary })
  const result = createCraftItemDictionary(catalog, dictionary)
  expect(result.items?.bases).toEqual({ 'Plain Spear': 'Plain Spear', 'Known Base': '原中文名' })
  expect(result.stats).toBe(dictionary.stats)
  expect(result.items?.uniques).toBe(dictionary.items.uniques)
  expect(JSON.stringify({ catalog, dictionary })).toBe(snapshot)
  const plain = createCraftItemDictionary(catalog)
  for (const name of ['variant-id', 'variant-id-2', 'Plain Speer', '未知中文'])
    expect(resolveBase([name], 'normal', plain.items?.bases ?? {}).english).toBeNull()
  expect(
    resolveBase(['Healthy Plain Spear of Test'], 'magic', plain.items?.bases ?? {}).english,
  ).toBe('Plain Spear')
})
it('中文同译名和英文身份碰撞均保留歧义', () => {
  const catalog = { bases: [base, { ...base, name: 'Other' }] }
  for (const bases of [{ 'Plain Spear': '同名', Other: '同名' }, { Other: 'Plain Spear' }]) {
    const dictionary = createCraftItemDictionary(catalog, { items: { bases, uniques: {} } })
    const name = 'Plain Spear' in bases ? '同名' : 'Plain Spear'
    const result = resolveBase([name], 'normal', dictionary.items?.bases ?? {})
    expect(result.english).toBeNull()
    expect(result.candidates).toHaveLength(2)
  }
})
