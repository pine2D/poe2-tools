import { describe, expect, it } from 'vitest'
import { buildDictIndex } from '../dict/index'
import type { DictBundle } from '../dict/types'
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
  it('符号嵌在模板中间，且不是源行首字符时不误判为前导符号', () => {
    expect(
      translateModLine('Minions have +15% to all Elemental Resistances', miniIndex)?.text,
    ).toBe('召唤物所有元素抗性 +15%')
    expect(translateModLine('Grenade Skills have -20% to Cooldown', miniIndex)?.text).toBe(
      '手榴弹技能冷却时间 -20%',
    )
  })
  it('作者漏写正号：源行没有符号时不剥掉译文模板里已有的符号', () => {
    expect(translateModLine('25% to Fire Resistance', miniIndex)?.text).toBe('+25% 火焰抗性')
  })
  it('order：译文占位符按声明顺序取源行数字', () => {
    expect(translateModLine('Recover 25% of Life over 3 seconds', miniIndex)?.text).toBe(
      '在 3 秒内回复 25% 生命',
    )
  })
  it('order 非恒等时，前导符号落到接收源行首个数字的占位符上（而非模板第一个 #）', () => {
    const bundle: DictBundle = {
      locale: 'zh-CN',
      stats: {
        _meta: {
          source: 'test',
          tier: 'manual',
          gameVersion: '0.0.0',
          fetchedAt: '2026-09-07',
          count: 1,
        },
        entries: [
          {
            id: 'x',
            en: '+# maximum Rage in the past # seconds',
            text: '过去 # 秒内怒火上限 +#',
            order: [1, 0],
          },
        ],
      },
    }
    const index = buildDictIndex(bundle)
    expect(translateModLine('+30 maximum Rage in the past 4 seconds', index)?.text).toBe(
      '过去 4 秒内怒火上限 +30',
    )
    expect(translateModLine('-30 maximum Rage in the past 4 seconds', index)?.text).toBe(
      '过去 4 秒内怒火上限 -30',
    )
  })
  it('order 长度与数字个数不一致时 fail-closed 返回 null', () => {
    const bundle: DictBundle = {
      locale: 'zh-CN',
      stats: {
        _meta: {
          source: 'test',
          tier: 'manual',
          gameVersion: '0.0.0',
          fetchedAt: '2026-09-07',
          count: 1,
        },
        entries: [
          { id: 'test.bad_order', en: 'Recover #% of Life', text: '回复 #% 生命', order: [0, 0] },
        ],
      },
    }
    const index = buildDictIndex(bundle)
    expect(translateModLine('Recover 25% of Life', index)).toBeNull()
  })
})

describe('translateModLine：reduced ↔ increased 对调', () => {
  it('词典只有 increased 形式时，reduced 行按对调后的键命中，译文表述词一并对调（zh-CN 提高→降低）', () => {
    expect(translateModLine('25% reduced Spell Damage', miniIndex)).toEqual({
      statId: 'explicit.stat_spell',
      text: '法术伤害降低 25%',
    })
  })
  it('zh-TW 用 增加→減少', () => {
    const bundle: DictBundle = {
      locale: 'zh-TW',
      stats: {
        _meta: {
          source: 't',
          tier: 'primary',
          gameVersion: '0',
          fetchedAt: '2026-09-09',
          count: 1,
        },
        entries: [
          {
            id: 'explicit.stat_attr',
            en: '#% increased Attribute Requirements',
            text: '增加#%能力值需求',
          },
        ],
      },
    }
    expect(
      translateModLine('20% reduced Attribute Requirements', buildDictIndex(bundle))?.text,
    ).toBe('減少20%能力值需求')
  })
  it('词典自带 reduced 形式的条目走原键，不做对调', () => {
    const bundle: DictBundle = {
      locale: 'zh-CN',
      stats: {
        _meta: {
          source: 't',
          tier: 'primary',
          gameVersion: '0',
          fetchedAt: '2026-09-09',
          count: 2,
        },
        entries: [
          {
            id: 'explicit.stat_cost_inc',
            en: '#% increased Mana Cost of Skills',
            text: '技能魔力消耗提高 #%',
          },
          {
            id: 'explicit.stat_cost_red',
            en: '#% reduced Mana Cost of Skills',
            text: '技能魔力消耗降低 #%',
          },
        ],
      },
    }
    expect(translateModLine('10% reduced Mana Cost of Skills', buildDictIndex(bundle))).toEqual({
      statId: 'explicit.stat_cost_red',
      text: '技能魔力消耗降低 10%',
    })
  })
  it('译文表述词不唯一、源行 reduced 不唯一或源行另含 increased 时放弃对调，返回 null', () => {
    const bundle: DictBundle = {
      locale: 'zh-CN',
      stats: {
        _meta: {
          source: 't',
          tier: 'primary',
          gameVersion: '0',
          fetchedAt: '2026-09-09',
          count: 2,
        },
        entries: [
          // 译文有两个"提高"，无法判定该换哪个
          { id: 'a', en: '#% increased Damage while Focused', text: '专注时伤害提高 #%，持续提高' },
          // 源行含两个 reduced、或 reduced 与 increased 并存时，源侧守卫直接放弃，不会查到这条
          {
            id: 'b',
            en: '#% increased Attack and #% increased Cast Speed',
            text: '攻击速度提高 #%，施法速度提高 #%',
          },
        ],
      },
    }
    const index = buildDictIndex(bundle)
    expect(translateModLine('5% reduced Damage while Focused', index)).toBeNull()
    expect(translateModLine('5% reduced Attack and 5% increased Cast Speed', index)).toBeNull()
    expect(translateModLine('5% reduced Attack and 5% reduced Cast Speed', index)).toBeNull()
  })
  it('行首大写 Reduced 同样对调；对调后仍未收录返回 null', () => {
    expect(translateModLine('30% Reduced Spell Damage', miniIndex)?.text).toBe('法术伤害降低 30%')
    expect(translateModLine('30% reduced Frost Damage', miniIndex)).toBeNull()
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
