import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { serializeTargetCraftProject } from './craftProjectTargets'
import { requiresDefenceEssenceProjectVersion } from './defenceEssenceProjectVersion'
import { inspectItem } from './export'
import { parseItem } from './parse'
import type { CraftResult, CraftState } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const essenceId = 'Metadata/Items/Currency/CurrencyGreaterEssenceDefences'
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
it('双工艺起点依赖新来源，普通、单工艺与仅目标保持旧语义', () => {
  const modId = 'LocalIncreasedEnergyShieldPercent5'
  expect(
    requiresDefenceEssenceProjectVersion({
      initialState: {
        affixes: [
          { modId, crafted: true },
          { modId: 'IncreasedLife1', crafted: true },
        ],
      },
    }),
  ).toBe(true)
  expect(
    requiresDefenceEssenceProjectVersion({ initialState: { affixes: [{ modId, crafted: true }] } }),
  ).toBe(false)
  expect(requiresDefenceEssenceProjectVersion({ targetModIds: [modId] })).toBe(false)
  const action = { kind: 'essence', essenceId }
  expect(requiresDefenceEssenceProjectVersion({ strategy: { rules: [{ action }] } })).toBe(true)
  expect(requiresDefenceEssenceProjectVersion({ sourceText: JSON.stringify(action) })).toBe(false)
})
function project() {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-18-v115',
    essenceSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/Essence.lua')?.sha256,
    initialState: {
      baseId: 'Sleek Jacket',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
    },
    operations: [
      { currency: 'transmutation', modIds: ['IncreasedLife1'] },
      { kind: 'essence', essenceId, values: [72] },
    ],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
}
it('v115 恢复包括未执行的防御精华未来，保存全部游标', () => {
  for (const cursor of [0, 1, 2]) {
    const input = { ...project(), cursor }
    const restored = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
    expect(restored).toMatchObject({ ok: true })
    if (!restored.ok) continue
    expect(restored.value.states[2]?.affixes[1]).toMatchObject({
      modId: 'LocalIncreasedEvasionAndEnergyShield5_',
      crafted: true,
    })
    const saved = serializeTargetCraftProject(restored.value.project, catalog)
    expect(saved.ok).toBe(true)
    if (saved.ok) expect(JSON.parse(saved.value)).toEqual(input)
  }
})
it('旧版不得接收防御精华操作，报价不触发新能力', () => {
  const input = { ...project(), rulesVersion: 'basic-2026-09-18-v114' }
  expect(loadTargetWorkbenchProject(JSON.stringify(input), catalog)).toMatchObject({
    ok: false,
    error: expect.stringContaining('v115'),
  })
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({
        ...input,
        operations: [],
        pricing: { unit: 'divine', prices: { [`essence:${essenceId}`]: 1 } },
      }),
      catalog,
    ).ok,
  ).toBe(true)
})

it('旧版不能通过未来其他精华间接取得双工艺资格，v115 保留所有游标', () => {
  const dictionary = createCraftItemDictionary(catalog)
  const mod = catalog.modifiers.find((m) => m.id === 'LocalIncreasedEvasionAndEnergyShield5_')
  if (!mod) throw Error('缺少防御词缀')
  const state: CraftState = {
    baseId: 'Sleek Jacket',
    itemLevel: 86,
    rarity: 'magic',
    sourceText: null,
    nextAffixId: 2,
    sockets: [null],
    affixes: [{ affixId: 'a1', modId: mod.id, lines: mod.lines, crafted: true }],
  }
  const text = must(exportCraftItemText(catalog, state, { locale: 'en', dictionary })).text
  const parsed = parseItem(text)
  if (!parsed.ok) throw Error(parsed.error)
  const initialState = must(
    importIdentifiedCraftState(
      catalog,
      state.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      state.sockets,
      undefined,
      dictionary.stats?.entries,
    ),
  )
  const input = {
    ...project(),
    initialState,
    importedSockets: state.sockets,
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    operations: [
      {
        kind: 'socket',
        socketIndex: 0,
        augmentId: 'pob2:augment:["Astrid\'s Creativity","armour"]',
      },
      {
        kind: 'essence',
        essenceId: 'Metadata/Items/Currency/CurrencyGreaterEssenceFireResist',
        values: [33],
      },
    ],
  }
  for (const cursor of [0, 1, 2]) {
    expect(
      loadTargetWorkbenchProject(
        JSON.stringify({ ...input, cursor, rulesVersion: 'basic-2026-09-18-v114' }),
        catalog,
        dictionary,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('第 2 步') })
    const restored = must(
      loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog, dictionary),
    )
    expect(restored.states[2]?.affixes.filter((a) => a.crafted)).toHaveLength(2)
    expect(must(serializeTargetCraftProject(restored.project, catalog, dictionary))).toBeTruthy()
  }
})
