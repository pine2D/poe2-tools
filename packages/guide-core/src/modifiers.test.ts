import { describe, expect, it } from 'vitest'
import { findModifiers } from './modifiers'

const words = (text: string) =>
  findModifiers(text).map((m) => `${text.slice(m.start, m.end)}=${m.zh}`)

describe('findModifiers', () => {
  it('数字百分比后的修饰词按词缀义处理', () => {
    expect(words('This gives 30% more damage but 20% reduced attack speed')).toEqual([
      'more=总增',
      'reduced=降低',
    ])
    expect(words('you get 50% More Damage every time')).toEqual(['More=总增'])
    expect(words('70% Increased Attack Damage and 100% Reduced Curse Effect')).toEqual([
      'Increased=提高',
      'Reduced=降低',
    ])
    expect(words('aim for 50%+ increased movement')).toEqual(['increased=提高'])
    expect(words('roll +(80-89)% increased Life')).toEqual(['increased=提高'])
  })
  it('句中首字母大写的修饰词后接大写属性名时也算词缀义', () => {
    expect(words('Be sure to get one with Less Maximum Life or none')).toEqual(['Less=总降'])
  })
  it('普通用法不算', () => {
    expect(words('Use it for more damage and more!')).toEqual([])
    expect(words('More importantly, keep moving.')).toEqual([])
    expect(words('you need less mana')).toEqual([])
  })
})
