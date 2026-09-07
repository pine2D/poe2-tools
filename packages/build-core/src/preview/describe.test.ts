import { describe, expect, it } from 'vitest'
import type { BuildFile } from '../format/types'
import { miniIndex } from '../testing/miniDict'
import { describeBuild, gemKey } from './describe'

describe('gemKey', () => {
  it('两种前缀都取末段', () => {
    expect(gemKey('Metadata/Items/Gems/SkillGemFlameblast')).toBe('SkillGemFlameblast')
    expect(gemKey('Metadata/Items/Gem/SupportGemConsideredCasting')).toBe(
      'SupportGemConsideredCasting',
    )
    expect(gemKey('NoSlash')).toBe('NoSlash')
  })
})

describe('describeBuild', () => {
  const build: BuildFile = {
    name: 'S',
    ascendancy: 'Sorceress3',
    passives: ['strength16', { id: 'unknown_node' }],
    skills: [
      {
        id: 'Metadata/Items/Gems/SkillGemFlameblast',
        support_skills: [
          'Metadata/Items/Gem/SupportGemConsideredCasting',
          { id: 'Metadata/Items/Gems/SupportGemNope' },
        ],
      },
      'Metadata/Items/Gems/SkillGemFirestorm',
    ],
    inventory_slots: [
      { inventory_id: 'Weapon1', additional_text: 'x' },
      { inventory_id: 'Belt1', unique_name: 'Surefooted Sigil' },
      { inventory_id: 'Charm1', slot_x: 2 },
      { inventory_id: 'Unknown9' },
    ],
  }

  it('升华、宝石、天赋、槽位', () => {
    const model = describeBuild(build, miniIndex)
    expect(model.ascendancy).toEqual({ code: 'Sorceress3', text: '女巫 · 第三升华（测试）' })
    expect(model.skills).toEqual([
      {
        id: 'Metadata/Items/Gems/SkillGemFlameblast',
        en: 'Flameblast',
        text: '烈焰冲击',
        supports: [
          {
            id: 'Metadata/Items/Gem/SupportGemConsideredCasting',
            en: 'Considered Casting',
            text: '深思施法',
          },
          { id: 'Metadata/Items/Gems/SupportGemNope', en: null, text: null },
        ],
      },
      {
        id: 'Metadata/Items/Gems/SkillGemFirestorm',
        en: 'Firestorm',
        text: '火焰风暴',
        supports: [],
      },
    ])
    expect(model.passives).toEqual([
      { id: 'strength16', en: 'Strength', text: '力量' },
      { id: 'unknown_node', en: null, text: null },
    ])
    expect(model.slots).toEqual([
      {
        inventoryId: 'Weapon1',
        label: '主手',
        slotX: 0,
        uniqueName: null,
        uniqueText: null,
        additionalText: 'x',
      },
      {
        inventoryId: 'Belt1',
        label: '腰带',
        slotX: 0,
        uniqueName: 'Surefooted Sigil',
        uniqueText: '稳步印记',
        additionalText: null,
      },
      {
        inventoryId: 'Charm1',
        label: '魔符',
        slotX: 2,
        uniqueName: null,
        uniqueText: null,
        additionalText: null,
      },
      {
        inventoryId: 'Unknown9',
        label: null,
        slotX: 0,
        uniqueName: null,
        uniqueText: null,
        additionalText: null,
      },
    ])
  })

  it('字段缺失时给空数组与 null', () => {
    expect(describeBuild({ name: 'empty' }, miniIndex)).toEqual({
      ascendancy: null,
      skills: [],
      passives: [],
      slots: [],
    })
  })

  it('字段形态畸形时不崩溃（与 translateBuild 对称）', () => {
    const odd = {
      skills: 'nope',
      passives: [null, {}],
      inventory_slots: [3, null],
    } as unknown as BuildFile
    expect(() => describeBuild(odd, miniIndex)).not.toThrow()
    expect(describeBuild(odd, miniIndex).slots).toEqual([])
  })
})
