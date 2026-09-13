import { describe, expect, it } from 'vitest'
import { scaleStatLine, splitStatScalars } from './statScalability'

describe('词缀缩放元数据', () => {
  it('范围、固定数字和占位符保留文本位置及字面结构', () => {
    expect(splitStatScalars('+(10-19) Life per 4 Strength').literals).toEqual([
      '',
      ' Life per ',
      ' Strength',
    ])
    expect(splitStatScalars('# Life per 4 Strength').tokens.map((x) => x.text)).toEqual(['#', '4'])
  })
  it('按内部百分之一精度缩放，不被目录端点的一位小数网格截断', () => {
    expect(
      scaleStatLine(
        'Leech (0.5-0.7)% as Life',
        'Leech 0.65% as Life',
        [{ scalable: true, formats: ['divide_by_one_hundred'] }],
        20,
      ),
    ).toEqual({ ok: true, value: 'Leech 0.78% as Life' })
  })
  it('已核对固定条件不缩放，可缩放的固定值可以参与计算', () => {
    expect(
      scaleStatLine(
        'Gain (10-20) Life for 4 seconds',
        'Gain 19 Life for 4 seconds',
        [
          { scalable: true, formats: [] },
          { scalable: false, formats: [] },
        ],
        20,
      ),
    ).toEqual({ ok: true, value: 'Gain 22 Life for 4 seconds' })
    expect(
      scaleStatLine(
        '+5 to Skill Level',
        '+5 to Skill Level',
        [{ scalable: true, formats: [] }],
        20,
      ),
    ).toEqual({ ok: true, value: '+6 to Skill Level' })
  })
  it('不可缩放数字即使带未实现格式也保留，negate不重复翻转显示符号', () => {
    expect(
      scaleStatLine(
        '(10-20)% reduced Cost',
        '19% reduced Cost',
        [{ scalable: true, formats: ['negate'] }],
        20,
      ),
    ).toEqual({ ok: true, value: '22% reduced Cost' })
    expect(
      scaleStatLine(
        'Grants Level 20 Skill',
        'Grants Level 20 Skill',
        [{ scalable: false, formats: ['specific_skill'] }],
        20,
      ),
    ).toEqual({ ok: true, value: 'Grants Level 20 Skill' })
  })
  it('每秒显示值对应多个内部值时，不猜中间值', () => {
    const result = scaleStatLine(
      '(1-2) Life Regeneration per second',
      '1.4 Life Regeneration per second',
      [{ scalable: true, formats: ['per_minute_to_per_second'] }],
      20,
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('1.6–1.7')
  })
  it('多内部值若缩放显示结果一致可以输出；零品质保持来源显示值', () => {
    expect(
      scaleStatLine(
        '(1-2) Life per second',
        '1.4 Life per second',
        [{ scalable: true, formats: ['per_minute_to_per_second'] }],
        0,
      ),
    ).toEqual({ ok: true, value: '1.4 Life per second' })
    expect(
      scaleStatLine(
        '(1-2) Life per second',
        '1.4 Life per second',
        [{ scalable: true, formats: ['per_minute_to_per_second'] }],
        1,
      ),
    ).toEqual({ ok: true, value: '1.4 Life per second' })
  })
  it('负数按绝对值截断，未知格式及不完整元数据不使用显示猜测', () => {
    expect(
      scaleStatLine('-(10-19) Cost', '-19 Cost', [{ scalable: true, formats: [] }], 20),
    ).toEqual({ ok: true, value: '-22 Cost' })
    for (const metadata of [[], [{ scalable: true, formats: ['unknown'] }]])
      expect(scaleStatLine('+(10-19) Life', '+19 Life', metadata, 20).ok).toBe(false)
    expect(
      scaleStatLine('+(10-19) Life', '+(10-19) Life', [{ scalable: true, formats: [] }], 20).ok,
    ).toBe(false)
  })
})
