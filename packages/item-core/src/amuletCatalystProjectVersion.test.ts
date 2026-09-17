import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { requiresAmuletCatalystProjectVersion } from './amuletCatalystProjectVersion'
import { readBaseSkillVariants } from './baseSkillVariants'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { type CraftProject, parseCraftProject, serializeCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { essenceSourceHash } from './essences'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { importIdentifiedCraftState } from './rehearsalImport'
import { statScalabilitySourceHash } from './statScalability'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const version = 'basic-2026-09-17-v105'
const state = {
  baseId: 'Absent Amulet',
  itemLevel: 86,
  rarity: 'normal' as const,
  affixes: [],
  sourceText: null,
  nextAffixId: 1,
  implicitLines: [
    '-1 Prefix Modifier allowed',
    '-1 Suffix Modifier allowed',
    'Grants Skill: Level 12 Archmage',
  ],
}
function project() {
  return {
    schemaVersion: 1,
    rulesVersion: version,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: state,
    operations: [],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
}
function declared(quality = 50) {
  return {
    ...project(),
    initialState: { ...state, catalyst: { id: 'Flesh', quality, declared: true } },
    scalabilitySourceHash: statScalabilitySourceHash(catalog),
    essenceSourceHash: essenceSourceHash(catalog),
  }
}
const operations = [
  {
    currency: 'alchemy',
    modIds: ['IncreasedLife1', 'FireResist1', 'IncreasedMana1', 'ColdResist1'],
    rolls: [
      { affixId: 'a1', modId: 'IncreasedLife1', values: [19] },
      { affixId: 'a2', modId: 'FireResist1', values: [8] },
      { affixId: 'a3', modId: 'IncreasedMana1', values: [10] },
      { affixId: 'a4', modId: 'ColdResist1', values: [8] },
    ],
  },
  {
    kind: 'essence',
    essenceId: 'Metadata/Items/Currency/CurrencyCorruptedEssenceBreach',
    removeModId: 'IncreasedLife1',
    removeAffixId: 'a1',
    values: [],
  },
  { currency: 'annulment', modIds: [], removeModId: 'EssenceBreach', removeAffixId: 'a5' },
  {
    currency: 'exalted',
    omen: 'catalysing_exaltation',
    modIds: ['IncreasedLife1'],
    rolls: [{ affixId: 'a6', modId: 'IncreasedLife1', values: [19] }],
  },
]
it('空v105保存版本，三项链已有50品质完整未来移除Breach与催化消费可恢复', () => {
  for (const baseId of ['Lament Amulet', 'Portent Amulet', 'Absent Amulet']) {
    const base = catalog.bases.find((entry) => entry.id === baseId)
    if (!base) throw Error(baseId)
    const variants = readBaseSkillVariants(base)
    if (!variants?.variants[0]) throw Error(baseId)
    const initialState = {
      ...declared().initialState,
      baseId,
      implicitLines: [variants.variants[0].line, ...variants.commonLines],
    }
    for (const input of [project(), { ...declared(), initialState, operations }]) {
      for (const cursor of [0, input.operations.length]) {
        const loaded = loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog)
        if (!loaded.ok) throw Error(loaded.error)
        expect(loaded.value.project.rulesVersion).toBe(version)
        if (input.operations.length) {
          expect(loaded.value.states[3]?.catalyst?.quality).toBe(50)
          expect(loaded.value.states[4]?.catalyst?.quality).toBe(0)
          expect(loaded.value.states[4]?.implicitLines).toEqual(initialState.implicitLines)
        }
        const saved = serializeTargetCraftProject(loaded.value.project, catalog)
        if (!saved.ok) throw Error(saved.error)
        expect(JSON.parse(saved.value)).toEqual({ ...input, cursor })
      }
    }
  }
})
it('v2–104在项链上下文拒绝催化数据，包括未来和嵌套未执行状态', () => {
  for (let n = 2; n <= 104; n++) {
    const parse =
      n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
    const input = {
      ...project(),
      rulesVersion: `basic-2026-09-${n >= 92 ? '17' : n >= 76 ? '16' : '12'}-v${n}`,
    }
    for (const patch of [
      { initialState: declared(20).initialState },
      { operations: [{ unused: { catalyst: { id: 'Flesh', quality: 20 } } }] },
      { strategy: { future: [{ initialState: declared(50).initialState }] } },
    ])
      expect(parse(JSON.stringify({ ...input, ...patch }), catalog)).toMatchObject({
        ok: false,
        error: expect.stringContaining('v105'),
      })
  }
  expect(() =>
    serializeCraftProject({
      ...declared(),
      rulesVersion: 'basic-2026-09-12-v72',
    } as unknown as CraftProject),
  ).toThrow('v105')
})
it('无催化旧项链与普通饰品已有催化保持原版本', () => {
  for (const input of [
    { ...project(), rulesVersion: 'basic-2026-09-17-v104' },
    {
      ...declared(40),
      rulesVersion: 'basic-2026-09-16-v79',
      initialState: { ...declared(40).initialState, baseId: 'Gold Ring', implicitLines: undefined },
    },
  ]) {
    const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
    if (!loaded.ok) throw Error(loaded.error)
    expect(loaded.value.project.rulesVersion).toBe(input.rulesVersion)
  }
})
it('v105完整继承缩放和高品质精华来源校验，未来归零不能绕过', () => {
  const input = { ...declared(), operations, cursor: operations.length }
  for (const key of ['scalabilitySourceHash', 'essenceSourceHash', 'sourceCommit']) {
    for (const value of [undefined, 'invalid'])
      expect(
        loadTargetWorkbenchProject(JSON.stringify({ ...input, [key]: value }), catalog).ok,
      ).toBe(false)
  }
})
it('复用方案保留接收方技能、等级、孔、催化及完整历史', () => {
  const current = {
    ...declared(),
    initialState: { ...declared().initialState, declaredSkillLevel: 13, declaredSkillSockets: 3 },
    operations: [
      { kind: 'perfect-flux', previousMaxLevel: 13 },
      { kind: 'skill-sockets', tier: 'perfect', previousSockets: 3 },
    ],
    cursor: 2,
  }
  const template = {
    ...declared(20),
    initialState: {
      ...declared(20).initialState,
      implicitLines: [...state.implicitLines.slice(0, 2), 'Grants Skill: Level 12 Trinity'],
    },
    targetImplicitValues: [
      { kind: 'granted-skill', lineIndex: 2, bounds: [{ index: 0, min: 20 }] },
    ],
  }
  const loaded = reuseTargetCraftPlan(JSON.stringify(current), JSON.stringify(template), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  expect(loaded.value.project.initialState).toEqual(current.initialState)
  expect(loaded.value.project.operations).toEqual(current.operations)
  expect(loaded.value.project.rulesVersion).toBe(version)
  expect(loaded.value.states.at(-1)).toMatchObject({
    grantedSkillLevel: 20,
    grantedSkillSockets: 5,
    catalyst: current.initialState.catalyst,
  })
})
it.each(
  (['en', 'zh-CN', 'zh-TW'] as const).flatMap((locale) => [
    { locale, unknown: false },
    { locale, unknown: true },
  ]),
)('$locale高级文本未知类型=$unknown的50品质与技能Max原文可往返', ({ locale, unknown }) => {
  const dictionaries =
    locale === 'en'
      ? {}
      : {
          items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
          stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
        }
  const dictionary = createCraftItemDictionary(catalog, dictionaries)
  const input = {
    ...declared(),
    initialState: {
      ...declared().initialState,
      implicitLines: [
        ...state.implicitLines.slice(0, 2),
        'Grants Skill: Level 12 Archmage (Max Level 13)',
      ],
    },
    operations: operations.slice(0, 1),
    cursor: 1,
  }
  const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  const current = loaded.value.states[1]
  if (!current) throw Error('缺少状态')
  const output = exportCraftItemText(catalog, current, { locale, dictionary })
  if (!output.ok) throw Error(output.error)
  const sourceText = unknown
    ? output.value.text.replace('Quality (Life Modifiers)', '品质（待核对类型）')
    : output.value.text
  const parsed = parseItem(sourceText)
  if (!parsed.ok) throw Error(parsed.error)
  const imported = importIdentifiedCraftState(
    catalog,
    state.baseId,
    parsed.item,
    inspectItem(parsed.item, dictionary),
    undefined,
    undefined,
    dictionary.stats?.entries,
    unknown ? 'Flesh' : undefined,
  )
  if (!imported.ok) throw Error(imported.error)
  const restored = { ...declared(), initialState: imported.value }
  const replay = loadTargetWorkbenchProject(JSON.stringify(restored), catalog, dictionary)
  if (!replay.ok) throw Error(replay.error)
  expect(replay.value.states[0]?.sourceText).toBe(sourceText)
  expect(replay.value.states[0]?.catalyst?.quality).toBe(50)
  expect(replay.value.states[0]?.affixes[0]?.lines).toEqual(['+19(10-19) to maximum Life'])
  const saved = serializeTargetCraftProject(replay.value.project, catalog, dictionary)
  if (!saved.ok) throw Error(saved.error)
  expect(JSON.parse(saved.value)).toEqual(restored)
  if (unknown)
    expect(
      loadTargetWorkbenchProject(
        JSON.stringify({
          ...restored,
          initialState: { ...imported.value, catalyst: { id: 'Flesh', quality: 50 } },
        }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({
        ...restored,
        initialState: {
          ...imported.value,
          catalyst: { id: 'Flesh', quality: 30, declared: true },
        },
      }),
      catalog,
      dictionary,
    ).ok,
  ).toBe(false)
})

it('三项链已有30品质只需缩放来源，超过30必须精华来源', () => {
  for (const quality of [20, 30, 31, 50]) {
    const input = { ...declared(quality), essenceSourceHash: undefined }
    expect(loadTargetWorkbenchProject(JSON.stringify(input), catalog).ok).toBe(quality <= 30)
  }
})

it('催化能力扫描遵循独立装备上下文且不读取访问器', () => {
  const catalyst = { catalyst: { id: 'Flesh', quality: 50 } }
  const shared = { nested: catalyst }
  expect(
    requiresAmuletCatalystProjectVersion([
      { initialState: { baseId: 'Absent Amulet' }, shared },
      { initialState: { baseId: 'Gold Ring' }, shared },
    ]),
  ).toBe(true)
  expect(
    requiresAmuletCatalystProjectVersion({
      initialState: { baseId: 'Absent Amulet' },
      nested: { initialState: { baseId: 'Gold Ring' }, shared },
      sourceText: 'catalyst',
    }),
  ).toBe(false)
  let reads = 0
  const cyclic: Record<string, unknown> = {
    initialState: { baseId: 'Absent Amulet' },
    get catalyst() {
      reads++
      return null
    },
  }
  cyclic.self = cyclic
  expect(requiresAmuletCatalystProjectVersion(cyclic)).toBe(true)
  expect(reads).toBe(0)
})
