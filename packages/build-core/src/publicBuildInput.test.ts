import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildDictIndex,
  type Locale,
  parseBuildFile,
  parseDictBundle,
  serializeBuildFile,
  translateBuild,
} from './index'

// 固定导出器证明备注的排列，CLI 自测记录的是带 Has 的咒符范围。
// 不带 Has 的显式词缀、生命范围和所有构筑均为自造。私有样本只由宿主做聚合验证。
function loadIndex(locale: Locale) {
  const dir = new URL(`../../../data/dict/${locale}/`, import.meta.url)
  const table = (name: string) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'))
  const parsed = parseDictBundle({ stats: table('stats.json'), items: table('items.json') }, locale)
  if (!parsed.ok) throw new Error(parsed.error)
  return buildDictIndex(parsed.bundle)
}

const expected = {
  'zh-CN': {
    base: '亚麻腰带',
    title: '词缀优先级',
    charm: '咒符栏 (1-3)',
    hasCharm: '具有 (1-3) 个咒符栏',
    hasCharmId: 'implicit.stat_1416292992',
    single: '咒符栏 1',
    plural: '咒符栏 2',
    life: '+(14-28) 生命上限',
    damage: '攻击附加 (2-4) - (7-11) 物理伤害',
    reordered: '每 10 点精魂使法术伤害提高 -(02.50-04.00)%',
  },
  'zh-TW': {
    base: '麻布腰帶',
    title: '詞綴優先順序',
    charm: '(1-3)護符欄位',
    hasCharm: '有(1-3)個護符欄位',
    hasCharmId: 'explicit.stat_1416292992',
    single: '1護符欄位',
    plural: '2護符欄位',
    life: '+(14-28)最大生命',
    damage: '攻擊附加(2-4)至(7-11)物理傷害',
    reordered: '每10精魂增加-(02.50-04.00)%法術傷害',
  },
} as const

const charm = '1. (1-3) Charm Slots'
const life = '2. +(14-28) to maximum Life'
const divider = '-------------------'
const gear = (additional_text: string) => ({
  inventory_slots: [{ inventory_id: 'Belt1', additional_text }],
})

describe.each(['zh-CN', 'zh-TW'] as const)('公开导出格式的自造 .build（%s）', (locale) => {
  const index = loadIndex(locale)
  const zh = expected[locale]

  it('CLI 自测的 Has 写法和不带 Has 的自造词缀分别命中当地词典中的完整 ID', () => {
    const note = `<silver>{Linen Belt}\n\n<grey>{Stat Priority\n${divider}\n1. Has (1-3) Charm Slots\n2. (1-3) Charm Slots\n3. +(14-28) to maximum Life}`
    const { build, report } = translateBuild(gear(note), index)
    expect(build).toEqual(
      gear(
        `<silver>{${zh.base}}\n\n<grey>{${zh.title}\n${divider}\n1. ${zh.hasCharm}\n2. ${zh.charm}\n3. ${zh.life}}`,
      ),
    )
    expect(
      report.fields[0]?.lines.filter((line) => line.kind === 'mod').map((line) => line.statId),
    ).toEqual([zh.hasCharmId, 'explicit.stat_2582079000', 'explicit.stat_3299347043'])
    expect(report.modTranslated).toBe(3)
    expect(report.modCandidates).toBe(3)
  })

  it('导出的编号行以一个占位符回填整个范围，原标记、查找键和未知字段随文件保留', () => {
    const note = `<silver>{Linen Belt}\n<gold>{<b>{${charm}}}\n  ${life}  `
    const result = `<silver>{${zh.base}}\n<gold>{<b>{1. ${zh.charm}}}\n  2. ${zh.life}  `
    const slot = {
      inventory_id: 'Belt1',
      unique_name: 'Example for range checks',
      additional_text: note,
      level_interval: [12, 19],
      slot_x: 0,
      extra: { parts: ['(3-1)', 42] },
    }
    const input = { name: 'Range check', inventory_slots: [slot], future: { v: 3 } }
    const parsed = parseBuildFile(JSON.stringify(input))
    if (!parsed.ok) throw new Error(parsed.error)
    const { build, report } = translateBuild(parsed.build, index)
    expect(serializeBuildFile(build)).toBe(
      JSON.stringify(
        { ...input, inventory_slots: [{ ...slot, additional_text: result }] },
        null,
        2,
      ),
    )
    expect(
      report.fields[0]?.lines.filter((line) => line.kind === 'mod').map((line) => line.statId),
    ).toEqual(['explicit.stat_2582079000', 'explicit.stat_3299347043'])
    expect(translateBuild(build, index).build).toEqual(build)
  })

  it('多个范围、标量与小数按两服词条各自的占位顺序回填，前导符号跟随对应数值', () => {
    const input = gear(
      [
        '1. Adds (2-4) to (7-11) Physical Damage to Attacks',
        '2. -(02.50-04.00)% increased Spell Damage per 10 Spirit',
        '3. 1 Charm Slot',
        '4. 2 Charm Slots',
      ].join('\n'),
    )
    const { build } = translateBuild(input, index)
    expect(build.inventory_slots?.[0]?.additional_text).toBe(
      `1. ${zh.damage}\n2. ${zh.reordered}\n3. ${zh.single}\n4. ${zh.plural}`,
    )
  })

  it('未知、倒置、语法残缺、有多种词条解释或被标记截断的编号行保留原文', () => {
    const input = gear(
      [
        '1. (3-1) Charm Slots',
        '2. +(14--28) to maximum Life',
        '3. +14-28 to maximum Life',
        '4. +((14-28)) to maximum Life',
        '5. +(14-28 to maximum Life',
        '6. Adds (2-4) to (11-7) Physical Damage to Attacks',
        '7. (1-3) Charm Slots while moving',
        '8. (1-3) Charm Slot Effects',
        '9. +(14-28) to maximum Lives',
        '10. (4-6)% increased Armour, Evasion and Energy Shield',
        '<b>{11. +(14-28) to maximum Life} while standing still',
        '12. Has (1-3) Charm Slots while moving',
        '13. Has (1-3) to maximum Life',
        '14. +(9007199254740993-9007199254740992) to maximum Life',
        '15. -Has (1-3) Charm Slots',
        '16. +8 to maximum Life <b>{(3-1)}',
        '17.(1-3) Charm Slots',
        '(1-3) Charm Slots',
      ].join('\n'),
    )
    expect(translateBuild(input, index).build).toEqual(input)
  })

  it.each([false, true])('装备标题、分隔线和编号词缀对齐，二次导入幂等（双语 %s）', (bilingual) => {
    const opts = { bilingual, annotateUniques: false }
    const unknown = '1. Unknown engraving'
    const note = `<b>{Stat Priority}\n${divider}\n<grey>{${unknown}\n2. (1-3) Charm Slots\n3. +(14-28) to maximum Life}`
    const { build, report } = translateBuild(gear(note), index, opts)
    const output = bilingual
      ? `<b>{${zh.title}\nStat Priority}\n${divider}\n<grey>{${unknown}\n2. ${zh.charm}\n   (1-3) Charm Slots\n3. ${zh.life}\n   +(14-28) to maximum Life}`
      : `<b>{${zh.title}}\n${divider}\n<grey>{${unknown}\n2. ${zh.charm}\n3. ${zh.life}}`
    expect(build).toEqual(gear(output))
    expect(
      report.fields[0]?.lines
        .filter((line) => line.status === 'translated')
        .map((line) => line.line),
    ).toEqual([0, 3, 4])
    expect(report.modCandidates).toBe(3)
    expect(report.modTranslated).toBe(2)
    expect(translateBuild(build, index, opts).build).toEqual(build)
  })

  it('描述、技能和天赋的同名标题保留，装备中的孤立标题、句中片段和普通编号清单也保留', () => {
    const list = `Stat Priority\n${divider}\n${life}`
    const translated = `Stat Priority\n${divider}\n2. ${zh.life}`
    const notes = [
      'Stat Priority',
      `Stat Priority\n${divider}`,
      `Stat Priority\n2. +(14-28) to maximum Life`,
      `Check <b>{Stat Priority}\n${divider}\n${life}`,
      `Stat Priority\n${divider}\n1. Come back later.`,
    ]
    const input = {
      description: list,
      skills: [
        {
          id: 'test',
          additional_text: list,
          support_skills: [{ id: 'aux', additional_text: list }],
        },
      ],
      passives: [{ id: 'node', additional_text: list }],
      inventory_slots: notes.map((additional_text) => ({ inventory_id: 'Belt1', additional_text })),
    }
    expect(translateBuild(input, index).build).toEqual({
      description: translated,
      skills: [
        {
          id: 'test',
          additional_text: translated,
          support_skills: [{ id: 'aux', additional_text: translated }],
        },
      ],
      passives: [{ id: 'node', additional_text: translated }],
      inventory_slots: [
        notes[0],
        notes[1],
        `Stat Priority\n2. ${zh.life}`,
        `Check <b>{Stat Priority}\n${divider}\n2. ${zh.life}`,
        notes[4],
      ].map((additional_text) => ({ inventory_id: 'Belt1', additional_text })),
    })
  })
})
