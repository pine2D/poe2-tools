import { describe, expect, it } from 'vitest'
import { type CatalogBase, type CatalogMod, inspectModPool } from './catalog'
import { matchCatalogMods } from './catalogMatch'
import { inspectItem } from './export'
import { parseItem } from './parse'

const base: CatalogBase = {
  id: 'Test Focus',
  name: 'Test Focus',
  type: 'Focus',
  tags: ['focus', 'default'],
  requirements: {},
  properties: {},
  implicit: null,
  implicitTags: [],
  sourceQuality: null,
  socketLimit: null,
  hidden: false,
  runeforged: false,
}
const mod: CatalogMod = {
  id: 'TestManaLight',
  kind: 'suffix',
  name: 'Synthetic',
  group: 'ManaLight',
  level: 50,
  lines: ['(18-22)% increased Mana Regeneration Rate', '15% increased Light Radius'],
  statOrder: [1, 2],
  tags: ['mana'],
  addsTags: [],
  eligibility: [
    { tag: 'focus', value: 1 },
    { tag: 'default', value: 0 },
  ],
  tradeHashes: {},
}
function imported(lines: string[], kind = 'Suffix') {
  const parsed = parseItem(
    `Item Class: Foci\nRarity: Rare\nSynthetic Star\nTest Focus\n--------\nItem Level: 10\n--------\n{ ${kind} Modifier "Test" (Tier: 99) }\n${lines.join('\n')}`,
  )
  if (!parsed.ok) throw new Error(parsed.error)
  return inspectItem(parsed.item, {
    stats: {
      entries: [
        { id: 'a', en: '#% increased Mana Regeneration Rate', text: '#%' },
        { id: 'b', en: '#% increased Light Radius', text: '#%' },
        { id: 'c', en: '# to maximum Energy Shield', text: '#' },
        { id: 'd', en: '#% reduced Charges used', text: '#%' },
      ],
    },
  }).mods
}

describe('导入词缀与生成目录对应', () => {
  it('专属亵渎默认不进入普通池，明确来源逐组匹配并保留部位与负标签规则', () => {
    const exclusive: CatalogMod = { ...mod, id: 'DesecratedOnly', desecratedOnly: true }
    expect(inspectModPool(base, [mod, exclusive], 70).map(({ mod }) => mod.id)).toEqual([mod.id])
    expect(
      inspectModPool(base, [mod, exclusive], 70, [], [], 'desecrated').map(({ mod }) => mod.id),
    ).toEqual([mod.id, exclusive.id])
    const negative = {
      ...exclusive,
      eligibility: [{ tag: 'blocked', value: 0 as const }, ...exclusive.eligibility],
    }
    expect(inspectModPool(base, [negative], 70, [], ['blocked'], 'desecrated')).toEqual([])
    expect(
      inspectModPool(
        { ...base, tags: ['helmet', 'default'] },
        [exclusive],
        70,
        [],
        [],
        'desecrated',
      ),
    ).toEqual([])
    const normal = imported([
      '20(18-22)% increased Mana Regeneration Rate',
      '15% increased Light Radius',
    ])
    const desecrated = structuredClone(normal)
    if (!desecrated[0]) throw new Error('缺少测试词缀')
    desecrated[0].mod.states = ['desecrated']
    const matched = matchCatalogMods(base, [exclusive], [...normal, ...desecrated])
    expect(matched[0]?.candidates).toEqual([])
    expect(matched[1]?.candidates.map((mod) => mod.id)).toEqual([exclusive.id])
    expect(matchCatalogMods(base, [mod], desecrated)[0]?.candidates).toEqual([mod])
  })
  it('混合词缀按整组匹配，允许显示行序变化，不用原文tier或物等猜生成ID', () => {
    const source = imported([
      '15% increased Light Radius',
      '20(18-22)% increased Mana Regeneration Rate',
    ])
    const [result] = matchCatalogMods(base, [mod], source)
    expect(result?.status).toBe('matched')
    expect(result?.candidates.map((entry) => entry.id)).toEqual(['TestManaLight'])
    expect(source[0]?.mod.stats).toHaveLength(2)
    const withoutTranslation = source.map((entry) => ({
      ...entry,
      stats: entry.stats.map((stat) => ({
        ...stat,
        resolution: { english: null, candidates: [] },
      })),
    }))
    expect(matchCatalogMods(base, [mod], withoutTranslation)[0]?.status).toBe('matched')
    expect(
      matchCatalogMods(base, [mod], imported(['20(18-22)% increased Mana Regeneration Rate']))[0]
        ?.status,
    ).toBe('unmatched')
  })
  it('相邻范围重叠时用高级范围消歧，缺范围保留多个候选，越界值或错误固定值不匹配', () => {
    const high = {
      ...mod,
      id: 'TestHigh',
      lines: ['(22-30)% increased Mana Regeneration Rate', '15% increased Light Radius'],
    }
    const match = (value: string, fixed = '15') =>
      matchCatalogMods(
        base,
        [mod, high],
        imported([
          `${value}% increased Mana Regeneration Rate`,
          `${fixed}% increased Light Radius`,
        ]),
      )[0]
    expect(match('22')?.status).toBe('ambiguous')
    expect(match('22(18-22)')?.candidates.map((entry) => entry.id)).toEqual([mod.id])
    expect(match('23(18-22)')?.status).toBe('unmatched')
    expect(match('20(18-22)', '16')?.status).toBe('unmatched')
  })
  it('范围方向不改变对应结果，正号与小数保留，存在不同ID同内容仍歧义', () => {
    const shield = {
      ...mod,
      id: 'Shield',
      lines: ['+(1.5-3.5) to maximum Energy Shield'],
      statOrder: [1],
    }
    const source = imported(['+2.5(3.5-1.5) to maximum Energy Shield'])
    expect(matchCatalogMods(base, [shield], source)[0]?.status).toBe('matched')
    expect(
      matchCatalogMods(base, [shield, { ...shield, id: 'OtherShield' }], source)[0]?.status,
    ).toBe('ambiguous')
    const negative = { ...mod, lines: ['-(8-3)% reduced Charges used'], statOrder: [1] }
    expect(
      matchCatalogMods(base, [negative], imported(['-5(-8--3)% reduced Charges used']))[0]?.status,
    ).toBe('matched')
    expect(
      matchCatalogMods(base, [negative], imported(['-5(8-3)% reduced Charges used']))[0]?.status,
    ).toBe('unmatched')
  })
  it('前后缀与基底资格必须吻合，不把未知译文或固有词缀当普通可制作词缀', () => {
    const lines = ['20(18-22)% increased Mana Regeneration Rate', '15% increased Light Radius']
    expect(matchCatalogMods(base, [{ ...mod, kind: 'prefix' }], imported(lines))[0]?.status).toBe(
      'unmatched',
    )
    expect(
      matchCatalogMods(
        base,
        [{ ...mod, eligibility: [{ tag: 'default', value: 0 }] }],
        imported(lines),
      )[0]?.status,
    ).toBe('unmatched')
    expect(matchCatalogMods(base, [mod], imported(['Unknown stat']))[0]?.status).toBe(
      'untranslated',
    )
    expect(matchCatalogMods(base, [mod], imported(lines, 'Implicit'))[0]?.status).toBe(
      'unsupported',
    )
  })
})
