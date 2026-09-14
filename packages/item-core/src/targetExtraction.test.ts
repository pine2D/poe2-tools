import { expect, it } from 'vitest'
import { catalog, dictionary, imported } from './catalystTestFixture'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import { reuseCraftPlan } from './projectPlan'
import { extractCraftTargets } from './targetExtraction'
import { analyzeCraftTargets, craftTargetsSatisfied } from './targets'

const state = () => {
  const result = imported()
  if (!result.ok) throw Error(result.error)
  return result.value
}
it('从已有催化装备提取精确基础值，保持当前装备与历史输入不变', () => {
  const current = state(),
    before = JSON.stringify(current)
  const result = extractCraftTargets(catalog, current, ['IncreasedLife1'], true, false)
  expect(result).toEqual({
    ok: true,
    value: {
      targetModIds: ['IncreasedLife1'],
      targetValues: [{ modId: 'IncreasedLife1', bounds: [{ index: 0, min: 19, max: 19 }] }],
    },
  })
  expect(JSON.stringify(current)).toBe(before)
})
it('可仅取指定档位，不伪造未掷范围的实际数值', () => {
  const current = {
    ...state(),
    affixes: [{ modId: 'IncreasedLife1', lines: ['+(10-19) to maximum Life'] }],
  }
  expect(extractCraftTargets(catalog, current, ['IncreasedLife1'], false, false)).toMatchObject({
    ok: true,
    value: { targetValues: [] },
  })
  expect(extractCraftTargets(catalog, current, ['IncreasedLife1'], true, false)).toMatchObject({
    ok: false,
    error: expect.stringContaining('实际基础数值'),
  })
})
it('空选、重复、不在当前装备的词缀及无效装备被拒绝', () => {
  for (const ids of [[], ['IncreasedLife1', 'IncreasedLife1'], ['FireResist1'], ['missing']])
    expect(extractCraftTargets(catalog, state(), ids, false, false).ok).toBe(false)
  expect(
    extractCraftTargets(
      catalog,
      { ...state(), rarity: 'unique' as never },
      ['IncreasedLife1'],
      false,
      false,
    ).ok,
  ).toBe(false)
})
it('仅在明确选择且所选组已有破裂时携带破裂要求', () => {
  const source = state()
  const affix = source.affixes[0]
  if (!affix) throw Error('缺少词缀')
  const current = { ...source, affixes: [{ ...affix, fractured: true as const }] }
  expect(extractCraftTargets(catalog, current, ['IncreasedLife1'], false, true)).toMatchObject({
    ok: true,
    value: { targetFracturedModId: 'IncreasedLife1' },
  })
  expect(extractCraftTargets(catalog, current, ['IncreasedLife1'], false, false)).toEqual({
    ok: true,
    value: { targetModIds: ['IncreasedLife1'], targetValues: [] },
  })
})

it('混合组只有可变基础值生成条件，固定数字与行显示次序不会错位', () => {
  const current = {
    ...state(),
    affixes: [
      {
        modId: 'LightRadiusAndManaRegeneration1',
        lines: ['5% increased Light Radius', '10(8-12)% increased Mana Regeneration Rate'],
      },
    ],
  }
  expect(
    extractCraftTargets(catalog, current, ['LightRadiusAndManaRegeneration1'], true, false),
  ).toEqual({
    ok: true,
    value: {
      targetModIds: ['LightRadiusAndManaRegeneration1'],
      targetValues: [
        { modId: 'LightRadiusAndManaRegeneration1', bounds: [{ index: 0, min: 10, max: 10 }] },
      ],
    },
  })
})
it('固定工艺目标沿精华来源校验，不为固定属性制造数值条件', () => {
  const current = {
    baseId: 'Adherent Cuffs',
    itemLevel: 86,
    rarity: 'rare' as const,
    sourceText: null,
    quality: 20,
    sockets: [],
    affixes: [
      {
        modId: 'EssenceLocalRuneAndSoulCoreEffect1',
        lines: ['60% increased effect of Socketed Augment Items'],
        crafted: true as const,
      },
    ],
  }
  expect(
    extractCraftTargets(catalog, current, ['EssenceLocalRuneAndSoulCoreEffect1'], true, false),
  ).toMatchObject({ ok: true, value: { targetValues: [] } })
})

it('提取成品目标后沿用至空白基底，建议、执行和项目回放共用精确条件', () => {
  const current = state()
  const extracted = extractCraftTargets(catalog, current, ['IncreasedLife1'], true, false)
  if (!extracted.ok) throw Error(extracted.error)
  const metadata = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    scalabilitySourceHash: catalog._meta.sources.find(
      (s) => s.path === 'src/Data/ModScalability.lua',
    )?.sha256,
    operations: [],
    cursor: 0,
  }
  const template = { ...metadata, initialState: current, ...extracted.value }
  const blank = {
    ...metadata,
    initialState: {
      baseId: current.baseId,
      itemLevel: 86,
      rarity: 'normal',
      sourceText: null,
      affixes: [],
    },
  }
  const reused = reuseCraftPlan(
    JSON.stringify(blank),
    JSON.stringify(template),
    catalog,
    dictionary,
  )
  if (!reused.ok) throw Error(reused.error)
  const p = reused.value.project
  const advice = analyzeCraftTargets(catalog, p.initialState, p.targetModIds ?? [], p.targetValues)
  if (!advice.ok) throw Error(advice.error)
  expect(craftTargetsSatisfied(advice.value)).toBe(false)
  expect(
    advice.value.steps.some(
      (s) => s.currency === 'transmutation' && s.targetModIds.includes('IncreasedLife1'),
    ),
  ).toBe(true)
  const operation = {
    currency: 'transmutation' as const,
    modIds: ['IncreasedLife1'],
    rolls: [{ modId: 'IncreasedLife1', values: [19] }],
  }
  const made = applyCraftStep(catalog, p.initialState, operation)
  if (!made.ok) throw Error(made.error)
  const after = analyzeCraftTargets(catalog, made.value, p.targetModIds ?? [], p.targetValues)
  if (!after.ok) throw Error(after.error)
  expect(craftTargetsSatisfied(after.value)).toBe(true)
  const restored = parseCraftProject(
    JSON.stringify({ ...p, operations: [operation], cursor: 1 }),
    catalog,
    dictionary,
  )
  expect(restored).toMatchObject({ ok: true, value: { states: [p.initialState, made.value] } })
})
