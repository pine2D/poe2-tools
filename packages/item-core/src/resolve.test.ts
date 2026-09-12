import { describe, expect, it } from 'vitest'
import { resolveBase, resolveStat } from './resolve'

describe('中文装备术语反向识别', () => {
  it.each([' (unscalable)', '（不可缩放）', ' — Unscalable Value'])(
    '数值尾注 %s 与结构解析保持一致',
    (suffix) => {
      expect(
        resolveStat(`数值 5${suffix}`, [{ id: 'x', en: 'Value #', text: '数值 #' }]).english,
      ).toBe('Value 5 — Unscalable Value')
    },
  )
  it('仅对唯一的提高/降低配对作方向转换，保留倒序范围', () => {
    expect(
      resolveStat('每次使用消耗的充能次数降低 22(23-21)%', [
        { id: 'charge', en: '#% increased Charges per use', text: '每次使用消耗的充能次数提高 #%' },
      ]).english,
    ).toBe('22(23-21)% reduced Charges per use')
    expect(
      resolveStat('甲降低 2，乙提高 3', [
        { id: 'complex', en: '#% increased A and #% increased B', text: '甲提高 #，乙提高 #' },
      ]).english,
    ).toBeNull()
  })
  it('保留数值范围和符号，英文模板不再人为补一遍正号', () => {
    const result = resolveStat('闪电抗性 +18(16-20)%', [
      { id: 'resist', en: '#% to Lightning Resistance', text: '闪电抗性 #%' },
    ])
    expect(result.english).toBe('+18(16-20)% to Lightning Resistance')
  })

  it('使用逆排列恢复三个占位符，范围跟随数值移动', () => {
    const result = resolveStat('持续 3 秒，附加 1(1-2) 至 8(6-9) 点伤害', [
      {
        id: 'swap',
        en: 'Adds # to # Damage for # seconds',
        text: '持续 # 秒，附加 # 至 # 点伤害',
        order: [2, 0, 1],
      },
    ])
    expect(result.english).toBe('Adds 1(1-2) to 8(6-9) Damage for 3 seconds')
  })

  it('保留一对多译名，不默认取第一条', () => {
    const result = resolveStat('配置 同名天赋', [
      { id: 'a', en: 'Allocates A', text: '配置 同名天赋' },
      { id: 'b', en: 'Allocates B', text: '配置 同名天赋' },
    ])
    expect(result.english).toBeNull()
    expect(result.candidates.map((c) => c.english)).toEqual(['Allocates A', 'Allocates B'])
  })

  it('不可逆 order、未知属性与损坏范围不猜测', () => {
    const entries = [{ id: 'bad', en: '# and #', text: '# 与 #', order: [0, 0] }]
    expect(resolveStat('1 与 2', entries).english).toBeNull()
    expect(resolveStat('未收录', entries).english).toBeNull()
    expect(resolveStat('+18(16-20', [{ id: 'x', en: '#', text: '#' }]).english).toBeNull()
  })

  it('正确处理固定字面数字、降序范围和不计数值尾注', () => {
    expect(
      resolveStat('每 3 秒获得 22(23-21)% 防卫 — 数值不可估量', [
        { id: 'x', en: 'Gain #% Guard every 3 seconds', text: '每 3 秒获得 #% 防卫' },
      ]).english,
    ).toBe('Gain 22(23-21)% Guard every 3 seconds — Unscalable Value')
  })

  it('魔法装备名称只按有边界的已知基底匹配', () => {
    const bases = { 'Stone Charm': '磐石咒符', Charm: '咒符', Ring: '戒指' }
    expect(resolveBase(['晴空的 磐石咒符 调剂之'], 'magic', bases).english).toBe('Stone Charm')
    expect(resolveBase(['伪造磐石咒符名称'], 'magic', bases).english).toBeNull()
    expect(resolveBase(['甲 戒指 乙 磐石咒符'], 'magic', bases).english).toBeNull()
    expect(
      resolveBase(['Ring Iron Ring'], 'magic', { Ring: '戒指', 'Iron Ring': '铁戒指' }).english,
    ).toBeNull()
    expect(
      resolveBase(['Bright Iron Ring of Test'], 'magic', { Ring: '戒指', 'Iron Ring': '铁戒指' })
        .english,
    ).toBe('Iron Ring')
  })

  it('同一个中文基底有多个英文规范名时返回全部候选', () => {
    expect(
      resolveBase(['测试装备', '同名基底'], 'rare', { A: '同名基底', B: '同名基底' }).candidates,
    ).toHaveLength(2)
  })
})
