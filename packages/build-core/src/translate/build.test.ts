import { describe, expect, it } from 'vitest'
import type { BuildFile } from '../format/types'
import { miniIndex } from '../testing/miniDict'
import { translateBuild } from './build'

const base = { bilingual: false, annotateUniques: true }

function sample(): BuildFile {
  return {
    name: 'S',
    description: 'Use any staff until Act 3.',
    passives: ['strength16', { id: 'attributes30_', additional_text: 'Ruby Ring' }],
    skills: [
      {
        id: 'Metadata/Items/Gems/SkillGemFlameblast',
        additional_text: '1. +10 to maximum Life',
        support_skills: [
          'Metadata/Items/Gem/SupportGemConsideredCasting',
          { id: 'x', additional_text: 'Pyrophyte Staff' },
        ],
      },
      'Metadata/Items/Gems/SkillGemFirestorm',
    ],
    inventory_slots: [
      {
        inventory_id: 'Weapon1',
        additional_text: 'Pyrophyte Staff\n1. 149% increased Spell Damage\n2. Unknown mod',
        slot_x: 0,
      },
      { inventory_id: 'Belt1', unique_name: 'Surefooted Sigil' },
      { inventory_id: 'Ring1', unique_name: 'Not In Dict', additional_text: 'keep me' },
      { inventory_id: 'Ring2', unique_name: 'Surefooted Sigil', additional_text: 'Ruby Ring' },
    ],
  }
}

describe('translateBuild', () => {
  it('翻译所有文本字段并保留其他字段与键序', () => {
    const input = sample()
    const snapshot = JSON.stringify(input)
    const { build } = translateBuild(input, miniIndex, base)
    expect(JSON.stringify(input)).toBe(snapshot)
    expect(build.inventory_slots?.[0]?.additional_text).toBe(
      '炎种长杖\n1. 法术伤害提高 149%\n2. Unknown mod',
    )
    expect(Object.keys(build.inventory_slots?.[0] ?? {})).toEqual([
      'inventory_id',
      'additional_text',
      'slot_x',
    ])
    const skill = build.skills?.[0]
    expect(typeof skill === 'object' && skill.additional_text).toBe('1. +10 最大生命')
    const support = typeof skill === 'object' ? skill.support_skills?.[1] : undefined
    expect(typeof support === 'object' && support.additional_text).toBe('炎种长杖')
    const passive = build.passives?.[1]
    expect(typeof passive === 'object' && passive.additional_text).toBe('红宝石戒指')
    expect(build.description).toBe('Use any staff until Act 3.')
  })

  it('传奇注入：命中则前置一行，未命中不动', () => {
    const { build } = translateBuild(sample(), miniIndex, base)
    expect(build.inventory_slots?.[1]).toEqual({
      inventory_id: 'Belt1',
      unique_name: 'Surefooted Sigil',
      additional_text: '<unique>{稳步印记}',
    })
    expect(build.inventory_slots?.[2]?.additional_text).toBe('keep me')
    expect(build.inventory_slots?.[3]?.additional_text).toBe('<unique>{稳步印记}\n红宝石戒指')
  })

  it('关闭传奇注入', () => {
    const { build } = translateBuild(sample(), miniIndex, { ...base, annotateUniques: false })
    expect(build.inventory_slots?.[1]?.additional_text).toBeUndefined()
  })

  it('报告按字段路径分组并统计', () => {
    const { report } = translateBuild(sample(), miniIndex, base)
    expect(report.fields.map((f) => f.path)).toEqual([
      'description',
      'inventory_slots[0].additional_text',
      'inventory_slots[2].additional_text',
      'inventory_slots[3].additional_text',
      'skills[0].additional_text',
      'skills[0].support_skills[1].additional_text',
      'passives[1].additional_text',
    ])
    // candidates：Weapon1 的 2 条编号行 + skills[0] 的 1 条编号行 + 命中的名称行 4 条（Pyrophyte Staff ×2、Ruby Ring ×2）
    expect(report.candidates).toBe(7)
    expect(report.translated).toBe(6)
    // 词缀口径：Weapon1 两条编号行（1 命中）+ skills[0] 一条（命中）
    expect(report.modCandidates).toBe(3)
    expect(report.modTranslated).toBe(2)
  })

  it('省略 options 时默认不双语、注入传奇', () => {
    const { build } = translateBuild(sample(), miniIndex)
    expect(build.inventory_slots?.[1]?.additional_text).toBe('<unique>{稳步印记}')
    expect(build.inventory_slots?.[0]?.additional_text).not.toContain('Pyrophyte Staff')
  })

  it('对已翻译输出再翻译一次，传奇注入不重复', () => {
    const once = translateBuild(sample(), miniIndex, base).build
    const twice = translateBuild(once, miniIndex, base).build
    expect(twice.inventory_slots?.[1]?.additional_text).toBe('<unique>{稳步印记}')
    expect(twice.inventory_slots?.[3]?.additional_text).toBe('<unique>{稳步印记}\n红宝石戒指')
  })

  it('inventory_slots 不是数组时不崩溃', () => {
    const odd = { name: 'x', inventory_slots: 'nope' } as unknown as BuildFile
    expect(translateBuild(odd, miniIndex, base).build).toEqual(odd)
  })
})
