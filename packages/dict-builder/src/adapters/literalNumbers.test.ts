import { describe, expect, it } from 'vitest'
import { toLiteralVariant } from './literalNumbers'

describe('toLiteralVariant', () => {
  it('没有字面数字：原样', () => {
    expect(toLiteralVariant({ id: 'a', en: '# to maximum Life', text: '# 最大生命' })).toEqual({
      kind: 'unchanged',
    })
  })

  it('单个字面数字：en 与 text 都换成 #，order 指向源行数字下标', () => {
    expect(
      toLiteralVariant({
        id: 'a',
        en: '#% increased Attack Speed per 10 Dexterity',
        text: '每 10 敏捷使攻击速度提高 #%',
      }),
    ).toEqual({
      kind: 'variant',
      entry: {
        id: 'a',
        en: '#% increased Attack Speed per # Dexterity',
        text: '每 # 敏捷使攻击速度提高 #%',
        order: [1, 0],
      },
    })
  })

  it('语序一致时不写 order（小数也是一个数字）', () => {
    expect(
      toLiteralVariant({
        id: 'a',
        en: 'Trigger Decompose every 1.2 metres travelled',
        text: '每移动 1.2 米触发一次降解',
      }),
    ).toEqual({
      kind: 'variant',
      entry: {
        id: 'a',
        en: 'Trigger Decompose every # metres travelled',
        text: '每移动 # 米触发一次降解',
      },
    })
  })

  it('原有 order 与字面数字合并：源行数字顺序 [#0, #1, 4→2]，text 原有两个 # 的 order 为 [1, 0]', () => {
    expect(
      toLiteralVariant({
        id: 'a',
        en: 'Recover #% of Life over # seconds every 4 seconds',
        text: '每 4 秒在 # 秒内回复 #% 生命',
        order: [1, 0],
      }),
    ).toEqual({
      kind: 'variant',
      entry: {
        id: 'a',
        en: 'Recover #% of Life over # seconds every # seconds',
        text: '每 # 秒在 # 秒内回复 #% 生命',
        order: [2, 1, 0],
      },
    })
  })

  it('前导符号 + 非恒等 order 仍产出变体（不跳过）', () => {
    expect(
      toLiteralVariant({
        id: 'a',
        en: '+# to Maximum Spirit per 100 Maximum Life',
        text: '每 100 生命上限使精魂上限 +#',
      }),
    ).toEqual({
      kind: 'variant',
      entry: {
        id: 'a',
        en: '+# to Maximum Spirit per # Maximum Life',
        text: '每 # 生命上限使精魂上限 +#',
        order: [1, 0],
      },
    })
  })

  it('text 缺少该数字或数字集合不一致：跳过', () => {
    expect(
      toLiteralVariant({
        id: 'a',
        en: 'Gain 0% to #% increased Movement Speed',
        text: '获得 #% 移动速度',
      }),
    ).toEqual({ kind: 'skipped', reason: 'mismatch' })
  })

  it('en 里同一个数字出现两次：无法对应，跳过', () => {
    expect(
      toLiteralVariant({
        id: 'a',
        en: 'Every 10 seconds, gain 10 Rage',
        text: '每 10 秒获得 10 怒火',
      }),
    ).toEqual({ kind: 'skipped', reason: 'ambiguous' })
  })
})
