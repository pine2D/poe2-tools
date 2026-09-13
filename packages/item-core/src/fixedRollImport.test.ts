import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject, serializeCraftProject } from './craftProject'
import { type ItemDictionary, inspectItem } from './export'
import { parseItem } from './parse'
import { importCraftState } from './rehearsalImport'

const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'test',
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
  bases: [
    {
      id: 'Test Ring',
      name: 'Test Ring',
      type: 'Ring',
      tags: ['ring'],
      requirements: {},
      properties: {},
      implicit: null,
      implicitTags: [],
      sourceQuality: null,
      socketLimit: null,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: [
    {
      id: 'mixed',
      kind: 'prefix',
      name: 'Test',
      group: 'mixed',
      level: 1,
      lines: ['+(10-19) to maximum Life', '15% increased Light Radius'],
      statOrder: [1, 2],
      tags: ['life'],
      addsTags: [],
      eligibility: [{ tag: 'ring', value: 1 }],
      tradeHashes: {},
    },
  ],
}
const dictionary: ItemDictionary = {
  items: { bases: { 'Test Ring': '测试戒指' }, uniques: {} },
  stats: {
    entries: [
      { id: 'life', en: '+# to maximum Life', text: '+# 生命上限' },
      { id: 'light', en: '#% increased Light Radius', text: '照亮范围提高 #%' },
    ],
  },
}
const raw =
  '物品类别: 戒指\n稀有度: 稀有\n测试之环\n测试戒指\n--------\n物品等级: 86\n--------\n{ 前缀属性 "测试" }\n+12(10-19) 生命上限\n照亮范围提高 15(15)%'
function imported(text = raw) {
  const parsed = parseItem(text)
  if (!parsed.ok) throw new Error(parsed.error)
  return importCraftState(catalog, 'Test Ring', parsed.item, inspectItem(parsed.item, dictionary))
}

describe('固定基础值贯通中文导入与制作回放', () => {
  it('相同固定值与混合范围一起导入，原始注释保留', () => {
    expect(imported()).toMatchObject({
      ok: true,
      value: {
        affixes: [
          {
            modId: 'mixed',
            lines: ['+12(10-19) to maximum Life', '15(15)% increased Light Radius'],
          },
        ],
      },
    })
  })

  it('显示值与固定基础值不同会明确提示待还原，不按普通属性放行', () => {
    expect(imported(raw.replace('15(15)', '18(15)'))).toMatchObject({
      ok: false,
      error: expect.stringContaining('固定基础值'),
    })
  })

  it.each(['en', 'zh-CN', 'zh-TW'] as const)('导出 %s 保留固定注释，并能回读制作状态', (locale) => {
    const initial = imported()
    if (!initial.ok) throw new Error(initial.error)
    const outputDictionary =
      locale === 'zh-TW'
        ? {
            items: { bases: { 'Test Ring': '測試戒指' }, uniques: {} },
            stats: {
              entries: [
                { id: 'life', en: '+# to maximum Life', text: '+# 最大生命' },
                { id: 'light', en: '#% increased Light Radius', text: '照亮範圍增加 #%' },
              ],
            },
          }
        : dictionary
    const exported = exportCraftItemText(catalog, initial.value, {
      locale,
      dictionary: outputDictionary,
    })
    if (!exported.ok) throw new Error(exported.error)
    expect(exported.value.text).toContain('15(15)')
    const parsed = parseItem(exported.value.text)
    if (!parsed.ok) throw new Error(parsed.error)
    const restored = importCraftState(
      catalog,
      'Test Ring',
      parsed.item,
      inspectItem(parsed.item, outputDictionary),
    )
    expect(restored).toMatchObject({ ok: true, value: { affixes: initial.value.affixes } })
  })

  it('神圣石重掷及每个项目游标可回放，不把基础注释作为第二个可掷值', () => {
    const initial = imported()
    if (!initial.ok) throw new Error(initial.error)
    for (const cursor of [0, 1]) {
      const restored = parseCraftProject(
        serializeCraftProject({
          schemaVersion: 1,
          sourceCommit: 'test',
          rulesVersion: CRAFT_RULES_VERSION,
          initialState: initial.value,
          operations: [
            { currency: 'divine', modIds: [], rolls: [{ modId: 'mixed', values: [11] }] },
          ],
          cursor,
        }),
        catalog,
        dictionary,
      )
      if (!restored.ok) throw new Error(restored.error)
      expect(restored.value.states[cursor]?.affixes[0]?.lines).toEqual(
        cursor === 0
          ? ['+12(10-19) to maximum Life', '15(15)% increased Light Radius']
          : ['+11(10-19) to maximum Life', '15(15)% increased Light Radius'],
      )
    }
  })
})
