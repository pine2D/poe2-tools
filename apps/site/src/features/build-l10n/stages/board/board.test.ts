import { describe, expect, it } from 'vitest'
import { cellClass, displayName, modsNote, passiveDelta, suffixOf } from './board'

describe('阶段看板纯函数', () => {
  it('格子类名：“同”与空变化不加修饰，待核对叠加', () => {
    expect(cellClass(null, false)).toBe('stageboard__cell')
    expect(cellClass('same', false)).toBe('stageboard__cell')
    expect(cellClass('modded', true)).toBe(
      'stageboard__cell stageboard__cell--modded stageboard__cell--miss',
    )
  })

  it('装备格词缀数：“改”写前后变化或“已改”，其余有词缀才写数', () => {
    expect(modsNote('modded', 1, 2)).toEqual({ className: 'stageboard__delta', text: '词缀 1→2' })
    expect(modsNote('modded', 2, 2)).toEqual({
      className: 'stageboard__delta',
      text: '词缀 2（已改）',
    })
    expect(modsNote('modded', 0, 0)).toEqual({ className: 'stageboard__delta', text: '已改' })
    expect(modsNote('same', 0, 3)).toEqual({ className: 'stageboard__count', text: '词缀 3' })
    expect(modsNote('added', 0, 0)).toBeNull()
  })

  it('aria 后缀、天赋增减与名称回退', () => {
    expect(suffixOf('added', '（词缀有变化）')).toBe('（本阶段新增）')
    expect(suffixOf('modded', '（词缀有变化）')).toBe('（词缀有变化）')
    expect(suffixOf('same', '（词缀有变化）')).toBe('')
    expect(passiveDelta(3)).toBe('（+3）')
    expect(passiveDelta(-2)).toBe('（−2）')
    expect(displayName({ id: 'x', en: 'Fire', text: null })).toBe('Fire')
    expect(displayName({ id: 'x', en: null, text: null })).toBe('x')
  })
})
