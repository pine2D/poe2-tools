import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import type { ItemDictionary } from './export'

const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
  bases: [
    {
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
    },
  ],
  modifiers: [
    {
      id: 'shield',
      kind: 'prefix',
      name: 'Test',
      group: 'shield',
      level: 1,
      lines: ['+(10-20) to maximum Energy Shield'],
      statOrder: [1],
      tags: [],
      addsTags: [],
      eligibility: [{ tag: 'default', value: 1 }],
      tradeHashes: {},
    },
    {
      id: 'mana',
      kind: 'suffix',
      name: 'Test',
      group: 'mana',
      level: 1,
      lines: ['+(10-20) to maximum Mana'],
      statOrder: [1],
      tags: [],
      addsTags: [],
      eligibility: [{ tag: 'default', value: 1 }],
      tradeHashes: {},
    },
  ],
}
const dictionary: ItemDictionary = {
  items: { bases: { 'Test Focus': '测试法器' }, uniques: {} },
  stats: {
    entries: [{ id: 'shield', en: '+# to maximum Energy Shield', text: '+# 能量护盾上限' }],
  },
}
const raw =
  '物品类别: 法器\n稀有度: 稀有\n测试 晴光\n测试法器\n--------\n物品等级: 46\n--------\n{ 前缀属性 "测试的" (等阶：1) }\n+15(10-20) 能量护盾上限'
function project(): CraftProject {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: CRAFT_RULES_VERSION,
    initialState: {
      baseId: 'Test Focus',
      rarity: 'normal',
      itemLevel: 46,
      affixes: [],
      sourceText: null,
    },
    operations: [
      { currency: 'transmutation', modIds: ['shield'] },
      { currency: 'augmentation', modIds: ['mana'] },
    ],
    cursor: 1,
  }
}

describe('演练项目保存与严格恢复', () => {
  it.each([9, 10])('v%s 保留品质字段并严格复核来源品质', (version) => {
    const qualityRaw = raw.replace('物品等级: 46', '品质: +20%\n--------\n物品等级: 46')
    const input = {
      ...project(),
      rulesVersion: `basic-2026-09-12-v${version}`,
      initialState: {
        ...project().initialState,
        rarity: 'rare' as const,
        sourceText: qualityRaw,
        affixes: [{ modId: 'shield', lines: ['+15(10-20) to maximum Energy Shield'] }],
        quality: 20,
      },
      operations: [],
      cursor: 0,
    }
    expect(parseCraftProject(JSON.stringify(input), catalog, dictionary).ok).toBe(true)
    expect(
      parseCraftProject(
        JSON.stringify({ ...input, initialState: { ...input.initialState, quality: 19 } }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
  })

  it('v9严格保存品质来源，旧版从原文迁移且拒绝偷带新字段', () => {
    const qualityRaw = raw.replace('物品等级: 46', '品质: +20%\n--------\n物品等级: 46')
    const imported = {
      ...project(),
      initialState: {
        ...project().initialState,
        rarity: 'rare' as const,
        sourceText: qualityRaw,
        affixes: [{ modId: 'shield', lines: ['+15(10-20) to maximum Energy Shield'] }],
        quality: 20,
      },
      operations: [],
      cursor: 0,
    }
    expect(parseCraftProject(JSON.stringify(imported), catalog, dictionary).ok).toBe(true)
    expect(
      parseCraftProject(
        JSON.stringify({ ...imported, initialState: { ...imported.initialState, quality: 19 } }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
    const declared = {
      ...imported,
      initialState: { ...imported.initialState, sourceText: raw, quality: 25 },
      importedQuality: 25,
    }
    expect(parseCraftProject(JSON.stringify(declared), catalog, dictionary)).toMatchObject({
      ok: true,
      value: { project: { importedQuality: 25, initialState: { quality: 25 } } },
    })
    const old = { ...imported, rulesVersion: 'basic-2026-09-12-v8' }
    delete (old.initialState as Partial<typeof old.initialState>).quality
    const restored = parseCraftProject(JSON.stringify(old), catalog, dictionary)
    expect(restored).toMatchObject({
      ok: true,
      value: { project: { initialState: { quality: 20 } } },
    })
    expect(
      parseCraftProject(JSON.stringify({ ...old, importedQuality: 20 }), catalog, dictionary).ok,
    ).toBe(false)
    expect(
      parseCraftProject(
        JSON.stringify({ ...old, initialState: { ...old.initialState, quality: 20 } }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
  })

  it('空白 v9 起点可声明品质但不能带导入品质来源', () => {
    expect(
      parseCraftProject(
        JSON.stringify({ ...project(), initialState: { ...project().initialState, quality: 0 } }),
        catalog,
      ).ok,
    ).toBe(true)
    expect(
      parseCraftProject(
        JSON.stringify({
          ...project(),
          initialState: { ...project().initialState, quality: 20 },
          importedQuality: 20,
        }),
        catalog,
      ).ok,
    ).toBe(false)
  })
  it('新通货按具体版本回放，v3升级且不能冒用新通货语义', () => {
    const tierCatalog: CraftCatalog = {
      ...catalog,
      modifiers: catalog.modifiers.map((mod) => ({ ...mod, level: mod.id === 'shield' ? 44 : 70 })),
    }
    const p = {
      ...project(),
      initialState: { ...project().initialState, itemLevel: 80 },
      operations: [
        {
          currency: 'greater_transmutation',
          modIds: ['shield'],
          rolls: [{ modId: 'shield', values: [15] }],
        },
        {
          currency: 'perfect_augmentation',
          modIds: ['mana'],
          rolls: [{ modId: 'mana', values: [20] }],
        },
      ],
    }
    const restored = parseCraftProject(JSON.stringify(p), tierCatalog)
    expect(restored.ok).toBe(true)
    if (restored.ok) expect(restored.value.project).toEqual(p)
    expect(
      parseCraftProject(JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-12-v3' }), tierCatalog)
        .ok,
    ).toBe(false)
    expect(
      parseCraftProject(JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-12-v2' }), tierCatalog)
        .ok,
    ).toBe(false)
    const old = parseCraftProject(
      JSON.stringify({ ...project(), rulesVersion: 'basic-2026-09-12-v3' }),
      catalog,
    )
    expect(old.ok).toBe(true)
    if (old.ok) expect(old.value.project.rulesVersion).toBe(CRAFT_RULES_VERSION)
  })
  it('回放并保存显式及固有属性的具体数值，保留撤销后的神圣步骤', () => {
    const ring: CraftCatalog = {
      ...catalog,
      bases: catalog.bases.map((base) => ({
        ...base,
        type: 'Ring',
        implicit: '+(10-15) to Strength',
      })),
    }
    const p = {
      ...project(),
      operations: [
        { currency: 'divine', modIds: [], rolls: [], implicitValues: [12] },
        {
          currency: 'transmutation',
          modIds: ['shield'],
          rolls: [{ modId: 'shield', values: [17] }],
        },
        {
          currency: 'divine',
          modIds: [],
          rolls: [{ modId: 'shield', values: [20] }],
          implicitValues: [15],
        },
      ],
      cursor: 2,
    }
    const restored = parseCraftProject(JSON.stringify(p), ring)
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.value.project).toEqual(p)
    expect(restored.value.states[2]?.affixes[0]?.lines).toEqual([
      '+17(10-20) to maximum Energy Shield',
    ])
    expect(restored.value.states[2]?.implicitLines).toEqual(['+12(10-15) to Strength'])
    expect(restored.value.states[3]?.affixes[0]?.lines).toEqual([
      '+20(10-20) to maximum Energy Shield',
    ])
    expect(restored.value.states[3]?.implicitLines).toEqual(['+15(10-15) to Strength'])
  })
  it('v2 旧操作可升级，伪装成 v2 的新数值字段拒绝', () => {
    const old = { ...project(), rulesVersion: 'basic-2026-09-12-v2' }
    const restored = parseCraftProject(JSON.stringify(old), catalog)
    expect(restored.ok).toBe(true)
    if (restored.ok) expect(restored.value.project.rulesVersion).toBe(CRAFT_RULES_VERSION)
    const forged = {
      ...old,
      operations: [
        {
          currency: 'transmutation',
          modIds: ['shield'],
          rolls: [{ modId: 'shield', values: [15] }],
        },
      ],
      cursor: 1,
    }
    expect(parseCraftProject(JSON.stringify(forged), catalog).ok).toBe(false)
  })
  it('空白起点不可预设固有数值', () => {
    const ring: CraftCatalog = {
      ...catalog,
      bases: catalog.bases.map((base) => ({
        ...base,
        type: 'Ring',
        implicit: '+(10-15) to Strength',
      })),
    }
    const p = {
      ...project(),
      initialState: { ...project().initialState, implicitLines: ['+12(10-15) to Strength'] },
    }
    expect(parseCraftProject(JSON.stringify(p), ring).ok).toBe(false)
  })
  it('旧导入项目从原文恢复固有实值，新项目不能伪造该值', () => {
    const source: CraftCatalog = {
      ...catalog,
      bases: catalog.bases.map((base) => ({ ...base, implicit: '+(10-15) to Strength' })),
    }
    const dict: ItemDictionary = {
      ...dictionary,
      stats: {
        entries: [
          ...(dictionary.stats?.entries ?? []),
          { id: 'str', en: '+# to Strength', text: '+# 力量' },
        ],
      },
    }
    const original = raw.replace(
      '{ 前缀属性',
      '{ 基底属性 }\n+12(10-15) 力量\n--------\n{ 前缀属性',
    )
    const p = {
      ...project(),
      rulesVersion: 'basic-2026-09-12-v2',
      initialState: {
        ...project().initialState,
        rarity: 'rare',
        sourceText: original,
        affixes: [{ modId: 'shield', lines: ['+15(10-20) to maximum Energy Shield'] }],
      },
      operations: [],
      cursor: 0,
    }
    const restored = parseCraftProject(JSON.stringify(p), source, dict)
    expect(restored.ok).toBe(true)
    if (restored.ok)
      expect(restored.value.project.initialState.implicitLines).toEqual(['+12(10-15) to Strength'])
    expect(
      parseCraftProject(
        JSON.stringify({
          ...p,
          rulesVersion: CRAFT_RULES_VERSION,
          initialState: { ...p.initialState, implicitLines: ['+13(10-15) to Strength'] },
        }),
        source,
        dict,
      ).ok,
    ).toBe(false)
  })
  it.each(
    [
      [{ modId: 'shield', values: [null] }],
      [{ modId: 'shield', values: [21] }],
      [{ modId: 'shield', values: Array(33).fill(15) }],
      [{ modId: 'shield', values: [15], extra: true }],
      [
        { modId: 'shield', values: [15] },
        { modId: 'shield', values: [16] },
      ],
    ].map((rolls) => ({ rolls })),
  )('非法数值载荷不能恢复', ({ rolls }) => {
    expect(
      parseCraftProject(
        JSON.stringify({
          ...project(),
          operations: [{ currency: 'transmutation', modIds: ['shield'], rolls }],
          cursor: 1,
        }),
        catalog,
      ).ok,
    ).toBe(false)
  })
  it('目标随项目往返，旧项目不必包含目标字段', () => {
    const p = { ...project(), targetModIds: ['shield', 'mana'] }
    const restored = parseCraftProject(JSON.stringify(p), catalog)
    expect(restored.ok).toBe(true)
    if (restored.ok) expect(restored.value.project).toEqual(p)
    expect(parseCraftProject(serializeCraftProject(project()), catalog).ok).toBe(true)
  })
  it('数值目标随项目往返，v2不能携带新增目标语义', () => {
    const p = {
      ...project(),
      targetModIds: ['shield'],
      targetValues: [{ modId: 'shield', bounds: [{ index: 0, min: 17.5, max: 20 }] }],
    }
    const restored = parseCraftProject(JSON.stringify(p), catalog)
    expect(restored.ok).toBe(true)
    if (restored.ok) expect(restored.value.project).toEqual(p)
    expect(
      parseCraftProject(JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-12-v2' }), catalog).ok,
    ).toBe(false)
  })
  it.each(
    [
      null,
      [{ modId: 'mana', bounds: [{ index: 0, min: 15 }] }],
      [{ modId: 'shield', bounds: [{ index: 0, min: 21 }] }],
      [{ modId: 'shield', bounds: [{ index: 1, min: 15 }] }],
      [{ modId: 'shield', bounds: [{ index: 0, min: null }] }],
    ].map((targetValues) => ({ targetValues })),
  )('拒绝数值目标错误和脱离所选ID的条件', ({ targetValues }) => {
    expect(
      parseCraftProject(
        JSON.stringify({ ...project(), targetModIds: ['shield'], targetValues }),
        catalog,
      ).ok,
    ).toBe(false)
  })
  it.each(
    [null, 'shield', [null], ['missing'], ['shield', 'shield']].map((targetModIds) => ({
      targetModIds,
    })),
  )('拒绝无效目标而非静默丢弃', ({ targetModIds }) => {
    expect(parseCraftProject(JSON.stringify({ ...project(), targetModIds }), catalog).ok).toBe(
      false,
    )
  })
  it('保存完整操作序列和撤销游标，回放得到未来重做状态', () => {
    const p = project()
    const restored = parseCraftProject(serializeCraftProject(p), catalog)
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.value.project).toEqual(p)
    expect(restored.value.states.map((s) => s.affixes.length)).toEqual([0, 1, 2])
    expect(restored.value.project.cursor).toBe(1)
    expect(p.initialState.affixes).toEqual([])
  })
  it('恢复导入起点时重新核对原文、实际值与只读条件', () => {
    const p = project()
    p.initialState = {
      ...p.initialState,
      rarity: 'rare',
      sourceText: raw,
      affixes: [{ modId: 'shield', lines: ['+15(10-20) to maximum Energy Shield'] }],
    }
    p.operations = [{ currency: 'exalted', modIds: ['mana'] }]
    expect(parseCraftProject(serializeCraftProject(p), catalog, dictionary).ok).toBe(true)
    expect(parseCraftProject(serializeCraftProject(p), catalog).ok).toBe(false)
    for (const forbidden of [
      ...['crafted', 'fractured', 'desecrated'].map((state) => `${raw} (${state})`),
      `${raw}\n--------\nFractured Item`,
      raw.replace('稀有度: 稀有', '稀有度: 传奇'),
      raw.replace('物品类别: 法器', '物品类别: 咒符'),
      `${raw}\n--------\n被腐化`,
      `${raw}\n--------\n未知状态`,
    ]) {
      expect(
        parseCraftProject(
          serializeCraftProject({
            ...p,
            initialState: { ...p.initialState, sourceText: forbidden },
          }),
          catalog,
          dictionary,
        ).ok,
      ).toBe(false)
    }
    p.initialState.affixes = [{ modId: 'shield', lines: ['+16(10-20) to maximum Energy Shield'] }]
    expect(parseCraftProject(serializeCraftProject(p), catalog, dictionary).ok).toBe(false)
  })
  it('没有来源原文不能把任意稀有快照冒充空白制作起点', () => {
    const p = project()
    p.initialState.rarity = 'rare'
    p.operations = []
    p.cursor = 0
    expect(parseCraftProject(serializeCraftProject(p), catalog).ok).toBe(false)
  })
  it('保留仍在词典候选中的基底和词缀选择，不因翻译歧义丢失已保存项目', () => {
    const p = project()
    p.initialState = {
      ...p.initialState,
      rarity: 'rare',
      sourceText: raw,
      affixes: [{ modId: 'shield', lines: ['+15(10-20) to maximum Energy Shield'] }],
    }
    p.operations = []
    p.cursor = 0
    const ambiguous: ItemDictionary = {
      items: { bases: { 'Test Focus': '测试法器', 'Other Focus': '测试法器' }, uniques: {} },
      stats: {
        entries: [
          { id: 'shield', en: '+# to maximum Energy Shield', text: '+# 能量护盾上限' },
          { id: 'mana', en: '+# to maximum Mana', text: '+# 能量护盾上限' },
        ],
      },
    }
    expect(parseCraftProject(serializeCraftProject(p), catalog, ambiguous).ok).toBe(true)
  })
  it('恢复固有属性的歧义选择，但不接受脱离原文候选的保存值', () => {
    const ring: CraftCatalog = {
      ...catalog,
      bases: catalog.bases.map((base) => ({
        ...base,
        type: 'Ring',
        implicit: '+(10-15) to Strength',
      })),
    }
    const p: CraftProject = {
      ...project(),
      initialState: {
        ...project().initialState,
        sourceText:
          '物品类别: 戒指\n稀有度: 普通\n测试戒指\n--------\n物品等级: 46\n--------\n{ 基底属性 }\n+12(10-15) 力量',
        implicitLines: ['+12(10-15) to Strength'],
      },
      operations: [],
      cursor: 0,
    }
    const ambiguous: ItemDictionary = {
      items: { bases: { 'Test Focus': '测试戒指' }, uniques: {} },
      stats: {
        entries: [
          { id: 'str', en: '+# to Strength', text: '+# 力量' },
          { id: 'dex', en: '+# to Dexterity', text: '+# 力量' },
        ],
      },
    }
    const restored = parseCraftProject(serializeCraftProject(p), ring, ambiguous)
    expect(restored.ok).toBe(true)
    if (restored.ok)
      expect(restored.value.project.initialState.implicitLines).toEqual(
        p.initialState.implicitLines,
      )
    p.initialState.implicitLines = ['+13(10-15) to Strength']
    expect(parseCraftProject(serializeCraftProject(p), ring, ambiguous).ok).toBe(false)
  })
  it('游标后的非法操作也拒绝，不半恢复合法前缀', () => {
    const p = project()
    p.cursor = 0
    p.operations.push({ currency: 'augmentation', modIds: ['mana'] })
    expect(parseCraftProject(serializeCraftProject(p), catalog).ok).toBe(false)
  })
  it.each([
    (p: Record<string, unknown>) => {
      p.schemaVersion = 2
    },
    (p: Record<string, unknown>) => {
      p.sourceCommit = 'b'.repeat(40)
    },
    (p: Record<string, unknown>) => {
      p.rulesVersion = 'unknown-rules'
    },
    (p: Record<string, unknown>) => {
      p.cursor = 0.5
    },
    (p: Record<string, unknown>) => {
      p.cursor = 3
    },
    (p: Record<string, unknown>) => {
      p.operations = [{ currency: 'unknown', modIds: [] }]
    },
    (p: Record<string, unknown>) => {
      p.operations = [{ currency: 'transmutation', modIds: [null] }]
    },
    (p: Record<string, unknown>) => {
      p.initialState = null
    },
    (p: Record<string, unknown>) => {
      p.initialState = { ...project().initialState, rarity: { toString: null } }
    },
    (p: Record<string, unknown>) => {
      p.extraSemantic = true
    },
  ])('拒绝跨版本或错误形状', (mutate) => {
    const p = JSON.parse(serializeCraftProject(project())) as Record<string, unknown>
    mutate(p)
    expect(parseCraftProject(JSON.stringify(p), catalog).ok).toBe(false)
  })
  it('坏 JSON、过大文件和过多操作有边界且不抛出', () => {
    expect(parseCraftProject('{broken', catalog).ok).toBe(false)
    expect(parseCraftProject(' '.repeat(2_000_001), catalog).ok).toBe(false)
    expect(parseCraftProject('中'.repeat(700_000), catalog).ok).toBe(false)
    const p = project()
    p.operations = Array.from({ length: 1001 }, () => ({
      currency: 'transmutation',
      modIds: ['shield'],
    }))
    expect(parseCraftProject(serializeCraftProject(p), catalog).ok).toBe(false)
  })
})

describe('替代目标项目门禁', () => {
  const source: CraftCatalog = {
    ...catalog,
    modifiers: [
      ...catalog.modifiers,
      ...catalog.modifiers
        .filter((mod) => mod.id === 'shield')
        .map((mod) => ({ ...mod, id: 'shield-alt' })),
    ],
  }
  const input = {
    ...project(),
    targetModIds: ['shield'],
    targetAlternatives: [{ targetModId: 'shield', modIds: ['shield-alt'] }],
    targetValues: [{ modId: 'shield-alt', bounds: [{ index: 0, min: 15 }] }],
  }
  it('v13严格恢复替代档位和条件，缺失关联立即拒绝', () => {
    expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v32')
    expect(parseCraftProject(JSON.stringify(input), source)).toMatchObject({
      ok: true,
      value: { project: input },
    })
    for (const damaged of [
      { ...input, targetAlternatives: undefined },
      { ...input, targetModIds: [] },
      { ...input, targetAlternatives: [] },
      { ...input, targetAlternatives: [{ targetModId: 'shield', modIds: ['mana'] }] },
    ]) {
      expect(parseCraftProject(JSON.stringify(damaged), source).ok).toBe(false)
    }
  })
  it.each(Array.from({ length: 11 }, (_, i) => i + 2))(
    'v%s旧版保留精确目标但拒绝夹带空替代字段',
    (version) => {
      const legacy = {
        ...project(),
        rulesVersion: `basic-2026-09-12-v${version}`,
        targetModIds: ['shield'],
      }
      expect(parseCraftProject(JSON.stringify(legacy), source).ok).toBe(true)
      expect(
        parseCraftProject(JSON.stringify({ ...legacy, targetAlternatives: [] }), source).ok,
      ).toBe(false)
    },
  )
})

it('v14 保留定向预兆，所有旧版本拒绝未来步注入', () => {
  const input = project()
  input.operations = [
    { currency: 'transmutation', modIds: ['shield'] },
    { currency: 'regal', modIds: ['mana'] },
    { currency: 'annulment', modIds: [], removeModId: 'shield', omen: 'sinistral_annulment' },
  ]
  const restored = parseCraftProject(serializeCraftProject(input), catalog)
  expect(restored.ok).toBe(true)
  if (restored.ok) expect(restored.value.project.operations[2]).toEqual(input.operations[2])
  for (let version = 2; version <= 13; version++) {
    for (const omen of ['sinistral_annulment', null, []]) {
      const legacy = {
        ...input,
        rulesVersion: `basic-2026-09-12-v${version}`,
        operations: [...input.operations.slice(0, 2), { ...input.operations[2], omen }],
      }
      expect(parseCraftProject(JSON.stringify(legacy), catalog).ok).toBe(false)
    }
    expect(
      parseCraftProject(
        JSON.stringify({ ...project(), rulesVersion: `basic-2026-09-12-v${version}` }),
        catalog,
      ).ok,
    ).toBe(true)
  }
})

it('v14 拒绝空值、多枚、错配通货与非通货步骤夹带预兆', () => {
  for (const operation of [
    { currency: 'transmutation', modIds: ['shield'], omen: 'sinistral_exaltation' },
    { currency: 'transmutation', modIds: ['shield'], omen: null },
    { currency: 'transmutation', modIds: ['shield'], omen: [] },
    { currency: 'transmutation', modIds: ['shield'], omen: 'future_omen' },
    { kind: 'artificer', omen: 'sinistral_exaltation' },
    { kind: 'socket', socketIndex: 0, augmentId: 'rune', omen: 'sinistral_exaltation' },
  ])
    expect(
      parseCraftProject(
        JSON.stringify({ ...project(), operations: [operation], cursor: 0 }),
        catalog,
      ).ok,
    ).toBe(false)
})

it.each([12, 13, 14])('v%s 项目 sourceText 状态注入不能恢复普通演练', (version) => {
  const input = {
    ...project(),
    rulesVersion: `basic-2026-09-12-v${version}`,
    initialState: {
      ...project().initialState,
      rarity: 'rare',
      sourceText: raw,
      affixes: [{ modId: 'shield', lines: ['+15(10-20) to maximum Energy Shield'] }],
    },
    operations: [],
    cursor: 0,
  }
  expect(parseCraftProject(JSON.stringify(input), catalog, dictionary).ok).toBe(true)
  for (const suffix of [
    ' (crafted)',
    ' (fractured)',
    ' (desecrated)',
    '\n--------\nFractured Item',
  ]) {
    expect(
      parseCraftProject(
        JSON.stringify({
          ...input,
          initialState: { ...input.initialState, sourceText: raw + suffix },
        }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
  }
})
