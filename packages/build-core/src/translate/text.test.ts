import { describe, expect, it } from 'vitest'
import { miniIndex } from '../testing/miniDict'
import { translateText } from './text'

const mono = { bilingual: false }

describe('translateText', () => {
  it('基底名行与编号词缀行', () => {
    const result = translateText(
      'Pyrophyte Staff\n1. 149% increased Spell Damage\n2. Grenade Skills have +1 Cooldown Use',
      miniIndex,
      mono,
    )
    expect(result.text).toBe(
      '炎种长杖\n1. 法术伤害提高 149%\n2. Grenade Skills have +1 Cooldown Use',
    )
    expect(result.lines).toEqual([
      {
        line: 0,
        kind: 'name',
        status: 'translated',
        original: 'Pyrophyte Staff',
        translated: '炎种长杖',
        statId: null,
      },
      {
        line: 1,
        kind: 'mod',
        status: 'translated',
        original: '149% increased Spell Damage',
        translated: '法术伤害提高 149%',
        statId: 'explicit.stat_spell',
      },
      {
        line: 2,
        kind: 'mod',
        status: 'untranslated',
        original: 'Grenade Skills have +1 Cooldown Use',
        translated: null,
        statId: null,
      },
    ])
  })

  it('标记原样保留，只翻译标记内外的文本；空行不进报告', () => {
    const input = '<silver>{Any Charm}\n\n<grey>{Stat Priority\n---\n1. +10 to maximum Life}'
    const result = translateText(input, miniIndex, mono)
    expect(result.text).toBe('<silver>{任意魔符}\n\n<grey>{Stat Priority\n---\n1. +10 最大生命}')
    expect(result.lines.map((l) => [l.line, l.status])).toEqual([
      [0, 'translated'],
      [2, 'kept'],
      [3, 'kept'],
      [4, 'translated'],
    ])
  })

  it('嵌套标记内的编号行', () => {
    const result = translateText('<m>{<red>{1. +10 to maximum Life}}', miniIndex, mono)
    expect(result.text).toBe('<m>{<red>{1. +10 最大生命}}')
  })

  it('未闭合标记整段透传，正文仍按行翻译', () => {
    const result = translateText('<red>{Ruby Ring\n1. +10 to maximum Life', miniIndex, mono)
    expect(result.text).toBe('<red>{Ruby Ring\n1. +10 最大生命')
  })

  it('双语模式在译文后追加原文行', () => {
    const result = translateText('Ruby Ring\n1. +10 to maximum Life', miniIndex, {
      bilingual: true,
    })
    expect(result.text).toBe('红宝石戒指\nRuby Ring\n1. +10 最大生命\n   +10 to maximum Life')
    // 报告行号始终是输入行号，不随双语输出增行而变
    expect(result.lines.map((l) => l.line)).toEqual([0, 1])
  })

  it('行内标记把编号行切碎：不匹配、不计入候选（已知限制）', () => {
    const result = translateText('1. <b>{+10 to maximum Life}', miniIndex, mono)
    expect(result.text).toBe('1. <b>{+10 to maximum Life}')
    expect(result.lines.every((l) => l.status === 'kept')).toBe(true)
  })

  it('空文本', () => {
    expect(translateText('', miniIndex, mono)).toEqual({ text: '', lines: [] })
  })
})
