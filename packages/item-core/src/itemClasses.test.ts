import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { exportCraftItemText } from './craftItemText'
import { inspectItem } from './export'
import { canonicalItemClass, itemClassLabel } from './itemClasses'
import { parseItem } from './parse'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
it.each([
  ['Ashen Staff', 'Grants Skill: Level 12 Firebolt', 'zh-CN', '法杖', 'Staves'],
  ['Ashen Staff', 'Grants Skill: Level 12 Firebolt', 'zh-TW', '長杖', 'Staves'],
  ['Volatile Wand', 'Grants Skill: Level 12 Volatile Dead', 'zh-TW', '法杖', 'Wands'],
  ['Volatile Wand', 'Grants Skill: Level 12 Volatile Dead', 'zh-CN', 'Wands', 'Wands'],
  ['Volatile Wand', 'Grants Skill: Level 12 Volatile Dead', 'en', 'Wands', 'Wands'],
] as const)('%s %s %s 类别输出回读保持同一身份', (baseId, skill, locale, label, english) => {
  const result = exportCraftItemText(
    catalog,
    {
      baseId,
      itemLevel: 86,
      rarity: 'normal',
      sourceText: null,
      affixes: [],
      implicitLines: [skill],
    },
    { locale },
  )
  if (!result.ok) throw Error(result.error)
  expect(result.value.text.split('\n')[0]).toBe(
    `${locale === 'en' ? 'Item Class' : locale === 'zh-CN' ? '物品类别' : '物品種類'}: ${label}`,
  )
  const parsed = parseItem(result.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  expect(inspectItem(parsed.item, {}).exportText.split('\n')[0]).toBe(`Item Class: ${english}`)
})
it.each(['Future Type', 'constructor', 'toString', '__proto__'])('未知类别原样保留：%s', (name) => {
  expect(itemClassLabel(name, 'zh-CN')).toBe(name)
  expect(canonicalItemClass(name, 'zh-TW')).toBe(name)
})
