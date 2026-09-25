import { expect, it } from 'vitest'
import { inspectItem } from './export'
import { parseItem } from './parse'

function inspect(line: string) {
  const parsed = parseItem(
    `Item Class: Bows\nRarity: Normal\nCrude Bow\n--------\n${line}\n--------\nItem Level: 86`,
  )
  if (!parsed.ok) throw new Error(parsed.error)
  return inspectItem(parsed.item, { items: { bases: { 'Crude Bow': '粗制弓' }, uniques: {} } })
}
it.each([
  ['物理伤害: 7-11 (augmented)', 'Physical Damage: 7-11 (augmented)'],
  ['火焰伤害：1–2', 'Fire Damage: 1–2'],
  ['冰霜伤害: 1.5 — 2.5', 'Cold Damage: 1.5 — 2.5'],
  ['闪电伤害: 1-9', 'Lightning Damage: 1-9'],
  ['混沌伤害: 1-2', 'Chaos Damage: 1-2'],
  ['元素伤害: 1-2 (augmented)，3-4', 'Elemental Damage: 1-2 (augmented)，3-4'],
  ['暴击几率: 5.00%', 'Critical Hit Chance: 5.00%'],
  ['每秒攻击次数: 1.20', 'Attacks per Second: 1.20'],
  ['装填时间: 0.80', 'Reload Time: 0.80'],
  ['物理傷害: 7-11', 'Physical Damage: 7-11'],
  ['暴擊機率: 6.51%', 'Critical Hit Chance: 6.51%'],
  ['Physical Damage: 7-11', 'Physical Damage: 7-11'],
])('武器属性对照保留数值与符号：%s', (source, expected) => {
  const result = inspect(source)
  expect(result.exportText).toContain(expected)
  expect(result.bridgeText).toBeNull()
})
it.each(['物理伤害: 1-', '暴击几率: 5', '每秒攻击次数: 1.20 surprise'])(
  '非法武器属性不猜译：%s',
  (source) => {
    const result = inspect(source)
    expect(result.exportText).toContain(source)
    expect(result.bridgeText).toBeNull()
  },
)
