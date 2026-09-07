import { describe, expect, it } from 'vitest'
import { miniIndex } from '../testing/miniDict'
import { translateModLine, translateNameLine } from './lines'

describe('translateModLine', () => {
  it('整数回填', () => {
    expect(translateModLine('+175 to maximum Life', miniIndex)).toEqual({
      statId: 'explicit.stat_life',
      text: '+175 最大生命',
    })
  })
  it('小数与区间', () => {
    expect(translateModLine('+4.4% to Critical Hit Chance', miniIndex)?.text).toBe('+4.4% 暴击率')
    expect(translateModLine('Adds 2 to 4 Physical Damage to Attacks', miniIndex)?.text).toBe(
      '攻击附加 2 - 4 物理伤害',
    )
  })
  it('负号沿用到译文', () => {
    expect(translateModLine('-10% to Fire Resistance', miniIndex)?.text).toBe('-10% 火焰抗性')
    expect(translateModLine('-7 to Level of all Fire Spell Skills', miniIndex)?.text).toBe(
      '所有火焰法术技能等级 -7',
    )
  })
  it('大小写不敏感', () => {
    expect(translateModLine('149% Increased Spell Damage', miniIndex)?.text).toBe(
      '法术伤害提高 149%',
    )
  })
  it('英文模板含字面常数时归一化后键对不上，返回 null', () => {
    // 归一化把词典模板保留的 25 也换成了 #，templateKey 不匹配，查表即失败
    expect(translateModLine('3% increased Attack Speed per 25 Dexterity', miniIndex)).toBeNull()
  })
  it('未收录返回 null', () => {
    expect(translateModLine('Grenade Skills have +1 Cooldown Use', miniIndex)).toBeNull()
  })
})

describe('translateNameLine', () => {
  it('基底名', () => {
    expect(translateNameLine('Pyrophyte Staff', miniIndex)).toBe('炎种长杖')
    expect(translateNameLine('  Ruby Ring ', miniIndex)).toBe('红宝石戒指')
  })
  it('传奇名', () => {
    expect(translateNameLine('Surefooted Sigil', miniIndex)).toBe('稳步印记')
  })
  it('未收录返回 null', () => {
    expect(translateNameLine('Stat Priority', miniIndex)).toBeNull()
    expect(translateNameLine('', miniIndex)).toBeNull()
  })
})
