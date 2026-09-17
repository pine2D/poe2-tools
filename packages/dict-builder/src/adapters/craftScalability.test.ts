import { describe, expect, it } from 'vitest'
import catalog from '../../../../data/craft/catalog.json'
import { normalizeCraftScalability } from './craftScalability'
import { parsePobModFile } from './restrictedLua'

describe('固定源属性缩放声明适配', () => {
  it('真实胸甲 Cunning 保留完整多行条件及 Bonded 声明，不制造半句声明', () => {
    const augment = catalog.augments.find(
      (entry) => entry.name === 'Carved Cunning' && entry.category === 'body armour',
    )
    if (!augment?.bonded?.lines[0] || !augment.lines[0]) throw new Error('缺少 Cunning 样本')
    const declarations = catalog.scalability as Record<string, unknown>
    expect(declarations[augment.lines.join('\n')]).toEqual([{ scalable: true, formats: [] }])
    expect(declarations[augment.bonded.lines[0]]).toEqual([{ scalable: true, formats: [] }])
    expect(declarations[augment.lines[0]]).toBeUndefined()
  })
  it.each(['0.35', '0.4', '0.45', '0.5'])('真实目录保留重生符文 %s 的源精度声明', (value) => {
    expect(
      (catalog.scalability as Record<string, unknown>)[
        `Regenerate ${value}% of maximum Life per second`
      ],
    ).toEqual([{ scalable: true, formats: ['per_minute_to_per_second_2dp_if_required'] }])
  })
  it('只适配当前目录的字面结构，来源中的 DNT 字面井号不当占位符', () => {
    const raw = parsePobModFile(
      'return { ["DNT Obliterated #233763"]={}, ["# Life"]={{isScalable=true}} }',
    )
    expect(normalizeCraftScalability(raw, ['10 Life']).lines).toEqual({
      '10 Life': [{ scalable: true, formats: [] }],
    })
  })
  it('窄模板保留条件数字，宽模板用于固定可缩放数值，范围不命中固定条件', () => {
    const raw = parsePobModFile(
      'return { ["# Life per 4 Strength"]={{isScalable=true}}, ["# Life per # Strength"]={{isScalable=true},{isScalable=true}}, ["Grants Skill"]={} }',
    )
    expect(
      normalizeCraftScalability(raw, [
        '+(10-19) Life per 4 Strength',
        '+10 Life per (4-8) Strength',
        'Grants Skill',
        'Missing',
      ]),
    ).toEqual({
      lines: {
        '+(10-19) Life per 4 Strength': [
          { scalable: true, formats: [] },
          { scalable: false, formats: [] },
        ],
        '+10 Life per (4-8) Strength': [
          { scalable: true, formats: [] },
          { scalable: true, formats: [] },
        ],
        'Grants Skill': [],
      },
      missing: ['Missing'],
    })
  })
  it('保留格式声明，缺 isScalable 按 Lua 条件视为不可缩放', () => {
    const raw = parsePobModFile(
      'return { ["#% Life"]={{isScalable=true,formats={"divide_by_one_hundred"}}},["Level # Skill"]={{formats={"specific_skill"}}} }',
    )
    expect(normalizeCraftScalability(raw, ['(0.5-0.7)% Life', 'Level 20 Skill']).lines).toEqual({
      '(0.5-0.7)% Life': [{ scalable: true, formats: ['divide_by_one_hundred'] }],
      'Level 20 Skill': [{ scalable: false, formats: ['specific_skill'] }],
    })
  })
  it.each([
    'return { ["# Life"]={{extra=true}} }',
    'return { ["# Life"]={} }',
    'return { ["# Life"]={{isScalable=1}} }',
    'return { ["# Life"]={{formats={false}}} }',
  ])('拒绝异常来源而非悄悄忽略', (source) => {
    expect(() => normalizeCraftScalability(parsePobModFile(source), ['10 Life'])).toThrow()
  })
})
