import { describe, expect, it } from 'vitest'
import { parsePobBaseEntries, parsePobBaseFile, parsePobModFile } from './restrictedLua'

describe('parsePobModFile', () => {
  it('解析混合表、数字键、注释和字符串转义', () => {
    const parsed = parsePobModFile(String.raw`
      -- 文件头
      return {
        ["X"] = {
          "line with } and { and (parentheses)",
          'escaped\nquote: \'',
          "ASCII: \x41\065",
          level = 4,
          statOrder = { 1.25, -2, 3e2 },
          keys = { "a", "default" },
          flags = { enabled = true, disabled = false, missing = nil },
          [4080418644] = "trade hash",
        },
      }
    `)

    expect(Object.getPrototypeOf(parsed)).toBeNull()
    expect(Object.getPrototypeOf(parsed.X)).toBeNull()
    expect(parsed.X).toEqual({
      '1': 'line with } and { and (parentheses)',
      '2': "escaped\nquote: '",
      '3': 'ASCII: AA',
      '4080418644': 'trade hash',
      level: 4,
      statOrder: { '1': 1.25, '2': -2, '3': 300 },
      keys: { '1': 'a', '2': 'default' },
      flags: { enabled: true, disabled: false, missing: null },
    })
  })

  it('拒绝重复键、调用、表达式、尾随代码与不完整输入', () => {
    const invalidSources = [
      'return { key = 1, key = 2 }',
      'return { [1] = "explicit", "implicit" }',
      'return os.execute("bad")',
      'return { value = setmetatable({}, {}) }',
      'return { value = 1 + 2 }',
      'return {} os.execute("bad")',
      'return { value = "unfinished',
      'return { value = { 1 }',
    ]

    for (const source of invalidSources) {
      expect(() => parsePobModFile(source), source).toThrow()
    }
  })

  it('拒绝非有限数字键、数字形式的字符串键与非 ASCII 十进制转义', () => {
    const invalidSources = [
      'return { [1e309] = "overflow" }',
      'return { ["1"] = "numeric string" }',
      'return { ["001"] = "normalized numeric string" }',
      String.raw`return { "\195\169" }`,
      String.raw`return { "\xC3\xA9" }`,
    ]

    for (const source of invalidSources) {
      expect(() => parsePobModFile(source), source).toThrow()
    }
  })

  it('拒绝超出深度上限的表', () => {
    const source = `return ${'{'.repeat(101)}${'}'.repeat(101)}`
    expect(() => parsePobModFile(source)).toThrow(/深度/)
  })

  it('将 __proto__ 当作普通字段且仍拒绝重复', () => {
    const parsed = parsePobModFile('return { ["__proto__"] = "safe" }')
    expect(Object.getOwnPropertyDescriptor(parsed, '__proto__')?.value).toBe('safe')
    expect(() => parsePobModFile('return { ["__proto__"] = 1, __proto__ = 2 }')).toThrow(/重复/)
  })
})

describe('parsePobBaseFile', () => {
  it('entries API 按声明顺序保留同名但内容不同的基底', () => {
    const source = `
      return function(itemBases)
        itemBases["Runemastered Veridical Chain"] = { hidden = true, implicit = "one" }
        itemBases["Plain Chain"] = { hidden = false }
        itemBases["Runemastered Veridical Chain"] = { hidden = true, implicit = "two" }
      end
    `

    expect(parsePobBaseEntries(source)).toEqual([
      {
        name: 'Runemastered Veridical Chain',
        value: { hidden: true, implicit: 'one' },
      },
      { name: 'Plain Chain', value: { hidden: false } },
      {
        name: 'Runemastered Veridical Chain',
        value: { hidden: true, implicit: 'two' },
      },
    ])
    expect(() => parsePobBaseFile(source)).toThrow(/重复/)
  })

  it('只解析 itemBases 赋值包装，支持空白与注释', () => {
    const parsed = parsePobBaseFile(`
      -- 生成文件
      return function(itemBases)
        itemBases["Demo"] = { type = "Focus", tags = { focus = true } }
        -- 条目间注释
        itemBases['Other'] = { type = 'Ring' }
      end
    `)

    expect(Object.getPrototypeOf(parsed)).toBeNull()
    expect(parsed).toEqual({
      Demo: { type: 'Focus', tags: { focus: true } },
      Other: { type: 'Ring' },
    })
  })

  it('拒绝重复基底、调用、不同参数、尾随代码及不完整包装', () => {
    const invalidSources = [
      'return function(itemBases) itemBases["Demo"] = {} itemBases["Demo"] = {} end',
      'return function(itemBases) os.execute("bad") end',
      'return function(itemBases) itemBases["Demo"] = setmetatable({}, {}) end',
      'return function(other) other["Demo"] = {} end',
      'return function(itemBases) itemBases["Demo"] = {} end print("bad")',
      'return function(itemBases) itemBases["Demo"] = {}',
    ]

    for (const source of invalidSources) {
      expect(() => parsePobBaseFile(source), source).toThrow()
    }
  })
})
