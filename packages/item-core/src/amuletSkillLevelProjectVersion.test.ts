import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { requiresAmuletSkillLevelProjectVersion } from './amuletSkillLevelProjectVersion'
import { readBaseSkillVariants } from './baseSkillVariants'
import type { CraftCatalog } from './catalog'
import { type CraftProject, parseCraftProject, serializeCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { statScalabilitySourceHash } from './statScalability'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
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
  rulesVersion: 'basic-2026-09-17-v104',
  initialState: state,
  operations: [],
  cursor: 0,
  targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
  orphanedTargets: [],
})
const action = { kind: 'perfect-flux', previousMaxLevel: 13 }
const target = { kind: 'granted-skill', lineIndex: 2, bounds: [{ index: 0, min: 20 }] }
const strategy = {
  maxSteps: 2,
  rules: [
    { conditions: [{ kind: 'not', condition: { kind: 'granted-skill-level', min: 20 } }], action },
  ],
}

it('v104 空项目保持版本，完整未来技能等级和目标可恢复保存', () => {
  for (const input of [
    project(),
    {
      ...project(),
      initialState: { ...state, declaredSkillLevel: 13 },
      operations: [action],
      targetImplicitValues: [target],
      strategy,
    },
  ]) {
    for (const cursor of [0, input.operations.length]) {
      const loaded = loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog)
      if (!loaded.ok) throw Error(loaded.error)
      expect(loaded.value.project.rulesVersion).toBe(project().rulesVersion)
      expect(loaded.value.states.at(-1)?.implicitLines).toEqual(state.implicitLines)
      if (input.operations.length) expect(loaded.value.states.at(-1)?.grantedSkillLevel).toBe(20)
      const saved = serializeTargetCraftProject(loaded.value.project, catalog)
      if (!saved.ok) throw Error(saved.error)
      expect(JSON.parse(saved.value)).toEqual({ ...input, cursor })
    }
  }
})
it('v103 及以前拒绝项链等级声明、结果、目标和未执行指引', () => {
  for (let n = 2; n <= 103; n++) {
    const parse =
      n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
    const input = {
      ...project(),
      rulesVersion: `basic-2026-09-${n >= 92 ? '17' : n >= 76 ? '16' : '12'}-v${n}`,
    }
    for (const patch of [
      { initialState: { ...state, declaredSkillLevel: 13 } },
      { initialState: { ...state, grantedSkillLevel: 13 } },
      { operations: [action] },
      { targetImplicitValues: [target] },
      { strategy },
      { strategy: { unused: [{ condition: { kind: 'granted-skill-level', min: 20 } }] } },
      {
        strategy: {
          future: [{ initialState: { baseId: 'Portent Amulet' }, operations: [action] }],
        },
      },
    ])
      expect(parse(JSON.stringify({ ...input, ...patch }), catalog)).toMatchObject({
        ok: false,
        error: expect.stringContaining('v104'),
      })
  }
  const legacy = {
    ...project(),
    initialState: { ...state, declaredSkillLevel: 13 },
    rulesVersion: 'basic-2026-09-12-v72',
  } as unknown as CraftProject
  expect(() => serializeCraftProject(legacy)).toThrow('v104')
})
it('旧项链与普通武器等级项目不被 v104 门禁误拒绝', () => {
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...project(), rulesVersion: 'basic-2026-09-17-v103' }),
      catalog,
    ).ok,
  ).toBe(true)
  const weapon = {
    ...project(),
    rulesVersion: 'basic-2026-09-17-v101',
    initialState: {
      ...state,
      baseId: 'Rattling Sceptre',
      implicitLines: undefined,
      declaredSkillLevel: 13,
    },
    targetImplicitValues: [{ ...target, lineIndex: 0 }],
  }
  expect(loadTargetWorkbenchProject(JSON.stringify(weapon), catalog).ok).toBe(true)
})
it('复用等级目标与指引升级 v104，保留接收方技能和等级', () => {
  const current = { ...project(), rulesVersion: 'basic-2026-09-17-v103' }
  const template = {
    ...project(),
    initialState: {
      ...state,
      declaredSkillLevel: 20,
      implicitLines: [...state.implicitLines.slice(0, 2), 'Grants Skill: Level 20 Trinity'],
    },
    strategy,
    targetImplicitValues: [target],
  }
  for (const receiver of [
    current,
    {
      ...project(),
      initialState: { ...state, declaredSkillLevel: 13, declaredSkillSockets: 3 },
      operations: [
        { kind: 'perfect-flux', previousMaxLevel: 13 },
        { kind: 'skill-sockets', tier: 'greater', previousSockets: 3 },
      ],
      cursor: 2,
    },
  ]) {
    const reused = reuseTargetCraftPlan(JSON.stringify(receiver), JSON.stringify(template), catalog)
    if (!reused.ok) throw Error(reused.error)
    expect(reused.value.project.rulesVersion).toBe(project().rulesVersion)
    expect(reused.value.project.initialState).toEqual(receiver.initialState)
    expect(reused.value.project.operations).toEqual(receiver.operations)
    expect(reused.value.states.at(-1)?.grantedSkillLevel).toBe(
      receiver.cursor === 2 ? 20 : undefined,
    )
    expect(reused.value.states.at(-1)?.grantedSkillSockets).toBe(
      receiver.cursor === 2 ? 4 : undefined,
    )
    expect(reused.value.project.targetImplicitValues).toEqual([target])
  }
})

it('v104 继承未来符文和缩放来源核对', () => {
  const input = {
    ...project(),
    initialState: { ...state, baseId: 'Crude Bow', implicitLines: undefined, sockets: [null] },
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
  expect(JSON.parse(saved.value)).toEqual(JSON.parse(JSON.stringify(input)))
  for (const key of ['augmentSourceHash', 'scalabilitySourceHash'])
    expect(
      loadTargetWorkbenchProject(JSON.stringify({ ...input, [key]: undefined }), catalog).ok,
    ).toBe(false)
  expect(
    loadTargetWorkbenchProject(JSON.stringify({ ...project(), sourceCommit: 'invalid' }), catalog)
      .ok,
  ).toBe(false)
})

it.each(
  ['en', 'zh-CN', 'zh-TW'].flatMap((locale) => [
    { locale, maximum: false, declaration: 13 },
    { locale, maximum: true, declaration: 13 },
    { locale, maximum: true, declaration: undefined },
  ]),
)(
  '$locale 原文最高等级=$maximum 声明=$declaration 完整未来往返且拒绝篡改',
  ({ locale, maximum, declaration }) => {
    const tw = locale === 'zh-TW'
    const entries = [
      {
        id: 'skill.synthetic',
        en: 'Grants Skill: Level # Archmage',
        text: tw ? '賦予技能: 等級 # 合成技能' : '获得技能: 等级 # 合成技能',
      },
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
    const dictionary =
      locale === 'en'
        ? {}
        : {
            items: { bases: { 'Absent Amulet': '合成项链' }, uniques: {} },
            stats: { entries },
          }
    const sourceText =
      locale === 'en'
        ? [
            'Item Class: Amulets',
            'Rarity: Normal',
            'Absent Amulet',
            '--------',
            'Item Level: 86',
            '--------',
            `Grants Skill: Level 12 Archmage${maximum ? ' (Max Level 13)' : ''}`,
            '--------',
            '{ Implicit Modifier }',
            ...state.implicitLines.slice(0, 2),
          ].join('\n')
        : [
            tw ? '物品種類: 項鍊' : '物品类别: 项链',
            '稀有度: 普通',
            '合成项链',
            '--------',
            tw ? '物品等級: 86' : '物品等级: 86',
            '--------',
            entries[0]?.text.replace('#', '12') +
              (maximum ? (tw ? '（最高等級 13）' : '（最高等级 13）') : ''),
            '--------',
            tw ? '{ 基底屬性 }' : '{ 基底属性 }',
            ...entries.slice(1).map((entry) => entry.text.replace('#', '-1')),
          ].join('\n')
    const input = {
      ...project(),
      initialState: {
        ...state,
        sourceText,
        implicitLines: state.implicitLines.map((line) =>
          maximum && line.startsWith('Grants Skill:') ? `${line} (Max Level 13)` : line,
        ),
        ...(declaration === undefined ? {} : { declaredSkillLevel: declaration }),
      },
      operations: [action],
      targetImplicitValues: [target],
      strategy,
    }
    const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog, dictionary)
    if (!loaded.ok) throw Error(loaded.error)
    const saved = serializeTargetCraftProject(loaded.value.project, catalog, dictionary)
    if (!saved.ok) throw Error(saved.error)
    expect(JSON.parse(saved.value)).toEqual(input)
    expect(
      loadTargetWorkbenchProject(
        JSON.stringify({
          ...input,
          initialState: {
            ...input.initialState,
            implicitLines: [...state.implicitLines.slice(0, 2), 'Grants Skill: Level 12 Trinity'],
          },
        }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
  },
)

it.each(['Lament Amulet', 'Portent Amulet', 'Absent Amulet'])(
  '%s 稳定选定技能槽位独立保存等级目标',
  (baseId) => {
    const base = catalog.bases.find((entry) => entry.id === baseId)
    if (!base) throw Error(baseId)
    const parsed = readBaseSkillVariants(base)
    if (!parsed?.variants[0]) throw Error(baseId)
    const initialState = {
      ...state,
      baseId,
      implicitLines: [parsed.variants[0].line, ...[...parsed.commonLines].reverse()],
      declaredSkillLevel: 13,
    }
    const input = {
      ...project(),
      initialState,
      targetImplicitValues: [{ ...target, lineIndex: parsed.commonLines.length }],
      operations: [action],
    }
    const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
    if (!loaded.ok) throw Error(loaded.error)
    expect(loaded.value.states[1]?.grantedSkillLevel).toBe(20)
    const saved = serializeTargetCraftProject(loaded.value.project, catalog)
    if (!saved.ok) throw Error(saved.error)
    expect(JSON.parse(saved.value)).toEqual(input)
  },
)

it('升级与辅助孔双目标共享稳定槽位，完整未来独立恢复', () => {
  const input = {
    ...project(),
    initialState: { ...state, declaredSkillLevel: 13, declaredSkillSockets: 3 },
    operations: [action, { kind: 'skill-sockets', tier: 'perfect', previousSockets: 3 }],
    targetImplicitValues: [
      target,
      { kind: 'granted-skill-sockets', lineIndex: 2, bounds: [{ index: 0, min: 5 }] },
    ],
  }
  const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  expect(
    loaded.value.states.map((s) => [
      s.declaredSkillLevel,
      s.grantedSkillLevel,
      s.declaredSkillSockets,
      s.grantedSkillSockets,
    ]),
  ).toEqual([
    [13, undefined, 3, undefined],
    [13, 20, 3, undefined],
    [13, 20, 3, 5],
  ])
  const saved = serializeTargetCraftProject(loaded.value.project, catalog)
  if (!saved.ok) throw Error(saved.error)
  expect(JSON.parse(saved.value)).toEqual(input)
})

it('v103 仅孔项目仍保留原版本', () => {
  const input = {
    ...project(),
    rulesVersion: 'basic-2026-09-17-v103',
    initialState: { ...state, declaredSkillSockets: 3 },
    operations: [{ kind: 'skill-sockets', tier: 'perfect', previousSockets: 3 }],
    targetImplicitValues: [
      { kind: 'granted-skill-sockets', lineIndex: 2, bounds: [{ index: 0, min: 5 }] },
    ],
  }
  const loaded = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  expect(loaded.value.project.rulesVersion).toBe(input.rulesVersion)
})
it('能力扫描遵循独立装备上下文，不读取访问器或把纯文本当动作', () => {
  for (const baseId of ['Lament Amulet', 'Portent Amulet', 'Absent Amulet']) {
    expect(requiresAmuletSkillLevelProjectVersion({ initialState: { baseId }, strategy })).toBe(
      true,
    )
    expect(
      requiresAmuletSkillLevelProjectVersion({ future: [{ baseId, declaredSkillLevel: 13 }] }),
    ).toBe(true)
    expect(
      requiresAmuletSkillLevelProjectVersion({
        initialState: { baseId },
        sourceText: 'perfect-flux granted-skill-level declaredSkillLevel',
      }),
    ).toBe(false)
  }
  const shared = { nested: { grantedSkillLevel: 13 } }
  expect(
    requiresAmuletSkillLevelProjectVersion([
      { baseId: 'Absent Amulet', shared },
      { baseId: 'Rattling Sceptre', shared },
    ]),
  ).toBe(true)
  expect(
    requiresAmuletSkillLevelProjectVersion({
      initialState: { baseId: 'Rattling Sceptre', declaredSkillLevel: 13 },
      future: [{ baseId: 'Absent Amulet' }],
      strategy,
    }),
  ).toBe(false)
  expect(
    requiresAmuletSkillLevelProjectVersion({
      initialState: { baseId: 'Absent Amulet' },
      nested: { initialState: { baseId: 'Rattling Sceptre' }, strategy },
    }),
  ).toBe(false)
  let reads = 0
  const cyclic: Record<string, unknown> = {
    get baseId() {
      reads++
      return 'Absent Amulet'
    },
    strategy,
  }
  cyclic.self = cyclic
  expect(requiresAmuletSkillLevelProjectVersion(cyclic)).toBe(false)
  expect(reads).toBe(0)
})
