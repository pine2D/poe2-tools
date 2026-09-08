import { describe, expect, it } from 'vitest'
import { stripTradeSuffix } from './tradeSuffix'

describe('stripTradeSuffix', () => {
  it('英文名单内的后缀被剥离', () => {
    expect(stripTradeSuffix('#% increased Armour (Local)', 'en')).toBe('#% increased Armour')
    expect(stripTradeSuffix('#% increased Gold found in this Area (Gold Piles)', 'en')).toBe(
      '#% increased Gold found in this Area',
    )
  })
  it('zh-CN 半角与 zh-TW 全角括号都能剥离', () => {
    expect(stripTradeSuffix('护甲提高 #% (区域)', 'zh-CN')).toBe('护甲提高 #%')
    expect(stripTradeSuffix('使用剩余 # 次（石板）', 'zh-CN')).toBe('使用剩余 # 次')
    expect(stripTradeSuffix('擊殺時恢復#%魔力（珠寶）', 'zh-TW')).toBe('擊殺時恢復#%魔力')
    expect(stripTradeSuffix('#% 增加護甲 (部分)', 'zh-TW')).toBe('#% 增加護甲')
  })
  it('不在名单里的括号内容原样保留', () => {
    expect(stripTradeSuffix('Grants Skill: Purity of Fire (Level 20)', 'en')).toBe(
      'Grants Skill: Purity of Fire (Level 20)',
    )
    expect(stripTradeSuffix('(Local) at start only strips trailing', 'en')).toBe(
      '(Local) at start only strips trailing',
    )
  })
  it('剥离后去掉尾随空白（交易站个别词条末尾带空格）', () => {
    expect(stripTradeSuffix('Gain # Rage on Hit ', 'en')).toBe('Gain # Rage on Hit')
    expect(stripTradeSuffix('护甲提高 #% (区域) ', 'zh-CN')).toBe('护甲提高 #%')
  })
})
