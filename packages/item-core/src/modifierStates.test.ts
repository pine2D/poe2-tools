import { describe, expect, it } from 'vitest'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { resolveStat } from './resolve'

const header = '{ Suffix Modifier "Test" (Tier: 1) — mana }'
function item(lines: string, title = header) {
  const parsed = parseItem(
    'Item Class: Foci\nRarity: Rare\nTest\nRuned Focus\n--------\nItem Level: 80\n--------\n' +
      title +
      '\n' +
      lines,
  )
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.item
}
const entries = [{ id: 'explicit.stat_3291658075', en: '+# to maximum Mana', text: '+# 魔力上限' }]

describe('特殊词缀状态保留', () => {
  it.each(['crafted', 'fractured', 'desecrated'])('解析 %s 并阻止 CoE 转接', (state) => {
    const source = item(`+15(10-20) to maximum Mana (${state})`)
    expect(source.mods[0]?.stats[0]).toMatchObject({
      text: '+15 to maximum Mana',
      states: [state],
      rolls: [{ value: 15, range: [10, 20] }],
    })
    expect(source.mods[0]?.states).toEqual([state])
    delete source.mods[0]?.states
    delete source.mods[0]?.stats[0]?.states
    const inspection = inspectItem(source, {
      items: { bases: { 'Runed Focus': 'Runed Focus' }, uniques: {} },
      stats: { entries },
    })
    expect(inspection.mods[0]?.stats[0]?.resolution.english).toBe(
      `+15(10-20) to maximum Mana (${state})`,
    )
    expect(inspection.bridgeText).toBeNull()
    expect(inspection.bridgeReasons.join()).toMatch(/特殊词缀/)
  })
  it.each(['+15 魔力上限', '+15 最大魔力', '+15 to maximum Mana'])(
    '保留本地属性和混合行状态 %s',
    (text) => {
      const source = item(`${text} (Crafted) (fractured) (crafted)\n+20 to maximum Mana`)
      expect(source.mods[0]?.states).toEqual(['crafted', 'fractured'])
      expect(source.mods[0]?.stats[0]?.states).toEqual(['crafted', 'fractured'])
      expect(source.mods[0]?.stats[1]).not.toHaveProperty('states')
      expect(source.mods[0]?.stats[0]?.raw).toBe(`${text} (Crafted) (fractured) (crafted)`)
    },
  )
  it.each([
    '(fractured) (unscalable)',
    '(unscalable) (fractured)',
    '(fractured) — Unscalable Value',
  ])('与不可缩放尾注组合 %s', (suffix) => {
    const source = item(`+15(10-20) 魔力上限 ${suffix}`)
    expect(source.mods[0]?.stats[0]).toMatchObject({
      text: '+15 魔力上限',
      states: ['fractured'],
      unscalable: true,
    })
    expect(resolveStat(`+15(10-20) 魔力上限 ${suffix}`, entries).english).toBe(
      '+15(10-20) to maximum Mana (fractured) — Unscalable Value',
    )
  })
  it('歧义候选和手选英文仍携带状态', () => {
    const source = item('+15 魔力上限 (desecrated)')
    source.locale = 'zh-CN'
    const ambiguous = [...entries, { id: 'other', en: '+# to maximum Life', text: '+# 魔力上限' }]
    const resolution = resolveStat('+15 魔力上限 (desecrated)', ambiguous)
    expect(resolution.english).toBeNull()
    expect(resolution.candidates.map((c) => c.english)).toEqual([
      '+15 to maximum Mana (desecrated)',
      '+15 to maximum Life (desecrated)',
    ])
    const line = source.mods[0]?.stats[0]?.line
    if (line === undefined) throw new Error('缺少测试属性行')
    expect(
      inspectItem(source, { stats: { entries: ambiguous } }, { [line]: 'other' }).mods[0]?.stats[0]
        ?.resolution.english,
    ).toBe('+15 to maximum Life (desecrated)')
  })
  it.each(['Crafted', 'Fractured', 'Desecrated'])('仅明确标题前导识别 %s', (state) => {
    const source = item(
      '+15 to maximum Mana',
      header.replace('Suffix Modifier', `${state} Suffix Modifier`),
    )
    expect(source.mods[0]?.states).toEqual([state.toLowerCase()])
    expect(source.mods[0]?.stats[0]).not.toHaveProperty('states')
    const line = source.mods[0]?.header.line
    if (line === undefined) throw new Error('缺少测试属性头')
    expect(inspectItem(source, {}).englishByLine[line]).toContain(state)
  })
  it('未知标记和名字不推断来源', () => {
    for (const suffix of ['(foo)', '(工艺)', '{crafted}', '(craftedness)']) {
      const source = item(`+15 魔力上限 ${suffix}`, header.replace('"Test"', '"Crafted Essence"'))
      expect(source.mods[0]).not.toHaveProperty('states')
      expect(source.mods[0]?.stats[0]?.text).toContain(suffix)
      expect(resolveStat(`+15 魔力上限 ${suffix}`, entries).english).toBeNull()
    }
    expect(resolveStat('+15 魔力上限 (foo) (crafted)', entries).english).toBeNull()
  })
  it('Fractured Item 独立保留且不假造组来源', () => {
    const source = item('+15 to maximum Mana\n--------\nFractured Item')
    expect(source.fractured).toBe(true)
    expect(source.blocks.at(-1)?.kind).toBe('flags')
    expect(source.mods[0]).not.toHaveProperty('states')
    expect(item('+15 to maximum Mana')).not.toHaveProperty('fractured')
  })
})
