import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { compareCraftStates } from './comparison'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import { prepareEssenceCraft } from './essenceCraft'
import { essenceCraftMode, supportedEssenceId } from './essences'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { type CraftState, craftCandidates, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import {
  analyzeCraftTargets,
  craftTargetCandidates,
  validateCraftTargetAlternatives,
  validateCraftTargets,
} from './targets'

const essenceId = 'Metadata/Items/Currency/CurrencyLesserEssenceLife'
const hash = 'b'.repeat(64)
const mod = (id: string, kind: 'prefix' | 'suffix', eligible = true) => ({
  id,
  kind,
  name: id,
  group: id,
  level: 10,
  lines: [id === 'life' ? '+(10-20) to maximum Life' : '+(10-20) to maximum Mana'],
  statOrder: [1],
  tags: [],
  addsTags: [],
  eligibility: [{ tag: 'default', value: eligible ? (1 as const) : (0 as const) }],
  tradeHashes: {},
})
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    sources: [{ path: 'src/Data/Essence.lua', sha256: hash, url: '' }],
    excludedBases: [],
  },
  bases: [
    {
      id: 'focus',
      name: 'Test Focus',
      type: 'Focus',
      tags: ['default'],
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
  modifiers: [mod('life', 'prefix', false), mod('mana', 'suffix')],
  essences: [
    {
      id: essenceId,
      name: 'Lesser Essence of Life',
      type: 'Life',
      tierLevel: 99,
      mods: { Focus: 'life' },
    },
  ],
}
const state: CraftState = {
  baseId: 'focus',
  itemLevel: 80,
  rarity: 'magic',
  affixes: [],
  sourceText: null,
}
const step = { kind: 'essence' as const, essenceId, values: [15] }
const crafted: CraftState = {
  ...state,
  rarity: 'rare',
  affixes: [{ modId: 'life', lines: ['+15 to maximum Life'], crafted: true }],
}

describe('精华保证制作与来源', () => {
  it('按精确映射越过普通池，升级并留下唯一工艺组，不改输入', () => {
    const original = structuredClone(state)
    expect(prepareEssenceCraft(catalog, state, essenceId)).toMatchObject({
      ok: true,
      value: { mod: { id: 'life' } },
    })
    expect(applyCraftStep(catalog, state, step)).toEqual({
      ok: true,
      value: {
        ...crafted,
        affixes: [{ ...crafted.affixes[0], lines: ['+15(10-20) to maximum Life'] }],
      },
    })
    expect(state).toEqual(original)
    expect(craftCandidates(catalog, { ...state, rarity: 'rare' }).map((m) => m.id)).not.toContain(
      'life',
    )
  })
  it('保留神圣、普通追加的工艺来源，移除不把来源传给新组', () => {
    expect(
      applyCraftStep(catalog, crafted, { currency: 'exalted', modIds: ['mana'] }),
    ).toMatchObject({ ok: true, value: { affixes: [{ crafted: true }, { modId: 'mana' }] } })
    expect(
      applyCraftStep(catalog, crafted, {
        currency: 'divine',
        modIds: [],
        rolls: [{ modId: 'life', values: [19] }],
      }),
    ).toMatchObject({
      ok: true,
      value: { affixes: [{ crafted: true, lines: ['+19(10-20) to maximum Life'] }] },
    })
    expect(
      applyCraftStep(catalog, crafted, {
        currency: 'chaos',
        modIds: ['mana'],
        removeModId: 'life',
      }),
    ).toMatchObject({ ok: true, value: { affixes: [{ modId: 'mana' }] } })
  })
  it('禁止错档位、来源、冲突、低物等、已有工艺与字段注入', () => {
    for (const input of [
      { ...step, values: [21] },
      { ...step, values: [] },
      { ...step, omen: 'x' },
      { ...step, modId: 'mana' },
      { ...step, essenceId: 'Metadata/Items/Currency/CurrencyPerfectEssenceLife' },
    ])
      expect(applyCraftStep(catalog, state, input as typeof step).ok).toBe(false)
    expect(prepareEssenceCraft(catalog, { ...state, itemLevel: 9 }, essenceId)).toMatchObject({
      ok: false,
      error: expect.stringContaining('尚未验证'),
    })
    expect(prepareEssenceCraft(catalog, crafted, essenceId).ok).toBe(false)
    expect(
      prepareEssenceCraft(
        { ...catalog, _meta: { ...catalog._meta, sources: [] } },
        state,
        essenceId,
      ).ok,
    ).toBe(false)
    expect(
      createCraftState(catalog, {
        ...crafted,
        affixes: [{ modId: 'life', lines: ['+15 to maximum Life'], crafted: false as never }],
      }).ok,
    ).toBe(false)
    expect(createCraftState({ ...catalog, essences: [] }, crafted).ok).toBe(false)
  })
  it('同 ID 的工艺状态差异进入比较', () => {
    const ordinary = { ...catalog, modifiers: [mod('life', 'prefix'), mod('mana', 'suffix')] }
    expect(
      compareCraftStates(
        ordinary,
        { ...crafted, affixes: [{ modId: 'life', lines: ['+15 to maximum Life'] }] },
        crafted,
      ),
    ).toMatchObject({ ok: true, value: { affixes: [{ modId: 'life', kind: 'changed' }] } })
  })
  it('v15 校验全部历史的精华指纹且不要求符文指纹；旧版逐版拒绝新能力', () => {
    const initialState = { ...state, rarity: 'normal' }
    const project = {
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: CRAFT_RULES_VERSION,
      initialState,
      operations: [{ currency: 'transmutation', modIds: ['mana'] }, step],
      cursor: 0,
      essenceSourceHash: hash,
    }
    expect(parseCraftProject(JSON.stringify(project), catalog).ok).toBe(true)
    expect(
      parseCraftProject(JSON.stringify({ ...project, essenceSourceHash: 'c'.repeat(64) }), catalog)
        .ok,
    ).toBe(false)
    for (let version = 2; version <= 14; version++) {
      expect(
        parseCraftProject(
          JSON.stringify({ ...project, rulesVersion: `basic-2026-09-12-v${version}` }),
          catalog,
        ).ok,
      ).toBe(false)
      expect(
        parseCraftProject(
          JSON.stringify({
            ...project,
            operations: [],
            essenceSourceHash: undefined,
            rulesVersion: `basic-2026-09-12-v${version}`,
          }),
          catalog,
        ).ok,
      ).toBe(true)
    }
  })
  it('导入唯一 crafted 并复核原文，不能删字段绕过；CoE仍禁用', () => {
    const text =
      'Item Class: Foci\nRarity: Rare\nTest\nTest Focus\n--------\nItem Level: 80\n--------\n{ Prefix Modifier "Life" (Tier: 1) — life }\n+15 to maximum Life (crafted)'
    const parsed = parseItem(text)
    if (!parsed.ok) throw new Error(parsed.error)
    const dictionary = { items: { bases: { 'Test Focus': 'Test Focus' }, uniques: {} } }
    const inspection = inspectItem(parsed.item, dictionary)
    expect(inspection.bridgeText).toBeNull()
    expect(importCraftState(catalog, 'focus', parsed.item, inspection)).toMatchObject({
      ok: true,
      value: { affixes: crafted.affixes },
    })
    const tampered = structuredClone(parsed.item)
    delete tampered.mods[0]?.states
    delete tampered.mods[0]?.stats[0]?.states
    expect(importCraftState(catalog, 'focus', tampered, inspectItem(tampered, dictionary)).ok).toBe(
      false,
    )
  })
})

describe('精华边界与项目来路回归', () => {
  const raw =
    'Item Class: Foci\nRarity: Rare\nTest\nTest Focus\n--------\nItem Level: 80\n--------\n{ Prefix Modifier "Life" (Tier: 1) — life }\n+15 to maximum Life (crafted)'
  const dictionary = { items: { bases: { 'Test Focus': 'Test Focus' }, uniques: {} } }
  function imported(text = raw) {
    const parsed = parseItem(text)
    if (!parsed.ok) throw new Error(parsed.error)
    return importCraftState(catalog, 'focus', parsed.item, inspectItem(parsed.item, dictionary))
  }
  it('单/双魔法词缀、同组冲突和限定映射资格', () => {
    const ordinary = { ...catalog, modifiers: [mod('life', 'prefix'), mod('mana', 'suffix')] }
    const mana = { modId: 'mana', lines: ['+15 to maximum Mana'] }
    expect(applyCraftStep(catalog, { ...state, affixes: [mana] }, step)).toMatchObject({
      ok: true,
      value: { rarity: 'rare', affixes: [mana, { crafted: true }] },
    })
    expect(
      prepareEssenceCraft(
        ordinary,
        { ...state, affixes: [{ modId: 'life', lines: ['+15 to maximum Life'] }, mana] },
        essenceId,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('冲突') })
    expect(
      createCraftState(catalog, {
        ...crafted,
        affixes: [...crafted.affixes, { ...mana, crafted: true }],
      }).ok,
    ).toBe(false)
    expect(
      createCraftState(catalog, {
        ...crafted,
        affixes: [{ ...mana, crafted: true, future: true } as never],
      }).ok,
    ).toBe(false)
    for (const mods of [{ Shield: 'life' }, { Focus: 'DisplayLife' }])
      expect(
        prepareEssenceCraft(
          {
            ...catalog,
            essences: [
              {
                ...catalog.essences?.[0],
                id: essenceId,
                name: 'test',
                type: 'Life',
                tierLevel: 0,
                mods,
              },
            ],
          },
          state,
          essenceId,
        ).ok,
      ).toBe(false)
    expect(
      applyCraftStep(
        {
          ...catalog,
          modifiers: [{ ...mod('life', 'prefix', false), lines: ['unsupported (1-2-3)'] }],
        },
        state,
        step,
      ).ok,
    ).toBe(false)
  })
  it('已明确标题工艺可导入；多组、混合、未知尾注继续拒绝', () => {
    expect(
      imported(raw.replace('Prefix Modifier', 'Crafted Prefix Modifier').replace(' (crafted)', ''))
        .ok,
    ).toBe(true)
    for (const text of [
      raw.replace('(crafted)', '(crafted) (fractured)'),
      raw.replace('(crafted)', '(desecrated)'),
      raw.replace('(crafted)', '(unknown) (crafted)'),
      `${raw}\n{ Suffix Modifier "Mana" (Tier: 1) — mana }\n+15 to maximum Mana (crafted)`,
    ])
      expect(imported(text).ok).toBe(false)
  })
  it('导入工艺不猜精华身份，v15重放普通步骤，剥去状态或错组失败', () => {
    const result = imported()
    if (!result.ok) throw new Error(result.error)
    const project = {
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: CRAFT_RULES_VERSION,
      initialState: result.value,
      operations: [{ currency: 'exalted', modIds: ['mana'] }],
      cursor: 1,
    }
    expect(parseCraftProject(JSON.stringify(project), catalog, dictionary).ok).toBe(true)
    expect(
      parseCraftProject(
        JSON.stringify({
          ...project,
          initialState: {
            ...result.value,
            affixes: [{ modId: 'life', lines: ['+15 to maximum Life'] }],
          },
        }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
    const wrongGroup = {
      ...result.value,
      affixes: [{ modId: 'mana', lines: ['+15 to maximum Mana'], crafted: true }],
    }
    expect(
      parseCraftProject(
        JSON.stringify({ ...project, initialState: wrongGroup }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
    expect(
      parseCraftProject(
        JSON.stringify({ ...project, initialState: { ...result.value, sourceText: null } }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
  })
  it('每个旧版本分别拒绝来源哈希、crafted字段、原文和游标后的精华步骤', () => {
    for (let version = 2; version <= 14; version++) {
      const project = {
        schemaVersion: 1,
        sourceCommit: catalog._meta.sourceCommit,
        rulesVersion: `basic-2026-09-12-v${version}`,
        initialState: { ...state, rarity: 'normal' },
        operations: [],
        cursor: 0,
      }
      for (const changes of [
        { essenceSourceHash: hash },
        {
          initialState: {
            ...project.initialState,
            affixes: [{ modId: 'mana', lines: ['+15 to maximum Mana'], crafted: false }],
          },
        },
        { initialState: { ...crafted, sourceText: raw } },
        { operations: [{ currency: 'transmutation', modIds: ['mana'] }, step] },
      ])
        expect(
          parseCraftProject(JSON.stringify({ ...project, ...changes }), catalog, dictionary),
        ).toMatchObject({ ok: false, error: expect.stringContaining('v2–v14') })
    }
  })
  it('当前版精华步骤即使未执行也要求指纹并验证完整回放', () => {
    const project = {
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: CRAFT_RULES_VERSION,
      initialState: { ...state, rarity: 'normal' },
      operations: [{ currency: 'transmutation', modIds: ['mana'] }, step],
      cursor: 0,
    }
    expect(parseCraftProject(JSON.stringify(project), catalog)).toMatchObject({
      ok: false,
      error: expect.stringContaining('精华来源指纹'),
    })
    for (const invalid of [
      { ...step, values: [99] },
      { ...step, omen: 'sinistral_exaltation' },
      { ...step, values: null },
    ])
      expect(
        parseCraftProject(
          JSON.stringify({
            ...project,
            essenceSourceHash: hash,
            operations: [project.operations[0], invalid],
          }),
          catalog,
        ).ok,
      ).toBe(false)
  })
})

it('导入仅剥除状态尾注，保留不可缩放尾注排版', () => {
  const raw =
    'Item Class: Foci\nRarity: Rare\nTest\nTest Focus\n--------\nItem Level: 80\n--------\n{ Prefix Modifier "Life" (Tier: 1) — life }\n+15 to maximum Life (crafted) (unscalable)'
  const parsed = parseItem(raw)
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, {
    items: { bases: { 'Test Focus': 'Test Focus' }, uniques: {} },
  })
  expect(importCraftState(catalog, 'focus', parsed.item, inspection)).toMatchObject({
    ok: true,
    value: { affixes: [{ crafted: true, lines: ['+15 to maximum Life (unscalable)'] }] },
  })
})

describe('完美与腐化精华替换', () => {
  const perfectId = 'Metadata/Items/Currency/CurrencyPerfectEssenceLife'
  const replacementCatalog: CraftCatalog = {
    ...catalog,
    modifiers: [
      mod('life', 'prefix', false),
      ...['p1', 'p2', 'p3'].map((id) => mod(id, 'prefix')),
      ...['s1', 's2', 's3'].map((id) => mod(id, 'suffix')),
    ],
    essences: [
      {
        id: perfectId,
        name: 'Perfect Essence of Life',
        type: 'Life',
        tierLevel: 99,
        mods: { Focus: 'life' },
      },
    ],
  }
  const affix = (modId: string) => ({ modId, lines: ['+15 to maximum Mana'] })
  const rare = (ids: string[]): CraftState => ({
    ...state,
    rarity: 'rare',
    affixes: ids.map(affix),
  })
  const replace = { ...step, essenceId: perfectId, removeModId: 's1' }

  it('新侧满时仅可移同侧，有空位时两侧均可，单组可替换且不修改输入', () => {
    const cases: [string[], string[]][] = [
      [
        ['p1', 'p2', 'p3', 's1'],
        ['p1', 'p2', 'p3'],
      ],
      [
        ['p1', 's1', 's2', 's3'],
        ['p1', 's1', 's2', 's3'],
      ],
      [['s1'], ['s1']],
    ]
    for (const [ids, removals] of cases) {
      const input = rare(ids)
      const result = prepareEssenceCraft(replacementCatalog, input, perfectId)
      expect(result).toMatchObject({
        ok: true,
        value: { mode: 'replace', removableAffixes: removals.map(affix) },
      })
      expect(input).toEqual(rare(ids))
    }
    expect(applyCraftStep(replacementCatalog, rare(['p1', 's1']), replace)).toMatchObject({
      ok: true,
      value: { rarity: 'rare', affixes: [affix('p1'), { modId: 'life', crafted: true }] },
    })
    expect(prepareEssenceCraft(catalog, state, essenceId)).toMatchObject({
      ok: true,
      value: { mode: 'upgrade', removableAffixes: [] },
    })
  })

  it('空池、已有工艺、同组及非法移除不会被先删除绕过', () => {
    expect(prepareEssenceCraft(replacementCatalog, rare([]), perfectId).ok).toBe(false)
    expect(
      applyCraftStep(replacementCatalog, { ...crafted }, { ...replace, removeModId: 'life' }).ok,
    ).toBe(false)
    const ordinary = {
      ...replacementCatalog,
      modifiers: replacementCatalog.modifiers.map((m) => ({
        ...m,
        eligibility: [{ tag: 'default', value: 1 as const }],
      })),
    }
    expect(
      prepareEssenceCraft(
        ordinary,
        { ...crafted, affixes: crafted.affixes.map(({ crafted: _, ...a }) => a) },
        perfectId,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('冲突') })
    for (const invalid of [
      { ...replace, removeModId: undefined },
      { ...replace, removeModId: null },
      { ...replace, removeModId: '' },
      { ...replace, removeModId: 'unknown' },
      { ...replace, modId: 'p1' },
      { ...replace, omen: 'x' },
    ])
      expect(applyCraftStep(replacementCatalog, rare(['s1']), invalid as never).ok).toBe(false)
    for (const removeModId of [undefined, null, '', 'mana'])
      expect(applyCraftStep(catalog, state, { ...step, removeModId } as never).ok).toBe(false)
  })

  it('v16回放游标后替换并保留移除身份，v2–15全部拒绝该能力', () => {
    const project = {
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: 'basic-2026-09-12-v16',
      initialState: { ...state, rarity: 'normal' },
      cursor: 0,
      essenceSourceHash: hash,
      operations: [
        { currency: 'transmutation', modIds: ['s1'] },
        { currency: 'regal', modIds: ['p1'] },
        replace,
      ],
    }
    expect(parseCraftProject(JSON.stringify(project), replacementCatalog)).toMatchObject({
      ok: true,
      value: { project: { operations: project.operations } },
    })
    for (let version = 2; version <= 15; version++)
      expect(
        parseCraftProject(
          JSON.stringify({ ...project, rulesVersion: `basic-2026-09-12-v${version}` }),
          replacementCatalog,
        ).ok,
      ).toBe(false)
    expect(
      parseCraftProject(
        JSON.stringify({ ...project, operations: [...project.operations, replace] }),
        replacementCatalog,
      ).ok,
    ).toBe(false)
  })

  it('v15导入不能借完美映射新增资格，但普通池原有crafted仍允许', () => {
    const raw =
      'Item Class: Foci\nRarity: Rare\nTest\nTest Focus\n--------\nItem Level: 80\n--------\n{ Prefix Modifier "Life" (Tier: 1) — life }\n+15 to maximum Life (crafted)'
    const dictionary = { items: { bases: { 'Test Focus': 'Test Focus' }, uniques: {} } }
    const project = {
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: 'basic-2026-09-12-v15',
      initialState: { ...crafted, sourceText: raw },
      cursor: 0,
      operations: [],
    }
    expect(parseCraftProject(JSON.stringify(project), replacementCatalog, dictionary).ok).toBe(
      false,
    )
    expect(
      parseCraftProject(
        JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-12-v16' }),
        replacementCatalog,
        dictionary,
      ).ok,
    ).toBe(true)
    const ordinary = { ...replacementCatalog, modifiers: [mod('life', 'prefix')] }
    expect(parseCraftProject(JSON.stringify(project), ordinary, dictionary).ok).toBe(true)
  })

  it('精华独有目标可配置数值但不进入普通通货池，最多一组必须工艺', () => {
    expect(craftTargetCandidates(replacementCatalog, 'focus').map((m) => m.id)).toContain('life')
    expect(validateCraftTargets(replacementCatalog, 'focus', ['life', 's1']).ok).toBe(true)
    const second = {
      ...replacementCatalog,
      modifiers: [
        ...replacementCatalog.modifiers,
        { ...mod('life2', 'suffix', false), group: 's1' },
      ],
      essences: [
        ...(replacementCatalog.essences ?? []),
        {
          id: 'Metadata/Items/Currency/CurrencyCorruptedEssenceHysteria',
          name: 'test',
          type: 'test',
          tierLevel: 0,
          mods: { Focus: 'life2' },
        },
      ],
    }
    expect(validateCraftTargets(second, 'focus', ['life', 'life2']).ok).toBe(false)
    const alternativesProject = {
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: CRAFT_RULES_VERSION,
      initialState: { ...state, rarity: 'normal' },
      cursor: 0,
      operations: [],
      targetModIds: ['s1'],
      targetAlternatives: [{ targetModId: 's1', modIds: ['life2'] }],
      targetValues: [{ modId: 'life2', bounds: [{ index: 0, min: 15 }] }],
    }
    expect(parseCraftProject(JSON.stringify(alternativesProject), second).ok).toBe(true)
    expect(
      parseCraftProject(
        JSON.stringify({ ...alternativesProject, rulesVersion: 'basic-2026-09-12-v15' }),
        second,
      ).ok,
    ).toBe(false)

    expect(
      validateCraftTargetAlternatives(
        second,
        'focus',
        ['life', 's1'],
        [{ targetModId: 's1', modIds: ['life2'] }],
      ).ok,
    ).toBe(false)
    const advice = analyzeCraftTargets(
      replacementCatalog,
      rare(['s1']),
      ['life'],
      [{ modId: 'life', bounds: [{ index: 0, min: 15 }] }],
    )
    expect(advice).toMatchObject({
      ok: true,
      value: {
        targets: [{ reasons: expect.arrayContaining([expect.stringContaining('精华')]) }],
        steps: [],
      },
    })
    const project = {
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: 'basic-2026-09-12-v16',
      initialState: { ...state, rarity: 'normal' },
      cursor: 0,
      operations: [],
      targetModIds: ['life'],
    }
    expect(parseCraftProject(JSON.stringify(project), replacementCatalog).ok).toBe(true)
    for (let version = 2; version <= 15; version++)
      expect(
        parseCraftProject(
          JSON.stringify({ ...project, rulesVersion: `basic-2026-09-12-v${version}` }),
          replacementCatalog,
        ).ok,
      ).toBe(false)
  })

  it('五类ID精确识别，腐化精华维持稀有并保留来源品质和孔位', () => {
    for (const kind of [
      'LesserEssence',
      'Essence',
      'GreaterEssence',
      'PerfectEssence',
      'CorruptedEssence',
    ]) {
      const id = `Metadata/Items/Currency/Currency${kind}Life`
      expect(supportedEssenceId(id)).toBe(true)
      expect(essenceCraftMode(id)).toBe(
        ['PerfectEssence', 'CorruptedEssence'].includes(kind) ? 'replace' : 'upgrade',
      )
    }
    for (const id of ['', `${perfectId}/extra`, `${perfectId}_extra`, 'CurrencyPerfectEssenceLife'])
      expect(essenceCraftMode(id)).toBeNull()
    const corruption = 'Metadata/Items/Currency/CurrencyCorruptedEssenceHysteria'
    const source = {
      ...replacementCatalog,
      essences: replacementCatalog.essences?.map((entry) => ({ ...entry, id: corruption })) ?? [],
    }
    const input: CraftState = {
      ...rare(['s1']),
      quality: 20,
      sockets: [null],
      sourceText: 'source text',
      implicitLines: [],
    }
    const result = applyCraftStep(source, input, { ...replace, essenceId: corruption })
    expect(result).toMatchObject({
      ok: true,
      value: { ...input, affixes: [{ modId: 'life', crafted: true }] },
    })
    expect(input.affixes).toEqual([affix('s1')])
    const horror = {
      ...source,
      modifiers: source.modifiers.map((m) =>
        m.id === 'life' ? { ...m, lines: ['(10-20)% increased effect of Socketed Runes'] } : m,
      ),
    }
    expect(prepareEssenceCraft(horror, input, corruption).ok).toBe(false)
    expect(input.sockets).toEqual([null])
  })

  it('满后缀只移后缀，错误侧不会产生半完成步骤', () => {
    const suffixCatalog = {
      ...replacementCatalog,
      modifiers: replacementCatalog.modifiers.map((m) =>
        m.id === 'life' ? { ...m, kind: 'suffix' as const } : m,
      ),
    }
    const input = rare(['p1', 'p2', 'p3', 's1', 's2', 's3'])
    expect(prepareEssenceCraft(suffixCatalog, input, perfectId)).toMatchObject({
      ok: true,
      value: { removableAffixes: ['s1', 's2', 's3'].map(affix) },
    })
    expect(applyCraftStep(suffixCatalog, input, { ...replace, removeModId: 'p1' }).ok).toBe(false)
    expect(input.affixes).toHaveLength(6)
  })

  it('全部未来历史严格拒绝移除字段，包括升级和旧v15空字段', () => {
    const project = {
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: CRAFT_RULES_VERSION,
      initialState: { ...state, rarity: 'normal' },
      cursor: 0,
      essenceSourceHash: hash,
      operations: [{ currency: 'transmutation', modIds: ['mana'] }, step],
    }
    for (const removeModId of [null, '', 'mana']) {
      for (const rulesVersion of [CRAFT_RULES_VERSION, 'basic-2026-09-12-v15']) {
        expect(
          parseCraftProject(
            JSON.stringify({
              ...project,
              rulesVersion,
              operations: [project.operations[0], { ...step, removeModId }],
            }),
            catalog,
          ).ok,
        ).toBe(false)
      }
    }
    expect(
      parseCraftProject(
        JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-12-v15' }),
        catalog,
      ).ok,
    ).toBe(true)
  })

  it('替换保留授予技能及符文来源，后续神圣和剥离维持正确工艺身份', () => {
    const implicit = 'Grants Skill: Level (1-20) Skeletal Warrior Minion'
    const source = {
      ...replacementCatalog,
      bases: replacementCatalog.bases.map((base) => ({ ...base, implicit })),
    }
    const input: CraftState = {
      ...rare(['s1']),
      implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion'],
      sockets: [null],
      quality: 20,
      sourceText:
        'Item Class: Foci\nRarity: Rare\nTest\nTest Focus\n--------\nItem Level: 80\n--------\n+10% to Fire Resistance (rune)',
      runeSourceLines: ['+10% to Fire Resistance'],
    }
    const replaced = applyCraftStep(source, input, replace)
    expect(replaced).toMatchObject({
      ok: true,
      value: { ...input, affixes: [{ modId: 'life', crafted: true }] },
    })
    if (!replaced.ok) throw new Error(replaced.error)
    expect(applyCraftStep(source, replaced.value, { currency: 'divine', modIds: [] }).ok).toBe(
      false,
    )
    const plain = applyCraftStep(replacementCatalog, rare(['s1']), replace)
    if (!plain.ok) throw new Error(plain.error)
    const divine = applyCraftStep(replacementCatalog, plain.value, {
      currency: 'divine',
      modIds: [],
      rolls: [{ modId: 'life', values: [19] }],
    })
    expect(divine).toMatchObject({
      ok: true,
      value: { affixes: [{ modId: 'life', crafted: true, lines: ['+19(10-20) to maximum Life'] }] },
    })
    expect(
      applyCraftStep(source, replaced.value, {
        currency: 'annulment',
        modIds: [],
        removeModId: 'life',
      }),
    ).toMatchObject({ ok: true, value: { ...input, affixes: [] } })
  })

  it('只互斥限定技能family，法术与攻击独立且双向普通追加都受保护', () => {
    const families: [string, string[]][] = [
      [
        'EssenceSpellSkillLevel',
        [
          'GlobalIncreaseSpellSkillGemLevel',
          'GlobalIncreaseSpellSkillGemLevelWeapon',
          ...['Fire', 'Cold', 'Lightning', 'Chaos', 'Physical'].map(
            (element) => `GlobalIncrease${element}SpellSkillGemLevelWeapon`,
          ),
        ],
      ],
      [
        'EssenceAttackSkillLevel',
        ['Melee', 'Projectile'].flatMap((kind) =>
          ['', 'Weapon'].map((suffix) => `GlobalIncrease${kind}SkillGemLevel${suffix}`),
        ),
      ],
    ]
    for (const [essenceGroup, groups] of families) {
      for (const ordinaryGroup of [...groups, 'UnrelatedGemLevel']) {
        const skillCatalog = {
          ...replacementCatalog,
          modifiers: [
            ...replacementCatalog.modifiers,
            { ...mod('skill', 'prefix', false), group: essenceGroup },
            { ...mod('ordinarySkill', 'suffix'), group: ordinaryGroup },
          ],
          essences:
            replacementCatalog.essences?.map((entry) => ({ ...entry, mods: { Focus: 'skill' } })) ??
            [],
        }
        const conflict = ordinaryGroup !== 'UnrelatedGemLevel'
        expect(prepareEssenceCraft(skillCatalog, rare(['ordinarySkill', 's1']), perfectId).ok).toBe(
          !conflict,
        )
        const after: CraftState = { ...rare([]), affixes: [{ ...affix('skill'), crafted: true }] }
        expect(
          applyCraftStep(skillCatalog, after, { currency: 'exalted', modIds: ['ordinarySkill'] })
            .ok,
        ).toBe(!conflict)
        expect(
          createCraftState(skillCatalog, {
            ...after,
            affixes: [...after.affixes, affix('ordinarySkill')],
          }).ok,
        ).toBe(!conflict)
      }
    }
  })

  it('跨group技能等级双向互斥，普通候选与直接状态同样拒绝', () => {
    const essenceMod = { ...mod('skill', 'prefix', false), group: 'EssenceSpellSkillLevel' }
    const ordinaryMod = {
      ...mod('cold', 'suffix'),
      group: 'GlobalIncreaseColdSpellSkillGemLevelWeapon',
    }
    const skills = {
      ...replacementCatalog,
      modifiers: [...replacementCatalog.modifiers, essenceMod, ordinaryMod],
      essences:
        replacementCatalog.essences?.map((entry) => ({ ...entry, mods: { Focus: 'skill' } })) ?? [],
    }
    expect(prepareEssenceCraft(skills, rare(['cold', 's1']), perfectId)).toMatchObject({
      ok: false,
      error: expect.stringContaining('冲突'),
    })
    const after: CraftState = {
      ...rare(['skill']),
      affixes: [{ ...affix('skill'), crafted: true }],
    }
    expect(craftCandidates(skills, after).map((m) => m.id)).not.toContain('cold')
    expect(
      createCraftState(skills, { ...after, affixes: [...after.affixes, affix('cold')] }).ok,
    ).toBe(false)
  })
})
