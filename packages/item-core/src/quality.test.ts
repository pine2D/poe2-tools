import { describe, expect, it } from 'vitest'
import { parseItem } from './parse'
import { readItemQuality } from './quality'

function item(line?: string) {
  const text = `Item Class: Helmets\nRarity: Normal\nTest Helm${line ? `\n--------\nProperties:\n${line}` : ''}\n--------\nItem Level: 1`
  const parsed = parseItem(text)
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.item
}

describe('读取装备品质', () => {
  it.each(['Quality: +20%', '品质: 20% (augmented)', '品質：+30%'])(
    '读取三语明确品质：%s',
    (line) => {
      expect(readItemQuality(item(line))).toEqual({
        ok: true,
        value: Number(line.match(/\d+/)?.[0]),
      })
    },
  )

  it('缺失保持未知，格式错误、重复和越界拒绝', () => {
    expect(readItemQuality(item())).toEqual({ ok: true, value: undefined })
    expect(readItemQuality(item('Quality: 31%')).ok).toBe(false)
    expect(readItemQuality(item('Quality: twenty%')).ok).toBe(false)
    const duplicate = item('Quality: 20%')
    duplicate.blocks
      .find((block) => block.kind === 'properties')
      ?.lines.push({ raw: '品质: 20%', line: 7 })
    expect(readItemQuality(duplicate).ok).toBe(false)
  })
})
