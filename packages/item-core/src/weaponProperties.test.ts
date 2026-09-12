import { expect, it } from 'vitest'
import { isItemStructureLine, parseItem } from './parse'

it.each([
  [
    '物品类别: 弩',
    [
      '物理伤害：999–999 (augmented)',
      '火焰伤害: 0-1',
      '冰霜伤害: 1.5 — 2.5',
      '闪电伤害: 1-9',
      '混沌伤害: 1-2',
      '元素伤害: 1-2 (augmented)，3-4, 5-6 (augmented)',
      '暴击几率: 0%',
      '暴击率: 6.51% (augmented)',
      '每秒攻击次数: 1.5',
      '装填时间: 0.8',
    ],
  ],
  [
    '物品種類: 弩',
    [
      '物理傷害: 9-10',
      '火焰傷害: 0-1',
      '冰冷傷害: 1-2',
      '閃電傷害: 1-9',
      '混沌傷害: 1-2',
      '元素傷害: 1-2, 3-4',
      '暴擊率: 0%',
      '暴擊機率: 6.51%',
      '每秒攻擊次數: 1',
      '重新裝填時間: 0.8',
    ],
  ],
  [
    'Item Class: Crossbows',
    [
      'Physical Damage: 9-10',
      'Fire Damage: 0-1',
      'Cold Damage: 1-2',
      'Lightning Damage: 1-9',
      'Chaos Damage: 1-2',
      'Elemental Damage: 1-2, 3-4, 5-6',
      'Critical Hit Chance: 0%',
      'Critical Strike Chance: 6.51%',
      'Attacks per Second: 1.5 (augmented)',
      'Reload Time: 0.8',
    ],
  ],
])('三语武器属性保留原行且不进入词缀 %s', (header, lines) => {
  const raw = `${header}\nRarity: Normal\nTest\n--------\n${lines.join('\n')}\n--------\nItem Level: 80`
  const result = parseItem(raw)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.item.rawText).toBe(raw)
  expect(result.item.diagnostics).toEqual([])
  expect(result.item.mods).toEqual([])
  expect(
    result.item.blocks
      .filter((b) => b.kind === 'properties')
      .flatMap((b) => b.lines.map((l) => l.raw)),
  ).toEqual(lines)
  for (const line of lines) expect(isItemStructureLine(line)).toBe(true)
})
it.each([
  'Physical Damage: 1-',
  'Physical Damage: -1-2',
  'Physical Damage: 1-2 surprise',
  'Physical Damage: 1-2%',
  'Critical Hit Chance: 5',
  'Attacks per Second: 1.5%',
  'Reload Time: 1 second',
  'Elemental Damage: 1-2, 3-',
  'Elemental Damage: 1-2, 3-4, 5-6, 7-8',
  'Unknown Damage: 1-2',
])('无效武器属性不被吞掉 %s', (line) => {
  const result = parseItem(
    `Item Class: Crossbows\nRarity: Normal\nTest\n--------\n${line}\n--------\nItem Level: 80`,
  )
  if (!result.ok) throw new Error(result.error)
  expect(result.item.diagnostics.length).toBeGreaterThan(0)
  expect(isItemStructureLine(line)).toBe(false)
})
it('属性标题在词缀组内不改变分组', () => {
  const result = parseItem(
    'Item Class: Crossbows\nRarity: Magic\nTest\n--------\nItem Level: 80\n--------\n{ Prefix Modifier "Test" (Tier: 1) }\nPhysical Damage: 1-2',
  )
  if (!result.ok) throw new Error(result.error)
  expect(result.item.blocks.some((b) => b.kind === 'properties')).toBe(false)
  expect(result.item.mods).toHaveLength(1)
})
