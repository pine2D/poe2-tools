import { expect, it } from 'vitest'
import { buildInitialBeltImplicitLines, resolveCraftImplicitPatterns } from './beltImplicits'
import { beltCatalog, beltSource, beltState, required } from './beltTestFixture'
import { boneCatalog } from './boneTestFixture'
import { inspectModPool } from './catalog'
import { compareCraftStates } from './comparison'
import { exportCraftItemText } from './craftItemText'
import { parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { applyCraftOperation, createCraftState, prepareCraftOperation } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { planCraftTargetRoutes } from './targetRoutes'

it('物等30声明两栏，点金和神圣沿用1–2范围', () => {
  const catalog = beltCatalog()
  const base = required(catalog.bases[0])
  const result = buildInitialBeltImplicitLines(base, 30, 2)
  expect(result).toEqual({
    ok: true,
    value: ['Has 2(1-2) Charm Slot', '(10-20)% increased Flask Charges gained'],
  })
  if (!result.ok) return
  const rare = applyCraftOperation(
    catalog,
    { ...beltState(), implicitLines: result.value },
    { currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'] },
  )
  expect(rare.ok).toBe(true)
  if (!rare.ok) return
  const divine = applyCraftOperation(catalog, rare.value, {
    currency: 'divine',
    modIds: [],
    rolls: rare.value.affixes.map((a) => ({ modId: a.modId, values: [5] })),
    implicitValues: [1, 15],
  })
  expect(divine).toMatchObject({
    ok: true,
    value: {
      implicitLines: ['Has 1(1-2) Charm Slot', '15(10-20)% increased Flask Charges gained'],
    },
  })
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)('完整%s来源保留旧1–2并核对原文和候选数字', (locale) => {
  const source = beltSource(locale)
  const run = () =>
    importCraftState(
      beltCatalog(),
      'Synthetic Base',
      source.item,
      source.inspection,
      undefined,
      undefined,
      source.dictionary.stats?.entries,
    )
  expect(source.item.diagnostics).toEqual([])
  expect(run()).toMatchObject({
    ok: true,
    value: {
      implicitLines: ['Has 2(1-2) Charm Slot', '15(10-20)% increased Flask Charges gained'],
    },
  })
  const stat = required(required(source.inspection.mods[0]).stats[0])
  stat.resolution.english = 'Has 3(1-3) Charm Slots'
  stat.resolution.candidates = [{ id: 'charm', english: 'Has 3(1-3) Charm Slots' }]
  expect(run().ok).toBe(false)
})

it.each([
  [29, 1],
  [30, 2],
  [59, 2],
  [60, 3],
] as const)('物等%s上限%s', (level, max) => {
  const base = required(beltCatalog().bases[0])
  expect(buildInitialBeltImplicitLines(base, level, max)).toMatchObject({
    ok: true,
    value: [`Has ${max}(1-${max}) Charm Slot`, expect.any(String)],
  })
  expect(buildInitialBeltImplicitLines(base, level, max + 1).ok).toBe(false)
})

it('未知范围允许普通制作，神圣prepare/apply均拒绝；固定基底不升级', () => {
  const catalog = beltCatalog()
  const state = {
    ...beltState(80),
    sourceText: 'source',
    implicitLines: ['Has 2 Charm Slot', '15(10-20)% increased Flask Charges gained'],
  }
  expect(createCraftState(catalog, state).ok).toBe(true)
  expect(prepareCraftOperation(catalog, state, 'transmutation').ok).toBe(true)
  expect(prepareCraftOperation(catalog, state, 'divine')).toMatchObject({
    ok: false,
    error: expect.stringContaining('范围'),
  })
  expect(
    applyCraftOperation(catalog, state, { currency: 'divine', modIds: [], implicitValues: [15] })
      .ok,
  ).toBe(false)
  const fixed = beltCatalog(true)
  const lines = buildInitialBeltImplicitLines(required(fixed.bases[0]), 80, 1)
  expect(lines).toMatchObject({ ok: true, value: ['Has 1 Charm Slot', expect.any(String)] })
  expect(buildInitialBeltImplicitLines(required(fixed.bases[0]), 80, 2).ok).toBe(false)
  if (lines.ok)
    expect(
      applyCraftOperation(
        fixed,
        { ...beltState(80), implicitLines: lines.value },
        { currency: 'divine', modIds: [], rolls: [], implicitValues: [20] },
      ).ok,
    ).toBe(true)
})

it.each([
  'Has 0 Charm Slot',
  'Has -1 Charm Slot',
  'Has 1.5 Charm Slot',
  'Has 4 Charm Slot',
  'Has 2(2-1) Charm Slot',
  'Has 2(0-2) Charm Slot',
  'Has 2(1-4) Charm Slot',
  'Has 2(1-1) Charm Slot',
  'Has 2(1-2) Charm Slot extra',
])('拒绝非法槽行%s', (line) => {
  expect(
    createCraftState(beltCatalog(), {
      ...beltState(80),
      sourceText: 'source',
      implicitLines: [line, '(10-20)% increased Flask Charges gained'],
    }).ok,
  ).toBe(false)
})

it('完整匹配其他固有并按实际行序返回索引；旧cap不能超过物等', () => {
  const base = required(beltCatalog().bases[0])
  const state = {
    ...beltState(80),
    sourceText: 'source',
    implicitLines: ['15(10-20)% increased Flask Charges gained', 'Has 1(1-2) Charm Slot'],
  }
  expect(resolveCraftImplicitPatterns(base, state)).toMatchObject({
    ok: true,
    value: {
      patterns: ['(10-20)% increased Flask Charges gained', 'Has (1-2) Charm Slot'],
      charm: { lineIndex: 1, range: { min: 1, max: 2 } },
    },
  })
  for (const implicitLines of [
    undefined,
    [],
    ['Has 1(1-2) Charm Slot'],
    ['Has 1(1-2) Charm Slot', 'Has 1(1-2) Charm Slot'],
    ['Has 1(1-2) Charm Slot', '100% increased Flask Charges gained'],
  ]) {
    expect(
      createCraftState(beltCatalog(), { ...beltState(), ...{ implicitLines } } as Parameters<
        typeof createCraftState
      >[1]).ok,
    ).toBe(false)
  }
  expect(resolveCraftImplicitPatterns(base, { ...state, itemLevel: 29 }).ok).toBe(false)
})

it('Genesis上下文不能成为普通或亵渎资格，也不能由动态标签注入', () => {
  const catalog = boneCatalog('Ring')
  const base = required(catalog.bases[0])
  base.tags.push('genesis_tree_caster', 'genesis_tree_minion')
  const only = required(catalog.modifiers[0])
  only.eligibility = [
    { tag: 'genesis_tree_caster', value: 1 },
    { tag: 'genesis_tree_minion', value: 1 },
    { tag: 'default', value: 0 },
  ]
  for (const source of ['ordinary', 'desecrated'] as const) {
    expect(inspectModPool(base, [only], 80, [], [], source)).toEqual([])
    expect(
      inspectModPool(
        { ...base, tags: ['default'] },
        [only],
        80,
        [],
        ['genesis_tree_caster'],
        source,
      ),
    ).toEqual([])
  }
  const initial = {
    baseId: base.id,
    itemLevel: 80,
    rarity: 'rare' as const,
    sourceText: null,
    affixes: [{ modId: only.id, lines: ['prefix1 5'] }],
  }
  expect(createCraftState(catalog, initial).ok).toBe(false)
  expect(
    parseCraftProject(
      JSON.stringify({
        schemaVersion: 1,
        rulesVersion: 'basic-2026-09-12-v21',
        sourceCommit: catalog._meta.sourceCommit,
        initialState: { ...initial, rarity: 'normal', affixes: [] },
        cursor: 0,
        operations: [{ currency: 'transmutation', modIds: [only.id] }],
      }),
      catalog,
    ).ok,
  ).toBe(false)
  only.eligibility = [{ tag: 'default', value: 1 }]
  expect(inspectModPool(base, [only], 80)).toHaveLength(1)
  only.eligibility = [
    { tag: 'default', value: 0 },
    { tag: 'synthetic', value: 1 },
  ]
  expect(inspectModPool(base, [only], 80)).toEqual([])
  only.eligibility = [
    { tag: 'enabled', value: 1 },
    { tag: 'default', value: 0 },
  ]
  expect(inspectModPool(base, [only], 80, [], ['enabled'])).toHaveLength(1)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s可选面板只核对实值，不提供范围', (locale) => {
  const source = beltSource(locale)
  const label = locale === 'en' ? 'Charm Slots' : locale === 'zh-CN' ? '咒符栏' : '護符欄位'
  const run = (panel: string) => {
    const parsed = parseItem(
      source.item.rawText.replace('--------', `--------\n${panel}\n--------`),
    )
    if (!parsed.ok) throw new Error(parsed.error)
    return importCraftState(
      beltCatalog(),
      'Synthetic Base',
      parsed.item,
      inspectItem(parsed.item, source.dictionary),
      undefined,
      undefined,
      source.dictionary.stats?.entries,
    )
  }
  expect(run(`${label}: 2 (augmented)`).ok).toBe(true)
  for (const panel of [`${label}: 1`, `${label}: 2\n${label}: 2`, `${label}: 2.5`, `${label}: -2`])
    expect(run(panel).ok).toBe(false)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s明确Properties区段中的已知槽标题非法值不能被跳过',
  (locale) => {
    const source = beltSource(locale)
    const label = locale === 'en' ? 'Charm Slots' : locale === 'zh-CN' ? '咒符栏' : '護符欄位'
    const properties = locale === 'en' ? 'Properties:' : locale === 'zh-CN' ? '属性:' : '屬性:'
    for (const value of ['-1', '1.5', 'unknown', '']) {
      const parsed = parseItem(
        source.item.rawText.replace(
          '--------',
          `--------\n${properties}\n${label}: ${value}\n--------`,
        ),
      )
      if (!parsed.ok) throw new Error(parsed.error)
      expect(
        importCraftState(
          beltCatalog(),
          'Synthetic Base',
          parsed.item,
          inspectItem(parsed.item, source.dictionary),
          undefined,
          undefined,
          source.dictionary.stats?.entries,
        ).ok,
      ).toBe(false)
    }
  },
)

it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s当前文本输出和回读保留实际槽值与范围', (locale) => {
  const source = beltSource(locale)
  const catalog = beltCatalog()
  const imported = importCraftState(
    catalog,
    'Synthetic Base',
    source.item,
    source.inspection,
    undefined,
    undefined,
    source.dictionary.stats?.entries,
  )
  expect(imported.ok).toBe(true)
  if (!imported.ok) return
  const next = applyCraftOperation(catalog, imported.value, {
    currency: 'divine',
    modIds: [],
    rolls: [],
    implicitValues: [1, 20],
  })
  expect(next.ok).toBe(true)
  if (!next.ok) return
  expect(compareCraftStates(catalog, imported.value, next.value)).toMatchObject({
    ok: true,
    value: {
      implicit: {
        numeric: [
          { index: 0, before: 2, after: 1 },
          { index: 1, before: 15, after: 20 },
        ],
      },
    },
  })
  const output = exportCraftItemText(catalog, next.value, { locale, dictionary: source.dictionary })
  expect(output.ok).toBe(true)
  if (!output.ok) return
  if (locale !== 'en')
    expect(output.value.text).toContain(
      locale === 'zh-CN' ? '具有 1(1-2) 个咒符栏' : '有 1(1-2) 個護符欄位',
    )
  const parsed = parseItem(output.value.text)
  if (!parsed.ok) throw new Error(parsed.error)
  const restored = importCraftState(
    catalog,
    'Synthetic Base',
    parsed.item,
    inspectItem(parsed.item, source.dictionary),
    undefined,
    undefined,
    source.dictionary.stats?.entries,
  )
  expect(restored).toMatchObject({ ok: true, value: { implicitLines: next.value.implicitLines } })
})

it('篡改原始解析对象、源stats或省略槽组均拒绝，缺词典不能自称中文译文', () => {
  for (const mutation of ['item', 'source', 'missing', 'dictionary'] as const) {
    const source = beltSource('zh-CN')
    if (mutation === 'item') source.item.itemLevel = 99
    if (mutation === 'source')
      required(required(source.inspection.mods[0]).stats[0]).source.raw = '具有 3(1-3) 个咒符栏'
    if (mutation === 'missing') source.inspection.mods = []
    expect(
      importCraftState(
        beltCatalog(),
        'Synthetic Base',
        source.item,
        source.inspection,
        undefined,
        undefined,
        mutation === 'dictionary' ? [] : source.dictionary.stats?.entries,
      ).ok,
    ).toBe(false)
  }
})

it('普通加工和骨骼全链路保留plain未知槽，特殊基底继续拒绝', () => {
  const catalog = beltCatalog()
  let state = {
    ...beltState(80),
    sourceText: 'source',
    implicitLines: ['Has 2 Charm Slot', '15(10-20)% increased Flask Charges gained'],
  }
  for (const operation of [
    { currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'] },
    { kind: 'desecrate', boneId: 'preserved_collarbone', affixKind: 'suffix' },
    { kind: 'desecration-offer', modIds: ['suffix3', 'exclusive1', 'exclusive2'] },
    { kind: 'desecration-reveal', modId: 'exclusive1', values: [5] },
    { currency: 'annulment', modIds: [], removeModId: 'exclusive1' },
  ] satisfies Parameters<typeof applyCraftStep>[2][]) {
    const result = applyCraftStep(catalog, state, operation)
    expect(result.ok).toBe(true)
    if (result.ok)
      state = {
        ...result.value,
        sourceText: required(result.value.sourceText),
        implicitLines: required(result.value.implicitLines),
      }
    expect(state.implicitLines[0]).toBe('Has 2 Charm Slot')
  }
  for (const properties of [
    { hidden: true },
    { runeforged: true },
    { charmLimit: 1 },
    { charm: {} },
    { type: 'Charm' },
    {
      implicit:
        'Has 1 Charm Slot\nThis item gains bonuses from Socketed Items as though it was Boots',
    },
  ]) {
    const bad = beltCatalog()
    Object.assign(required(bad.bases[0]), properties)
    expect(createCraftState(bad, beltState()).ok).toBe(false)
  }
})

it('精华精确保证仍可用Genesis-only映射，普通池不借此放行且槽范围不变', () => {
  const catalog = beltCatalog()
  const essenceId = 'Metadata/Items/Currency/CurrencyLesserEssenceLife'
  catalog._meta.sources.push({ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' })
  catalog.essences = [
    {
      id: essenceId,
      name: 'Lesser Essence of Life',
      type: 'Life',
      tierLevel: 1,
      mods: { Belt: 'prefix1' },
    },
  ]
  required(catalog.modifiers[0]).eligibility = [
    { tag: 'genesis_tree_caster', value: 1 },
    { tag: 'default', value: 0 },
  ]
  const state = { ...beltState(), rarity: 'magic' as const }
  const result = applyCraftStep(catalog, state, { kind: 'essence', essenceId, values: [5] })
  expect(result).toMatchObject({
    ok: true,
    value: { implicitLines: state.implicitLines, affixes: [{ modId: 'prefix1', crafted: true }] },
  })
  expect(
    inspectModPool(required(catalog.bases[0]), catalog.modifiers, 30).some(
      (entry) => entry.mod.id === 'prefix1',
    ),
  ).toBe(false)
})

it.each([1, 2, 3] as const)('物等80旧cap%s神圣保持原端点，含单点范围', (max) => {
  const catalog = beltCatalog()
  const state = {
    ...beltState(80),
    sourceText: 'source',
    implicitLines: [`Has 1(1-${max}) Charm Slot`, '(10-20)% increased Flask Charges gained'],
  }
  expect(
    applyCraftOperation(catalog, state, {
      currency: 'divine',
      modIds: [],
      rolls: [],
      implicitValues: [max, 20],
    }),
  ).toMatchObject({
    ok: true,
    value: {
      implicitLines: [
        `Has ${max}(1-${max}) Charm Slot`,
        '20(10-20)% increased Flask Charges gained',
      ],
    },
  })
  expect(
    applyCraftOperation(catalog, state, {
      currency: 'divine',
      modIds: [],
      rolls: [],
      implicitValues: [max + 1, 20],
    }).ok,
  ).toBe(false)
})

it('路线神圣使用旧cap且操作和比较结果不共享固有数组', () => {
  const catalog = beltCatalog()
  const state = {
    ...beltState(80),
    sourceText: 'source',
    rarity: 'rare' as const,
    affixes: [{ modId: 'prefix1', lines: ['prefix1 5'] }],
    implicitLines: ['Has 1(1-2) Charm Slot', '15(10-20)% increased Flask Charges gained'],
  }
  const routes = planCraftTargetRoutes(
    catalog,
    state,
    ['prefix1'],
    [{ modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }],
    [],
    { maxDepth: 1 },
  )
  expect(routes.ok).toBe(true)
  if (!routes.ok) return
  const divine = routes.value.routes
    .flatMap((route) => route.steps)
    .find((step) => 'currency' in step.operation && step.operation.currency === 'divine')
  expect(divine).toBeDefined()
  if (!divine) return
  expect(divine.state.implicitLines?.[0]).toBe('Has 1(1-2) Charm Slot')
  const comparison = compareCraftStates(catalog, state, divine.state)
  expect(comparison.ok).toBe(true)
  if (divine.state.implicitLines) divine.state.implicitLines[0] = 'changed'
  expect(state.implicitLines[0]).toBe('Has 1(1-2) Charm Slot')
})
