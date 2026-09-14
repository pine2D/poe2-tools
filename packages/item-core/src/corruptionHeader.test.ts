import { expect, it } from 'vitest'
import { parseItem } from './parse'

it.each(['Corrupted Enhancement', '腐化强化', '腐化強化'])(
  '高级文本 %s 是独立腐化强化组',
  (header) => {
    const parsed = parseItem(
      `Item Class: Bows\nRarity: Rare\nSynthetic Bow\nCrude Bow\n--------\nItem Level: 86\n--------\n{ ${header} — Attack, Speed }\n7(6-8)% increased Attack Speed\n--------\n{ Prefix Modifier "Heavy" — Damage, Physical }\n20(20-49)% increased Physical Damage\n--------\nCorrupted`,
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.item.mods.map((mod) => mod.kind)).toEqual(['enchant', 'prefix'])
    expect(parsed.item.corrupted).toBe(true)
    expect(parsed.item.mods[0]?.stats[0]?.raw).toBe('7(6-8)% increased Attack Speed')
  },
)
