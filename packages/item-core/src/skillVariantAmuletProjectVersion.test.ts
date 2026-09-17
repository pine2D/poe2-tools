import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { type CraftProject, parseCraftProject, serializeCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import { requiresSkillVariantAmuletProjectVersion } from './skillVariantAmuletProjectVersion'
import { statScalabilitySourceHash } from './statScalability'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
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
const project = () => ({
  schemaVersion: 1,
  sourceCommit: catalog._meta.sourceCommit,
  rulesVersion: 'basic-2026-09-17-v102',
  initialState: state,
  operations: [],
  cursor: 0,
  targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
  orphanedTargets: [],
})
it('v102 保存选定技能并恢复撤销后的零词缀蜕变未来', () => {
  const input = { ...project(), operations: [{ currency: 'transmutation', modIds: [] }] }
  for (const cursor of [0, 1]) {
    const loaded = loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog)
    if (!loaded.ok) throw Error(loaded.error)
    expect(loaded.value.states.map((s) => s.rarity)).toEqual(['normal', 'magic'])
    expect(
      loaded.value.states.every(
        (s) => JSON.stringify(s.implicitLines) === JSON.stringify(state.implicitLines),
      ),
    ).toBe(true)
    const saved = serializeTargetCraftProject(loaded.value.project, catalog)
    if (!saved.ok) throw Error(saved.error)
    expect(JSON.parse(saved.value)).toEqual({ ...input, cursor })
  }
})
it('v2–101 完整树拒绝三种技能项链能力', () => {
  for (let n = 2; n <= 101; n++) {
    const { targetDefinitions, orphanedTargets, ...rest } = project()
    const ordinary = { ...state, baseId: 'Gold Amulet', implicitLines: undefined }
    const { nextAffixId: _, ...legacy } = ordinary
    const input = {
      ...rest,
      rulesVersion: `basic-2026-09-${n >= 92 ? '17' : n >= 76 ? '16' : '12'}-v${n}`,
      initialState: n >= 73 ? ordinary : legacy,
      ...(n >= 74 ? { targetDefinitions, orphanedTargets } : {}),
      ...(n === 75 ? { fluxCatalogSignature: fluxCatalogSignature(catalog) } : {}),
    }
    const parse =
      n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
    expect(parse(JSON.stringify(input), catalog).ok, `v${n}基线`).toBe(true)
    for (const baseId of ['Lament Amulet', 'Portent Amulet', 'Absent Amulet'])
      for (const patch of [
        { initialState: { ...input.initialState, baseId } },
        { operations: [{ nested: { baseId } }] },
        { strategy: { unused: [{ nested: { baseId } }] } },
      ])
        expect(
          parse(JSON.stringify({ ...input, ...patch }), catalog),
          `v${n}/${baseId}`,
        ).toMatchObject({ ok: false, error: expect.stringContaining('v102') })
  }
})
it('旧序列化入口拒绝起点和嵌套技能项链，v102 空历史和复用保留技能', () => {
  const { nextAffixId: _, ...legacy } = state
  const old: CraftProject = {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-12-v72',
    initialState: legacy,
    operations: [],
    cursor: 0,
  }
  expect(() => serializeCraftProject(old)).toThrow('v102')
  expect(() =>
    serializeCraftProject({
      ...old,
      initialState: { ...legacy, baseId: 'Gold Amulet', implicitLines: [] },
      extra: { nested: state },
    } as CraftProject),
  ).toThrow('v102')
  const template = {
    ...project(),
    initialState: {
      ...state,
      implicitLines: [...state.implicitLines.slice(0, 2), 'Grants Skill: Level 20 Trinity'],
    },
    strategy: {
      maxSteps: 1,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  const reused = reuseTargetCraftPlan(JSON.stringify(project()), JSON.stringify(template), catalog)
  if (!reused.ok) throw Error(reused.error)
  expect(reused.value.project.rulesVersion).toBe('basic-2026-09-17-v102')
  expect(reused.value.project.initialState).toEqual(state)
})
it('空白起点允许技能等级，拒绝篡改共同容量与重复技能', () => {
  for (const implicitLines of [
    ['-2 Prefix Modifier allowed', ...state.implicitLines.slice(1)],
    [...state.implicitLines, 'Grants Skill: Level 12 Trinity'],
    [...state.implicitLines.slice(0, 2), 'Grants Skill: Level 21 Archmage'],
  ])
    expect(
      loadTargetWorkbenchProject(
        JSON.stringify({ ...project(), initialState: { ...state, implicitLines } }),
        catalog,
      ).ok,
    ).toBe(false)
})
it('来源原文独立核对选定技能，保存状态不能改写技能或等级', () => {
  const sourceText =
    'Item Class: Amulets\nRarity: Normal\nAbsent Amulet\n--------\nItem Level: 86\n--------\n{ Implicit Modifier }\n-1 Prefix Modifier allowed\n-1 Suffix Modifier allowed\n--------\nGrants Skill: Level 12 Archmage'
  const input = { ...project(), initialState: { ...state, sourceText } }
  const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  expect(loaded.value.project.initialState).toEqual(input.initialState)
  for (const line of ['Grants Skill: Level 13 Archmage', 'Grants Skill: Level 12 Trinity'])
    expect(
      loadTargetWorkbenchProject(
        JSON.stringify({
          ...input,
          initialState: {
            ...input.initialState,
            implicitLines: [...state.implicitLines.slice(0, 2), line],
          },
        }),
        catalog,
      ).ok,
    ).toBe(false)
})
it('空 v102 普通基底保持版本，来源指纹仍严格核对', () => {
  const input = {
    ...project(),
    initialState: { ...state, baseId: 'Gold Amulet', implicitLines: undefined },
  }
  const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  expect(loaded.value.project.rulesVersion).toBe('basic-2026-09-17-v102')
  expect(
    loadTargetWorkbenchProject(JSON.stringify({ ...input, sourceCommit: 'invalid' }), catalog).ok,
  ).toBe(false)
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...input, augmentSourceHash: 'a'.repeat(64) }),
      catalog,
    ).ok,
  ).toBe(false)
})

it('能力扫描只读取数据描述符，不执行访问器或解释原文', () => {
  let reads = 0
  const getter = Object.defineProperty({}, 'baseId', {
    get() {
      reads++
      return 'Absent Amulet'
    },
  })
  expect(requiresSkillVariantAmuletProjectVersion({ nested: getter })).toBe(false)
  expect(reads).toBe(0)
  expect(requiresSkillVariantAmuletProjectVersion({ sourceText: 'Absent Amulet' })).toBe(false)
  expect(
    requiresSkillVariantAmuletProjectVersion({ future: [{ nested: { baseId: 'Absent Amulet' } }] }),
  ).toBe(true)
})
it('v102 继承完整未来的符文与缩放来源要求', () => {
  const input = {
    ...project(),
    initialState: {
      baseId: 'Crude Bow',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
      sockets: [null],
    },
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    scalabilitySourceHash: statScalabilitySourceHash(catalog),
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId: `pob2:augment:["Thrud's Might","weapon"]` },
      {
        currency: 'transmutation',
        modIds: ['DestructionInfluenceSpeedModifierEffect'],
        rolls: [{ modId: 'DestructionInfluenceSpeedModifierEffect', affixId: 'a1', values: [30] }],
      },
    ],
  }
  const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  const saved = serializeTargetCraftProject(loaded.value.project, catalog)
  if (!saved.ok) throw Error(saved.error)
  expect(JSON.parse(saved.value)).toEqual(input)
  for (const key of ['augmentSourceHash', 'scalabilitySourceHash'])
    expect(
      loadTargetWorkbenchProject(JSON.stringify({ ...input, [key]: undefined }), catalog).ok,
    ).toBe(false)
})
it.each(['zh-CN', 'zh-TW'] as const)('%s 保存恢复只使用原词典的技能译法', (locale) => {
  const tw = locale === 'zh-TW'
  const skillText = tw ? '賦予技能: 等級 # 合成技能' : '获得技能: 等级 # 合成技能'
  const entries = [
    { id: 'skill.synthetic', en: 'Grants Skill: Level # Archmage', text: skillText },
    {
      id: 'prefix',
      en: '# Prefix Modifier allowed',
      text: tw ? '可擁有 # 個前綴詞綴' : '可拥有 # 个前缀词缀',
    },
    {
      id: 'suffix',
      en: '# Suffix Modifier allowed',
      text: tw ? '可擁有 # 個後綴詞綴' : '可拥有 # 个后缀词缀',
    },
  ]
  const dictionary = {
    items: { bases: { 'Absent Amulet': '合成项链' }, uniques: {} },
    stats: { entries },
  }
  const sourceText = [
    tw ? '物品種類: 項鍊' : '物品类别: 项链',
    '稀有度: 普通',
    '合成项链',
    '--------',
    tw ? '物品等級: 86' : '物品等级: 86',
    '--------',
    skillText.replace('#', '12'),
    '--------',
    tw ? '{ 基底屬性 }' : '{ 基底属性 }',
    entries[1]?.text.replace('#', '-1'),
    entries[2]?.text.replace('#', '-1'),
  ].join('\n')
  const input = { ...project(), initialState: { ...state, sourceText } }
  const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog, dictionary)
  if (!loaded.ok) throw Error(loaded.error)
  const saved = serializeTargetCraftProject(loaded.value.project, catalog, dictionary)
  if (!saved.ok) throw Error(saved.error)
  expect(JSON.parse(saved.value)).toEqual(input)
  const forged = {
    ...input,
    initialState: {
      ...input.initialState,
      implicitLines: [...state.implicitLines.slice(0, 2), 'Grants Skill: Level 12 Trinity'],
    },
  }
  expect(loadTargetWorkbenchProject(JSON.stringify(forged), catalog, dictionary).ok).toBe(false)
  expect(
    loadTargetWorkbenchProject(JSON.stringify(input), catalog, {
      ...dictionary,
      stats: { entries: entries.slice(1) },
    }).ok,
  ).toBe(false)
})
