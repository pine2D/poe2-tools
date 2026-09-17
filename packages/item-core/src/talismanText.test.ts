import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { exportCraftItemText } from './craftItemText'
import { inspectItem } from './export'
import { parseItem } from './parse'

it('魔符对照出口使用英文类别而不误标为咒符', () => {
  const parsed = parseItem('物品类别: 魔符\n稀有度: 普通\n易形魔符\n--------\n物品等级: 86')
  if (!parsed.ok) throw Error(parsed.error)
  const inspected = inspectItem(parsed.item, {
    items: { bases: { 'Changeling Talisman': '易形魔符' }, uniques: {} },
  })
  expect(inspected.exportText).toContain('Item Class: Talismans')
  expect(parsed.item.rawText).toContain('物品类别: 魔符')
})
it('演练英文文本导出正确魔符类别，不伪造授予形态技能', () => {
  const catalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')) as CraftCatalog
  const result = exportCraftItemText(catalog, {
    baseId: 'Changeling Talisman',
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
    quality: 0,
    sockets: [],
  })
  if (!result.ok) throw Error(result.error)
  expect(result.value.text).toContain('Item Class: Talismans')
  expect(result.value.text).not.toContain('Grants Skill:')
})
