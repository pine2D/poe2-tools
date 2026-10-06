import { describe, expect, it } from 'vitest'
import { miniBundle, miniIndex } from '../../../../../../packages/build-core/src/testing/miniDict'
import type { LoadedDict } from '../../../shared/dict/loadDict'
import { buildFieldRows } from '../preview/fields'
import { collectMisses } from '../preview/locate'
import { type TranslatedFile, translateSource } from '../translate/runTranslation'
import {
  applyStageOrder,
  gearRows,
  groupSeries,
  missPrefixes,
  passiveSummary,
  skillRows,
  slotCellName,
  splitStageName,
} from './stages'

const dict: LoadedDict = {
  locale: 'zh-CN',
  bundle: miniBundle,
  index: miniIndex,
  info: { gameVersion: '0.0.0', leagueName: null },
  missing: [],
}

function make(id: string, build: Record<string, unknown>): TranslatedFile {
  const result = translateSource({ id, name: `${id}.build`, text: JSON.stringify(build) }, dict, {
    bilingual: false,
    annotateUniques: true,
  })
  if (!result.ok) throw new Error(result.error)
  return result.file
}

const LINK = 'https://example.invalid/a'
const staff = (mods: string) => ({
  inventory_id: 'Weapon1',
  additional_text: `Pyrophyte Staff\n${mods}`,
})

describe('splitStageName', () => {
  it('按第一个“ - ”拆成阶段名与构筑名', () => {
    expect(splitStageName('Act 3 - [0.5.5] Navira - X')).toEqual({
      stage: 'Act 3',
      series: '[0.5.5] Navira - X',
    })
  })
  it('没有分隔符、分隔符在开头或结尾时整体作阶段名', () => {
    expect(splitStageName('No separator')).toEqual({ stage: 'No separator', series: null })
    expect(splitStageName(' - tail')).toEqual({ stage: ' - tail', series: null })
    expect(splitStageName('head - ')).toEqual({ stage: 'head - ', series: null })
  })
})

describe('groupSeries', () => {
  it('同一来源链接的升华明确不同，不把两套构筑合成阶段', () => {
    const one = make('one', { name: 'Act 1 - A', link: LINK, ascendancy: 'Sorceress3' })
    const two = make('two', { name: 'Act 1 - B', link: LINK, ascendancy: 'Warrior1' })
    const groups = groupSeries([one, two])
    expect(groups.map((group) => group.stages.map((stage) => stage.file.id))).toEqual([
      ['one'],
      ['two'],
    ])
  })
  it('同一来源链接的作者明确不同，分别显示且分组键不重复', () => {
    const one = make('one', { name: 'Act 1 - A', link: LINK, author: 'Alice' })
    const two = make('two', { name: 'Act 1 - B', link: LINK, author: 'Bob' })
    const groups = groupSeries([one, two])
    expect(groups.map((group) => group.stages.length)).toEqual([1, 1])
    expect(new Set(groups.map((group) => group.key)).size).toBe(2)
  })
  it('有文件没有天赋时保留导入顺序，不把终局排到开荒之前', () => {
    const early = make('early', { name: 'Act 1 - Guide', link: LINK, passives: ['strength16'] })
    const late = make('late', { name: 'Endgame - Guide', link: LINK })
    const [series] = groupSeries([early, late])
    expect(series?.stages.map((stage) => stage.label)).toEqual(['Act 1', 'Endgame'])
  })
  it('来源存在冲突时，信息不完整的文件不猜测归属', () => {
    const groups = groupSeries([
      make('a', { name: 'Act 1 - Guide', link: LINK, author: 'Alice' }),
      make('b', { name: 'Act 1 - Guide', link: LINK, author: 'Bob' }),
      make('unknown', { name: 'Endgame - Guide', link: LINK }),
    ])
    expect(groups.map((group) => group.stages.map((stage) => stage.file.id))).toEqual([
      ['a'],
      ['b'],
      ['unknown'],
    ])
    expect(groups.every((group) => group.separated)).toBe(true)
  })
  it('手动顺序忽略已移除或重复的文件，新阶段追加且原文件不变', () => {
    const [series] = groupSeries(['a', 'b', 'new'].map((id) => make(id, { name: id, link: LINK })))
    if (series === undefined) throw new Error('no series')
    const ordered = applyStageOrder(series, ['removed', 'b', 'b', 'a'])
    expect(ordered.stages.map((stage) => stage.file.id)).toEqual(['b', 'a', 'new'])
    expect(series.stages.map((stage) => stage.file.id)).toEqual(['a', 'b', 'new'])
    expect(ordered.stages[0]?.file).toBe(series.stages[1]?.file)
    expect(applyStageOrder(series, ['removed']).order).toBe('import')
  })
  it('同 link 归为一个构筑，阶段按天赋点数升序，同数保持导入顺序', () => {
    const late = make('late', {
      name: 'Endgame - Guide',
      link: LINK,
      passives: ['strength16', 'strength16'],
    })
    const early = make('early', { name: 'Act 1 - Guide', link: LINK, passives: ['strength16'] })
    const tie = make('tie', { name: 'Act 2 - Guide', link: LINK, passives: ['strength16'] })
    const [series] = groupSeries([late, early, tie])
    expect(series?.title).toBe('Guide')
    expect(series?.stages.map((s) => s.label)).toEqual(['Act 1', 'Act 2', 'Endgame'])
  })
  it('link 不同的两套攻略分成两个构筑，顺序按首次出现', () => {
    const a = make('a', { name: 'Act 1 - A', link: LINK })
    const b = make('b', { name: 'Act 1 - B', link: 'https://example.invalid/b' })
    expect(groupSeries([a, b]).map((s) => s.title)).toEqual(['Act 1 - A', 'Act 1 - B'])
  })
  it('没有 link 时，作者、升华与构筑名都相同才归为一组', () => {
    const one = make('one', { name: 'Act 1 - G', author: 'X', ascendancy: 'Sorceress3' })
    const two = make('two', { name: 'Act 2 - G', author: 'X', ascendancy: 'Sorceress3' })
    const other = make('other', { name: 'Act 2 - G', author: 'Y', ascendancy: 'Sorceress3' })
    expect(groupSeries([one, two, other]).map((s) => s.stages.length)).toEqual([2, 1])
  })
  it('没有 link 时，名称到 40 字符截断上限、构筑名互为前缀也归为一组，标题取最完整的构筑名', () => {
    const who = { author: 'X', ascendancy: 'Sorceress3' }
    // 两份都恰好 40 字符：阶段前缀越长，构筑名被截得越多
    const act1 = make('act1', { ...who, name: 'Act 1 & 2 (Pre-Ascend) - [9.9] Synthetic' })
    const act2 = make('act2', { ...who, name: 'Act 2 - [9.9] Synthetic Fracturing Spark' })
    const late = make('late', { ...who, name: 'Act 3 & Interlude - [9.9] Synthetic Frac' })
    expect([act1, act2, late].map((file) => file.input.name?.length)).toEqual([40, 40, 40])
    const [series, ...rest] = groupSeries([act1, act2, late])
    expect(rest).toEqual([])
    expect(series?.stages.map((stage) => stage.label)).toEqual([
      'Act 1 & 2 (Pre-Ascend)',
      'Act 2',
      'Act 3 & Interlude',
    ])
    expect(series?.title).toBe('[9.9] Synthetic Fracturing Spark')
  })
  it('没有 link 时，未到截断上限的短名称只是前缀相同不归为一组', () => {
    const who = { author: 'X', ascendancy: 'Sorceress3' }
    const one = make('one', { ...who, name: 'Act 1 - Guide' })
    const two = make('two', { ...who, name: 'Act 1 - Guide 2' })
    expect(groupSeries([one, two]).map((s) => s.stages.length)).toEqual([1, 1])
  })
  it('单份构筑的标题用完整名称；没有 name 时阶段名与标题回退为文件名', () => {
    const [named] = groupSeries([make('n', { name: 'Synthetic Rich - 0.5.5' })])
    expect(named?.title).toBe('Synthetic Rich - 0.5.5')
    expect(named?.stages[0]?.label).toBe('Synthetic Rich')
    const [bare] = groupSeries([make('bare', {})])
    expect(bare?.title).toBe('bare.build')
    expect(bare?.stages[0]?.label).toBe('bare.build')
  })
})

describe('gearRows', () => {
  it('同一栏位不同 slot_x 各占一行，按栏位固定顺序排列', () => {
    const file = make('f', {
      inventory_slots: [
        { inventory_id: 'Charm1', slot_x: 1, additional_text: 'Any Charm' },
        { inventory_id: 'Ring2', additional_text: 'Ruby Ring' },
        { inventory_id: 'Charm1', slot_x: 0, additional_text: 'Any Charm' },
        staff('1. +10 to maximum Life'),
      ],
    })
    const rows = gearRows([{ file, label: 'f' }])
    expect(rows.map((row) => row.key)).toEqual(['Weapon1#0', 'Ring2#0', 'Charm1#0', 'Charm1#1'])
  })
  it('与上一阶段比：相同 same、基底不同 changed、同基底文本不同 modded、新出现 added；缺席的格子为 null；首列不判定', () => {
    const one = make('one', {
      name: 'A - G',
      link: LINK,
      passives: [],
      inventory_slots: [
        staff('1. +10 to maximum Life'),
        { inventory_id: 'Ring2', additional_text: 'Ruby Ring' },
      ],
    })
    const two = make('two', {
      name: 'B - G',
      link: LINK,
      passives: ['strength16'],
      inventory_slots: [
        staff('1. +10 to maximum Life'),
        { inventory_id: 'Ring2', additional_text: 'Ruby Ring\n1. +10 to maximum Life' },
        { inventory_id: 'Belt1', unique_name: 'Surefooted Sigil' },
      ],
    })
    const three = make('three', {
      name: 'C - G',
      link: LINK,
      passives: ['strength16', 'strength16'],
      inventory_slots: [staff('1. 40% increased Spell Damage')],
    })
    const [series] = groupSeries([one, two, three])
    const rows = gearRows(series?.stages ?? [])
    const changes = (key: string) =>
      rows.find((row) => row.key === key)?.cells.map((cell) => cell?.change ?? 'none')
    expect(changes('Weapon1#0')).toEqual(['none', 'same', 'modded'])
    expect(changes('Ring2#0')).toEqual(['none', 'modded', 'none'])
    expect(changes('Belt1#0')).toEqual(['none', 'added', 'none'])
    expect(rows.find((row) => row.key === 'Belt1#0')?.cells[0]).toBeNull()
  })
  it('只有传奇名的栏位按传奇名判定变化', () => {
    const one = make('one', {
      name: 'A - G',
      link: LINK,
      passives: [],
      inventory_slots: [{ inventory_id: 'Belt1', unique_name: 'Surefooted Sigil' }],
    })
    const two = make('two', {
      name: 'B - G',
      link: LINK,
      passives: ['strength16'],
      inventory_slots: [{ inventory_id: 'Belt1', unique_name: 'Other Unique' }],
    })
    const [series] = groupSeries([one, two])
    expect(gearRows(series?.stages ?? [])[0]?.cells[1]?.change).toBe('changed')
  })
})

describe('slotCellName', () => {
  const file = make('f', {
    inventory_slots: [
      staff('1. +10 to maximum Life'),
      { inventory_id: 'Belt1', unique_name: 'Surefooted Sigil' },
      { inventory_id: 'Ring2', additional_text: 'Sapphire Ring' },
    ],
  })
  const fields = new Map(buildFieldRows(file, false).map((item) => [item.entry.path, item]))
  const name = (i: number) => {
    const slot = file.preview.slots[i]
    if (slot === undefined) throw new Error('no slot')
    return slotCellName(slot, fields.get(`inventory_slots[${slot.rawIndex}].additional_text`))
  }
  it('基底名命中：中文名 + 英文名', () => {
    expect(name(0)).toEqual({ zh: '炎种长杖', en: 'Pyrophyte Staff', translated: true })
  })
  it('传奇名命中：传奇中文名 + 英文名', () => {
    expect(name(1)).toEqual({ zh: '稳步印记', en: 'Surefooted Sigil', translated: true })
  })
  it('基底名未收录：显示英文原文，标为未翻译', () => {
    expect(name(2)).toEqual({ zh: 'Sapphire Ring', en: null, translated: false })
  })
})

describe('skillRows', () => {
  it('同一宝石跨阶段对齐；辅助变化记 modded，新宝石记 added', () => {
    const one = make('one', {
      name: 'A - G',
      link: LINK,
      passives: [],
      skills: [{ id: 'Metadata/Items/Gems/SkillGemFirestorm' }],
    })
    const two = make('two', {
      name: 'B - G',
      link: LINK,
      passives: ['strength16'],
      skills: [
        {
          id: 'Metadata/Items/Gems/SkillGemFirestorm',
          support_skills: ['Metadata/Items/Gem/SupportGemConsideredCasting'],
        },
        { id: 'Metadata/Items/Gems/SkillGemFlameblast' },
      ],
    })
    const [series] = groupSeries([one, two])
    const rows = skillRows(series?.stages ?? [])
    expect(rows.map((row) => row.name.text)).toEqual(['火焰风暴', '烈焰冲击'])
    expect(rows[0]?.cells[1]?.change).toBe('modded')
    expect(rows[1]?.cells[1]?.change).toBe('added')
    expect(rows[1]?.cells[0]).toBeNull()
  })
})

describe('passiveSummary', () => {
  it('按名称合并计数，次数多的在前', () => {
    const file = make('f', { passives: ['AscendancyWitch1Notable4', 'strength16', 'strength16'] })
    expect(passiveSummary(file.preview.passives).map((p) => [p.name.text, p.count])).toEqual([
      ['力量', 2],
      ['核心天赋', 1],
    ])
  })
})

describe('missPrefixes', () => {
  it('把待核对路径归到栏位或宝石前缀', () => {
    const file = make('f', {
      inventory_slots: [{ inventory_id: 'Ring2', additional_text: 'Sapphire Ring' }],
    })
    const misses = collectMisses(buildFieldRows(file, false), file.preview)
    expect([...missPrefixes(misses)]).toEqual(['inventory_slots[0]'])
  })
})
