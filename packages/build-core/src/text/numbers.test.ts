import { describe, expect, it } from 'vitest'
import {
  applySign,
  fillNumbers,
  leadingSign,
  normalizeNumbers,
  stripLeadingSign,
  templateKey,
} from './numbers'

describe('normalizeNumbers', () => {
  it('整数', () => {
    expect(normalizeNumbers('+175 to maximum Life')).toEqual({
      template: '+# to maximum Life',
      numbers: ['175'],
    })
  })
  it('小数、区间、多个数字', () => {
    expect(normalizeNumbers('+4.4% to Critical Hit Chance')).toEqual({
      template: '+#% to Critical Hit Chance',
      numbers: ['4.4'],
    })
    expect(normalizeNumbers('Adds 2 to 4 Physical Damage to Attacks')).toEqual({
      template: 'Adds # to # Physical Damage to Attacks',
      numbers: ['2', '4'],
    })
  })
  it('负号留在模板里', () => {
    expect(normalizeNumbers('-10% to Fire Resistance')).toEqual({
      template: '-#% to Fire Resistance',
      numbers: ['10'],
    })
  })
  it('没有数字', () => {
    expect(normalizeNumbers('Ruby Ring')).toEqual({ template: 'Ruby Ring', numbers: [] })
  })
})

describe('fillNumbers', () => {
  it('按顺序回填', () => {
    expect(fillNumbers('攻击附加 # - # 物理伤害', ['2', '4'])).toBe('攻击附加 2 - 4 物理伤害')
  })
  it('个数不一致返回 null', () => {
    expect(fillNumbers('+# 最大生命', ['1', '2'])).toBeNull()
    expect(fillNumbers('# - # 伤害', ['1'])).toBeNull()
  })
  it('无占位符且无数字', () => {
    expect(fillNumbers('红宝石戒指', [])).toBe('红宝石戒指')
  })
})

describe('前导符号与模板键', () => {
  it('leadingSign / stripLeadingSign', () => {
    expect(leadingSign('+# to maximum Life')).toBe('+')
    expect(leadingSign('-#% to Fire Resistance')).toBe('-')
    expect(leadingSign('#% increased Spell Damage')).toBe('')
    expect(stripLeadingSign('+# to maximum Life')).toBe('# to maximum Life')
    expect(stripLeadingSign('  -#% x')).toBe('#% x')
  })
  it('templateKey 忽略前导符号、大小写与首尾空白', () => {
    expect(templateKey('+# to maximum Life')).toBe('# to maximum life')
    expect(templateKey('-#% to Fire Resistance ')).toBe('#% to fire resistance')
    expect(templateKey('#% Increased Spell Damage')).toBe(templateKey('#% increased spell damage'))
  })
  it('applySign', () => {
    expect(applySign('+#% 火焰抗性', '-')).toBe('-#% 火焰抗性')
    expect(applySign('+#% 火焰抗性', '+')).toBe('+#% 火焰抗性')
    expect(applySign('+#% 火焰抗性', '')).toBe('#% 火焰抗性')
    expect(applySign('法术伤害提高 #%', '-')).toBe('法术伤害提高 -#%')
    expect(applySign('所有火焰法术技能等级 +#', '-')).toBe('所有火焰法术技能等级 -#')
    expect(applySign('无占位符', '-')).toBe('无占位符')
  })
})
