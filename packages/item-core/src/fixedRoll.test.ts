import { describe, expect, it } from 'vitest'
import { readCatalogLineValues } from './catalogMatch'
import { parseItem } from './parse'
import { resolveStat } from './resolve'
import { scaleStatLine } from './statScalability'

describe('高级复制的当前值与固定基础值', () => {
  it('固定基础值与范围分别保留，基础值不成为第二个 roll', () => {
    const parsed = parseItem(
      '物品类别: 戒指\n稀有度: 稀有\n测试戒指\n--------\n物品等级: 86\n--------\n{ 前缀属性 "测试" }\n数值 +12(10)，-2(-2)，6.65(6-6.9)，条件 3 秒',
    )
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.item.mods[0]?.stats[0]).toMatchObject({
      text: '数值 +12，-2，6.65，条件 3 秒',
      rolls: [
        { value: 12, range: null, baseValue: 10 },
        { value: -2, range: null, baseValue: -2 },
        { value: 6.65, range: [6, 6.9] },
        { value: 3, range: null },
      ],
    })
    expect(parsed.item.diagnostics).toEqual([])
  })

  it('词典占位符换序时携带完整固定值注释与原有尾注', () => {
    expect(
      resolveStat('持续 3(3) 秒，数值 +12(10) (fractured)', [
        {
          id: 'fixed',
          text: '持续 # 秒，数值 #',
          en: 'Value # for # seconds',
          order: [1, 0],
        },
      ]).english,
    ).toBe('Value +12(10) for 3(3) seconds (fractured)')
  })

  it.each(['15(15)', '15(15.0)', '15(+15)'])('固定属性 %s 与目录一致时可以对应', (value) => {
    expect(
      readCatalogLineValues(['15% increased Light Radius'], [`${value}% increased Light Radius`]),
    ).toEqual([[]])
  })

  it('增效固定值、错误基础值及用固定注释冒充可变范围均不能对应', () => {
    for (const value of ['18(15)', '15(12)', '15(15-15)']) {
      expect(
        readCatalogLineValues(['15% increased Light Radius'], [`${value}% increased Light Radius`]),
      ).toBeNull()
    }
    expect(
      readCatalogLineValues(
        ['(10-19)% increased Light Radius'],
        ['15(15)% increased Light Radius'],
      ),
    ).toBeNull()
    expect(
      readCatalogLineValues(['15% increased Light Radius'], ['15(15)5% increased Light Radius']),
    ).toBeNull()
  })

  it('固定数值按十进制精确比较，不把浮点舍入后的相等当成原文一致', () => {
    expect(
      readCatalogLineValues(['9007199254740992 Life'], ['9007199254740993(9007199254740992) Life']),
    ).toBeNull()
    expect(readCatalogLineValues(['0.1 Life'], ['0.1(0.10000000000000001) Life'])).toBeNull()
  })

  it('固定数字紧邻范围时，匹配不会贪婪吞掉后一个数值', () => {
    expect(readCatalogLineValues(['suffix1 (1-10)'], ['suffix1 10'])).toEqual([[10]])
    expect(readCatalogLineValues(['1 (1-10)'], ['1(1) 10'])).toEqual([[10]])
  })

  it('正负固定值和同一行的可变范围各自校验', () => {
    expect(
      readCatalogLineValues(
        ['+(10-19) Life for 3 seconds and -2 Mana'],
        ['+12(10-19) Life for 3(3) seconds and -2(-2) Mana'],
      ),
    ).toEqual([[12]])
    expect(readCatalogLineValues(['+2 Life'], ['+2(2) Life'])).toEqual([[]])
  })

  it('固定注释核对后催化按一个数值计算，条件仍不缩放', () => {
    expect(
      scaleStatLine(
        '+10 Life for 3 seconds',
        '+10(10) Life for 3(3) seconds',
        [
          { scalable: true, formats: [] },
          { scalable: false, formats: [] },
        ],
        20,
      ),
    ).toEqual({ ok: true, value: '+12 Life for 3 seconds' })
  })
})
