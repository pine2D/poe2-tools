import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { matchesCatalogLines } from './catalogMatch'
import {
  inspectNumericLines,
  readNumericValues,
  renderNumericLines,
  sampleNumericValues,
} from './numeric'

describe('目录数值显示模型', () => {
  const patterns = [
    'Adds (1-3) to (4-6) Damage',
    '15% increased Light Radius',
    '-(8-3)% Cost',
    '+(1.5-2.0) Shield',
    '(5-5) fixed',
  ]
  it('仅提取范围，归一化降序与外置负号，并按端点显示精度推断步长', () => {
    expect(inspectNumericLines(patterns)).toEqual({
      ok: true,
      value: [
        { index: 0, lineIndex: 0, min: 1, max: 3, step: 1 },
        { index: 1, lineIndex: 0, min: 4, max: 6, step: 1 },
        { index: 2, lineIndex: 2, min: -8, max: -3, step: 1 },
        { index: 3, lineIndex: 3, min: 1.5, max: 2, step: 0.1 },
        { index: 4, lineIndex: 4, min: 5, max: 5, step: 1 },
      ],
    })
  })
  it('写入高级范围后可由整组匹配读取，行序变化不改变数值次序', () => {
    const values = [2, 5, -5, 1.7, 5]
    const rendered = renderNumericLines(patterns, values)
    expect(rendered).toEqual({
      ok: true,
      value: [
        'Adds 2(1-3) to 5(4-6) Damage',
        '15% increased Light Radius',
        '-5(-8--3)% Cost',
        '+1.7(1.5-2) Shield',
        '5(5-5) fixed',
      ],
    })
    if (!rendered.ok) return
    expect(matchesCatalogLines(patterns, rendered.value)).toBe(true)
    expect(readNumericValues(patterns, [...rendered.value].reverse())).toEqual({
      ok: true,
      value: values,
    })
    expect(readNumericValues(patterns, [...patterns].reverse())).toEqual({
      ok: true,
      value: [null, null, null, null, null],
    })
    expect(readNumericValues(['First (1-3)', 'Second (4-6)'], ['Second 5', 'First (1-3)'])).toEqual(
      { ok: true, value: [null, 5] },
    )
  })
  it.each(
    [
      [2, 5, -5, 1.75, 5],
      [2],
      [2, 5, -2, 1.7, 5],
      [2, 5, -5, Number.NaN, 5],
      [2, 5, -5, Number.POSITIVE_INFINITY, 5],
    ].map((values) => ({ values })),
  )('拒绝非法数量、精度、越界或非有限数值 %#', ({ values }) => {
    expect(renderNumericLines(patterns, values).ok).toBe(false)
  })
  it('拒绝错误常量、重复替代行和未知范围语法，读取保留范围内原始精度', () => {
    expect(readNumericValues(['15% Light', '(1-3) Mana'], ['16% Light', '2 Mana']).ok).toBe(false)
    expect(readNumericValues(['First (1-3)', 'Second (1-3)'], ['First 2', 'First 2']).ok).toBe(
      false,
    )
    expect(readNumericValues(['(1-3) Mana'], ['1.5 Mana'])).toEqual({ ok: true, value: [1.5] })
    expect(renderNumericLines(['(1-3) Mana'], [1.5]).ok).toBe(false)
    expect(inspectNumericLines(['(1 to 3) Mana']).ok).toBe(false)
    expect(inspectNumericLines(['Grants Skill: Level (1-20) Firebolt']).ok).toBe(false)
  })
  it('外置符号允许空格，带负端点和降序小数保持一致', () => {
    for (const [pattern, value] of [
      ['- (8-3)% Cost', -5],
      ['(-1.2--1.8) Cost', -1.5],
      ['-(-3--8) Cost', 5],
    ] as const) {
      const rendered = renderNumericLines([pattern], [value])
      expect(rendered.ok).toBe(true)
      if (rendered.ok)
        expect(readNumericValues([pattern], rendered.value)).toEqual({ ok: true, value: [value] })
    }
  })
  it('注入随机端点覆盖整数、小数、负数与固定值，非法随机结果返回错误', () => {
    expect(sampleNumericValues(patterns, () => 0)).toEqual({ ok: true, value: [1, 4, -8, 1.5, 5] })
    expect(sampleNumericValues(patterns, () => 0.999999999)).toEqual({
      ok: true,
      value: [3, 6, -3, 2, 5],
    })
    for (const value of [-1, 1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(sampleNumericValues(patterns, () => value).ok).toBe(false)
  })
  it('真实目录全部普通数值范围往返一致；技能范围明确不支持', () => {
    const catalog = JSON.parse(
      readFileSync(new URL('../../../data/craft/catalog.json', import.meta.url), 'utf8'),
    ) as CraftCatalog
    const entries = [
      ...catalog.modifiers.map((mod) => mod.lines),
      ...catalog.bases.map((base) => base.implicit?.split('\n') ?? []),
    ]
    let unsupported = 0
    for (const lines of entries) {
      const ranges = inspectNumericLines(lines)
      if (!ranges.ok) {
        unsupported += 1
        expect(lines.some((line) => /Grants Skill/i.test(line))).toBe(true)
        continue
      }
      for (const edge of ['min', 'max'] as const) {
        const values = ranges.value.map((range) => range[edge])
        const rendered = renderNumericLines(lines, values)
        expect(rendered.ok, lines.join('\n')).toBe(true)
        if (!rendered.ok) continue
        expect(matchesCatalogLines(lines, rendered.value), lines.join('\n')).toBe(true)
        expect(readNumericValues(lines, [...rendered.value].reverse()), lines.join('\n')).toEqual({
          ok: true,
          value: values,
        })
      }
    }
    expect(catalog.modifiers.filter((mod) => !mod.desecratedOnly && !mod.jewelOnly)).toHaveLength(
      2550,
    )
    expect(
      catalog.modifiers.filter((mod) => mod.jewelOnly && !mod.craftedOnly && !mod.radiusJewelOnly),
    ).toHaveLength(160)
    expect(catalog.modifiers.filter((mod) => mod.radiusJewelOnly && !mod.craftedOnly)).toHaveLength(
      160,
    )
    expect(catalog.modifiers.filter((mod) => mod.jewelOnly && mod.craftedOnly)).toHaveLength(16)
    expect(catalog.modifiers.filter((mod) => mod.desecratedOnly)).toHaveLength(199)
    expect(catalog.modifiers).toHaveLength(3085)
    expect(catalog.bases).toHaveLength(1827)
    expect(unsupported).toBe(52)
  })
  it.each([
    ['+(2.11-2.7)% to Critical Hit Chance', 2.12, true],
    ['(-2.11-2.7)% Chance', 0.12, true],
    ['(2000000.11-2000000.7)% Chance', 2000000.12, true],
    ['+(2.11-2.7)% to Critical Hit Chance', 2.1201, false],
    ['(-2.11-2.7)% Chance', 0.1201, false],
    ['(2000000.11-2000000.7)% Chance', 2000000.1201, false],
    ['+(2.11-2.7)% to Critical Hit Chance', 2.1099999999999994, false],
  ])('绝对显示网格避免端点相减误差：%s / %s', (pattern, value, valid) => {
    expect(renderNumericLines([pattern], [value]).ok).toBe(valid)
  })
})
