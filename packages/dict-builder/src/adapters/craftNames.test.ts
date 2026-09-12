import { describe, expect, it } from 'vitest'
import { buildCraftNames } from './craftNames'

const table = (entries: unknown[], id = 'Runes') => ({ result: [{ id, entries }] })
const row = (id: string, text: string, image = '/rune.png') => ({ id, text, image })

describe('官方制作名称关联', () => {
  it('按分组与条目 ID 关联，忽略分隔和次序，简繁独立保留', () => {
    const en = table([row('storm', 'Storm Rune'), { id: 'sep' }, row('desert', 'Desert Rune')])
    const cn = table([row('desert', '沙漠符文'), { id: 'sep' }, row('storm', '风暴符文')])
    const tw = table([row('storm', '暴風符文'), row('desert', '沙漠符文')])
    const result = buildCraftNames({ en, 'zh-CN': cn, 'zh-TW': tw })
    expect(result.localizedNames).toEqual({
      'zh-CN': { 'Storm Rune': '风暴符文', 'Desert Rune': '沙漠符文' },
      'zh-TW': { 'Storm Rune': '暴風符文', 'Desert Rune': '沙漠符文' },
    })
    expect(result.audit['zh-CN']).toEqual({
      candidates: 2,
      joined: 2,
      missing: [],
      extra: [],
      names: 2,
    })
  })

  it('缺失保留为空缺并审计，不按同名或其他分组猜配', () => {
    const en = table([row('storm', 'Storm Rune'), row('absent', 'Absent Rune')])
    const cn = table([row('storm', '风暴符文')])
    const tw = table([row('storm', '暴風符文')], 'Other')
    const result = buildCraftNames({ en, 'zh-CN': cn, 'zh-TW': tw })
    expect(result.localizedNames).toEqual({ 'zh-CN': { 'Storm Rune': '风暴符文' }, 'zh-TW': {} })
    expect(result.audit['zh-CN'].missing).toEqual(['["Runes","absent"]'])
    expect(result.audit['zh-TW'].extra).toEqual(['["Other","storm"]'])
  })

  it('拒绝重复稳定键、破损条目及图片身份冲突', () => {
    const en = table([row('storm', 'Storm Rune')])
    for (const target of [
      table([row('storm', '风暴符文'), row('storm', '风暴符文')]),
      table([{ id: 'storm', text: 42 }]),
      table([row('storm', '风暴符文', '/another.png')]),
      { result: [{ id: 'Runes', entries: null }] },
    ]) {
      expect(() => buildCraftNames({ en, 'zh-CN': target, 'zh-TW': en })).toThrow()
    }
  })

  it('同英文不同中文的身份冲突失败，同译文可以合并且不丢关联计数', () => {
    const en = table([row('a', 'Test Rune'), row('b', 'Test Rune')])
    const cn = table([row('a', '符文甲'), row('b', '符文乙')])
    expect(() => buildCraftNames({ en, 'zh-CN': cn, 'zh-TW': en })).toThrow(/英文名称冲突/)
    const same = table([row('a', '测试符文'), row('b', '测试符文')])
    const result = buildCraftNames({ en, 'zh-CN': same, 'zh-TW': same })
    expect(result.localizedNames['zh-CN']).toEqual({ 'Test Rune': '测试符文' })
    expect(result.audit['zh-CN']).toMatchObject({ joined: 2, names: 1 })
  })
})
