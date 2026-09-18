import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { estimateCatalystEffects } from './catalystEffects'
import { catalystActiveQualityLimit, catalystStoredQualityLimit } from './catalystQuality'
import { catalog, dictionary } from './catalystTestFixture'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { serializeTargetCraftProject } from './craftProjectTargets'
import { essenceSourceHash } from './essences'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { type CraftResult, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { statScalabilitySourceHash } from './statScalability'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

function must<T>(value: CraftResult<T>): T {
  if (!value.ok) throw Error(value.error)
  return value.value
}
it.each([
  ['Gold Ring', 50, 20],
  ['Jade Amulet', 50, 20],
  ['Breach Ring', 70, 40],
] as const)('%s 已有注能品质保留，施加与换类型上限独立', (baseId, quality, active) => {
  const state = must(
    createCraftState(catalog, {
      baseId,
      itemLevel: 80,
      rarity: 'rare',
      sourceText: null,
      catalyst: { id: 'Flesh', quality, declared: true },
      affixes: [{ modId: 'IncreasedLife1', lines: ['+19(10-19) to maximum Life'] }],
    }),
  )
  expect(must(catalystActiveQualityLimit(catalog, state))).toBe(active)
  const estimate = must(estimateCatalystEffects(catalog, state, 'Flesh', quality))
  expect(estimate.groups.find((g) => g.id === 'IncreasedLife1')?.lines[0]?.after).toBe(
    `+${Math.floor(19 * (1 + quality / 100))} to maximum Life`,
  )
  expect(estimateCatalystEffects(catalog, state, 'Neural', quality).ok).toBe(false)
  expect(
    createCraftState(catalog, { ...state, catalyst: { id: 'Flesh', quality: quality + 1 } }).ok,
  ).toBe(false)
  for (const locale of ['en', 'zh-CN', 'zh-TW'] as const) {
    const localDictionary =
      locale === 'en'
        ? dictionary
        : createCraftItemDictionary(catalog, {
            items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
            stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
          })
    const exported = must(
      exportCraftItemText(catalog, state, { locale, dictionary: localDictionary }),
    )
    const parsed = parseItem(exported.text)
    if (!parsed.ok) throw Error(parsed.error)
    const imported = must(
      importCraftState(
        catalog,
        baseId,
        parsed.item,
        inspectItem(parsed.item, localDictionary),
        undefined,
        undefined,
        localDictionary.stats?.entries,
        locale === 'en' ? undefined : 'Flesh',
      ),
    )
    expect(imported.catalyst).toMatchObject({ id: 'Flesh', quality })
    expect(imported.affixes[0]?.lines).toEqual(state.affixes[0]?.lines)
  }
  const plain = { ...catalog, essences: [] }
  const base = catalog.bases.find((b) => b.id === baseId)
  if (!base) throw Error('基底缺失')
  expect(catalystStoredQualityLimit(plain, base)).toBe(active + 10)
  expect(createCraftState(plain, state).ok).toBe(false)
  expect(
    createCraftState(plain, { ...state, catalyst: { id: 'Flesh', quality: active + 10 } }).ok,
  ).toBe(true)
})
it('v120 全游标保留70品质与催化消费，旧规则不能夹带新起点', () => {
  const input = {
    schemaVersion: 1,
    rulesVersion: 'basic-2026-09-18-v120',
    sourceCommit: catalog._meta.sourceCommit,
    essenceSourceHash: essenceSourceHash(catalog),
    scalabilitySourceHash: statScalabilitySourceHash(catalog),
    initialState: {
      baseId: 'Breach Ring',
      itemLevel: 80,
      rarity: 'normal',
      sourceText: null,
      nextAffixId: 1,
      affixes: [],
      catalyst: { id: 'Flesh', quality: 70, declared: true },
    },
    operations: [
      { currency: 'transmutation', modIds: ['IncreasedLife1'] },
      { currency: 'regal', modIds: ['FireResist1'] },
      { currency: 'exalted', omen: 'catalysing_exaltation', modIds: ['LifeRegeneration1'] },
    ],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
  for (let cursor = 0; cursor <= input.operations.length; cursor++) {
    const restored = must(loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog))
    expect(restored.states[2]?.catalyst?.quality).toBe(70)
    expect(restored.states[3]?.catalyst?.quality).toBe(0)
    expect(
      JSON.parse(must(serializeTargetCraftProject(restored.project, catalog))).rulesVersion,
    ).toBe(input.rulesVersion)
  }
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...input, rulesVersion: 'basic-2026-09-18-v119' }),
      catalog,
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('v120') })
  const { essenceSourceHash: _hash, ...noHash } = input
  const lower = {
    ...noHash,
    initialState: {
      ...input.initialState,
      baseId: 'Gold Ring',
      catalyst: { id: 'Flesh', quality: 30, declared: true },
    },
  }
  const plain = { ...catalog, essences: [] }
  expect(loadTargetWorkbenchProject(JSON.stringify(lower), plain).ok).toBe(true)
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...lower, rulesVersion: 'basic-2026-09-18-v119' }),
      plain,
    ).ok,
  ).toBe(false)
  // 原版30品质依赖精华来源；不可因新规则把缺指纹旧项目放行。
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...lower, rulesVersion: 'basic-2026-09-18-v119' }),
      catalog,
    ).ok,
  ).toBe(false)
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({
        ...input,
        rulesVersion: 'basic-2026-09-18-v119',
        initialState: {
          ...input.initialState,
          catalyst: { id: 'Flesh', quality: 60, declared: true },
        },
      }),
      catalog,
    ).ok,
  ).toBe(true)
})
