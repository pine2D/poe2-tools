import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { serializeTargetCraftProject } from './craftProjectTargets'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const essenceId = 'Metadata/Items/Currency/CurrencyGreaterEssenceAttribute'
function project() {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-18-v117',
    essenceSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/Essence.lua')?.sha256,
    initialState: {
      baseId: 'Amber Amulet',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
    },
    operations: [
      { currency: 'transmutation', modIds: ['IncreasedLife1'] },
      { kind: 'essence', essenceId, resultModId: 'Intelligence6', values: [26] },
    ],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
}
it('v117 保留尚未执行的普通属性精华和全部游标', () => {
  for (const cursor of [0, 1, 2]) {
    const input = { ...project(), cursor }
    const r = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
    expect(r).toMatchObject({ ok: true })
    if (!r.ok) continue
    expect(r.value.states[2]?.affixes[1]).toMatchObject({ modId: 'Intelligence6', crafted: true })
    const saved = serializeTargetCraftProject(r.value.project, catalog)
    expect(saved.ok).toBe(true)
    if (saved.ok) expect(JSON.parse(saved.value)).toEqual(input)
  }
})
it('旧版拒绝新精华未来而保留仅有报价的项目', () => {
  const input = { ...project(), rulesVersion: 'basic-2026-09-18-v116' }
  expect(loadTargetWorkbenchProject(JSON.stringify(input), catalog)).toMatchObject({
    ok: false,
    error: expect.stringContaining('v117'),
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
const strategy = {
  maxSteps: 2,
  rules: [
    { conditions: [{ kind: 'rarity', value: 'magic' }], action: { kind: 'essence', essenceId } },
  ],
}
it('尚未执行的属性精华指引也核对完整结果来源', () => {
  const input = { ...project(), operations: [], strategy }
  expect(loadTargetWorkbenchProject(JSON.stringify(input), catalog).ok).toBe(true)
  const changed = structuredClone(catalog)
  const mod = changed.modifiers.find((m) => m.id === 'Strength2')
  if (!mod) throw Error('缺少词缀')
  mod.level = 1
  expect(loadTargetWorkbenchProject(JSON.stringify(input), changed).ok).toBe(false)
})

it('复用新精华指引升级旧接收方，保留已有v117未来历史', () => {
  const template = { ...project(), operations: [], strategy }
  for (const receiver of [
    project(),
    { ...project(), rulesVersion: 'basic-2026-09-18-v116', operations: [] },
  ]) {
    const result = reuseTargetCraftPlan(JSON.stringify(receiver), JSON.stringify(template), catalog)
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) continue
    expect(result.value.project.rulesVersion).toBe('basic-2026-09-18-v117')
    expect(result.value.project.operations).toEqual(receiver.operations)
    expect(result.value.project.strategy).toEqual(strategy)
  }
})
