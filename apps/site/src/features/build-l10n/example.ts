// 自造最小示例；只包含已支持的官方 Build Planner 字段，不代表配装建议。
export const EXAMPLE_BUILD = JSON.stringify(
  {
    name: '示例构筑（自造）',
    author: 'PoE2 Tools',
    inventory_slots: [{ inventory_id: 'Helm1', additional_text: '1. +175 to maximum Life' }],
  },
  null,
  2,
)

// 自造三阶段示例：演示阶段并排对照；只包含已支持的官方 Build Planner 字段，不代表配装建议。
// 三份文件 link 相同，会归为同一构筑；名称都取自正式词典（example.test.ts 校验）。
const LINK = 'https://example.invalid/poe2-tools/example'
const BASE = { author: 'PoE2 Tools', link: LINK, ascendancy: 'Sorceress3' }
const STAFF = 'Metadata/Items/Gems/SkillGemFlameblast'
const STORM = 'Metadata/Items/Gems/SkillGemFirestorm'
const CASTING = 'Metadata/Items/Gem/SupportGemConsideredCasting'

const builds = [
  {
    ...BASE,
    name: '1–30 级 - 示例构筑（自造）',
    passives: ['strength16'],
    skills: [{ id: STORM, level_interval: [1, 100] }],
    inventory_slots: [
      {
        inventory_id: 'Weapon1',
        additional_text: 'Pyrophyte Staff\n1. 40% increased Spell Damage',
        level_interval: [1, 100],
        slot_x: 0,
        slot_y: 0,
      },
      {
        inventory_id: 'Ring2',
        additional_text: 'Ruby Ring\n1. +10 to maximum Life',
        level_interval: [8, 100],
        slot_x: 0,
        slot_y: 0,
      },
    ],
  },
  {
    ...BASE,
    name: '31–60 级 - 示例构筑（自造）',
    passives: ['strength16', 'strength16', 'AscendancyWitch1Notable4'],
    skills: [
      { id: STORM, level_interval: [1, 100] },
      { id: STAFF, level_interval: [31, 100], support_skills: [CASTING] },
    ],
    inventory_slots: [
      {
        inventory_id: 'Weapon1',
        additional_text:
          'Pyrophyte Staff\n1. 80% increased Spell Damage\n2. +2 to Level of all Fire Spell Skills',
        level_interval: [31, 100],
        slot_x: 0,
        slot_y: 0,
      },
      {
        inventory_id: 'Ring2',
        additional_text: 'Ruby Ring\n1. +10 to maximum Life',
        level_interval: [8, 100],
        slot_x: 0,
        slot_y: 0,
      },
      { inventory_id: 'Belt1', unique_name: 'Surefooted Sigil', slot_x: 0, slot_y: 0 },
    ],
  },
  {
    ...BASE,
    name: '终局 - 示例构筑（自造）',
    passives: [
      'strength16',
      'strength16',
      'strength16',
      'AscendancyWitch1Notable4',
      'AscendancyWitch1Notable4',
    ],
    skills: [{ id: STAFF, level_interval: [31, 100], support_skills: [CASTING] }],
    inventory_slots: [
      {
        inventory_id: 'Weapon1',
        additional_text:
          'Pyrophyte Staff\n1. 80% increased Spell Damage\n2. +2 to Level of all Fire Spell Skills',
        level_interval: [31, 100],
        slot_x: 0,
        slot_y: 0,
      },
      {
        inventory_id: 'Ring2',
        additional_text: 'Sapphire Ring\n1. +60 to maximum Life\n2. +30% to Fire Resistance',
        level_interval: [60, 100],
        slot_x: 0,
        slot_y: 0,
      },
      { inventory_id: 'Belt1', unique_name: 'Surefooted Sigil', slot_x: 0, slot_y: 0 },
    ],
  },
]

export const EXAMPLE_SERIES: readonly { name: string; text: string }[] = builds.map((build, i) => ({
  name: `example-${i + 1}.build`,
  text: JSON.stringify(build, null, 2),
}))
