import { describe, expect, it } from 'vitest'
import type { CatalogMod, CraftCatalog } from './catalog'
import { compareCraftStates } from './comparison'
import { exportCraftItemText } from './craftItemText'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { applyCraftStep } from './craftSteps'
import { DESECRATION_SOURCE, desecrationSourceHash } from './desecration'
import { type ItemDictionary, inspectItem } from './export'
import { parseItem } from './parse'
import {
  applyCraftOperation,
  type CraftState,
  craftCandidates,
  createCraftState,
} from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { analyzeCraftTargets, craftTargetCandidates } from './targets'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('合成测试数据缺失')
  return value
}

const mod = (id: string, kind: CatalogMod['kind'], line: string): CatalogMod => ({
  id,
  kind,
  name: id,
  group: id,
  level: 1,
  lines: [line],
  statOrder: [1],
  tags: [],
  addsTags: [],
  eligibility: [
    { tag: 'focus', value: 1 },
    { tag: 'default', value: 0 },
  ],
  tradeHashes: {},
})
const essenceId = 'Metadata/Items/Currency/CurrencyPerfectEssenceLife'
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: DESECRATION_SOURCE.commit,
    generatedAt: '',
    gameVersion: null,
    weightStatus: 'unknown',
    excludedBases: [],
    sources: [
      DESECRATION_SOURCE,
      { path: 'src/Data/Essence.lua', url: '', sha256: 'a'.repeat(64) },
    ],
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
    mod('mana', 'suffix', '+(10-20) to maximum Mana'),
    mod('life', 'prefix', '+(10-20) to maximum Life'),
    {
      ...mod('exclusive', 'prefix', '(10-20)% increased Spell Damage'),
      desecratedOnly: true,
      tags: ['unveiled_mod', 'amanamu_mod'],
    },
  ],
  essences: [
    {
      id: essenceId,
      name: 'Perfect Essence of Life',
      type: 'Life',
      tierLevel: 1,
      mods: { Focus: 'life' },
    },
  ],
}
const dictionary: ItemDictionary = {
  items: { bases: { 'Test Focus': '测试法器' }, uniques: {} },
  stats: {
    entries: [
      { id: 'mana', en: '+# to maximum Mana', text: '+# 魔力上限' },
      { id: 'life', en: '+# to maximum Life', text: '+# 生命上限' },
      { id: 'exclusive', en: '#% increased Spell Damage', text: '法术伤害提高 #%' },
    ],
  },
}
const text = (exclusive = false, crafted = false) =>
  [
    'Item Class: Foci',
    'Rarity: Rare',
    'Synthetic Item',
    'Test Focus',
    '--------',
    'Item Level: 80',
    '--------',
    exclusive
      ? '{ Desecrated Prefix Modifier "exclusive" }'
      : '{ Desecrated Suffix Modifier "mana" }',
    exclusive ? '15% increased Spell Damage' : '+15 to maximum Mana',
    ...(crafted ? ['{ Crafted Prefix Modifier "life" }', '+15 to maximum Life'] : []),
  ].join('\n')
function imported(raw = text(), source = catalog) {
  const parsed = parseItem(raw)
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, dictionary)
  return {
    parsed: parsed.item,
    inspection,
    result: importCraftState(source, 'Test Focus', parsed.item, inspection),
  }
}
function state(exclusive = false): CraftState {
  const result = imported(text(exclusive)).result
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function project(initialState = state()): CraftProject {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState,
    operations: [],
    cursor: 0,
    desecrationSourceHash: DESECRATION_SOURCE.sha256,
  }
}

describe('已揭示亵渎来源完整闭环', () => {
  it('来源helper拒绝丢失、重复、版本或哈希错误，专属不能由普通或精华生成', () => {
    expect(desecrationSourceHash(catalog)).toBe(DESECRATION_SOURCE.sha256)
    for (const meta of [
      { ...catalog._meta, sources: [] },
      { ...catalog._meta, sources: [...catalog._meta.sources, DESECRATION_SOURCE] },
      { ...catalog._meta, sourceCommit: 'a'.repeat(40) },
    ])
      expect(desecrationSourceHash({ ...catalog, _meta: meta })).toBeNull()
    const current = state()
    expect(
      applyCraftOperation(catalog, current, { currency: 'exalted', modIds: ['exclusive'] }).ok,
    ).toBe(false)
    const mapped = {
      ...catalog,
      essences: required(catalog.essences).map((e) => ({ ...e, mods: { Focus: 'exclusive' } })),
    }
    expect(
      applyCraftStep(mapped, current, {
        kind: 'essence',
        essenceId,
        removeModId: 'mana',
        values: [15],
      }).ok,
    ).toBe(false)
    expect(craftTargetCandidates(mapped, current.baseId).some((mod) => mod.desecratedOnly)).toBe(
      true,
    )
    for (const exclusive of [false, true]) {
      const original = state(exclusive)
      const id = required(original.affixes[0]).modId
      expect(
        applyCraftOperation(catalog, original, {
          currency: 'divine',
          modIds: [],
          rolls: [{ modId: id, values: [20] }],
        }),
      ).toMatchObject({ ok: true, value: { affixes: [{ desecrated: true }] } })
      expect(
        applyCraftOperation(catalog, original, {
          currency: 'annulment',
          modIds: [],
          removeModId: id,
        }),
      ).toMatchObject({ ok: true, value: { affixes: [] } })
    }
  })

  it('普通与专属亵渎可导入，独立的一组工艺可并存，EN/CN/TW输出回读', () => {
    for (const exclusive of [false, true]) {
      const current = state(exclusive)
      expect(current.affixes[0]).toMatchObject({ desecrated: true })
      for (const locale of ['en', 'zh-CN', 'zh-TW'] as const) {
        const output = exportCraftItemText(catalog, current, { locale, dictionary })
        expect(output.ok).toBe(true)
        if (!output.ok) continue
        expect(output.value.text).toContain('(desecrated)')
        expect(imported(output.value.text).result).toMatchObject({
          ok: true,
          value: { affixes: current.affixes },
        })
      }
    }
    expect(imported(text(false, true)).result).toMatchObject({
      ok: true,
      value: {
        affixes: [
          { modId: 'mana', desecrated: true },
          { modId: 'life', crafted: true },
        ],
      },
    })
  })
  it('源状态、稀有度和完整派生文档不能被删改，双状态/未知来源拒绝', () => {
    const valid = imported()
    for (const patch of [
      { mods: valid.parsed.mods.map((m) => ({ ...m, states: [] })) },
      { rarity: 'magic' },
      { corrupted: true },
      { mods: [] },
    ]) {
      expect(
        importCraftState(
          catalog,
          'Test Focus',
          { ...valid.parsed, ...patch } as typeof valid.parsed,
          valid.inspection,
        ).ok,
      ).toBe(false)
    }
    expect(
      importCraftState(catalog, 'Test Focus', valid.parsed, { ...valid.inspection, mods: [] }).ok,
    ).toBe(false)
    for (const raw of [
      text().replace('Rarity: Rare', 'Rarity: Magic'),
      text().replace('Desecrated Suffix', 'Fractured Desecrated Suffix'),
      `${text()}\n{ Desecrated Prefix Modifier "life" }\n+15 to maximum Life`,
      `${text()} (crafted)`,
      text().replace('Desecrated Suffix', 'Implicit'),
      text(true).replace('Desecrated ', ''),
      `${text()}\n--------\nCorrupted`,
    ])
      expect(imported(raw).result.ok).toBe(false)
    const bad = structuredClone(catalog)
    required(bad.bases[0]).tags = ['helmet', 'default']
    expect(imported(text(true), bad).result.ok).toBe(false)
    for (const patch of [{ sha256: 'b'.repeat(64) }, { url: '' }]) {
      const badSource = structuredClone(catalog)
      Object.assign(required(badSource._meta.sources[0]), patch)
      expect(imported(text(), badSource).result.ok).toBe(false)
    }
  })
  it('state拒绝非法或重叠标记、双亵渎、无来源专属与稀有度绕过', () => {
    const current = state()
    for (const desecrated of [false, null, undefined]) {
      expect(
        createCraftState(catalog, {
          ...current,
          affixes: [{ ...required(current.affixes[0]), desecrated }],
        } as unknown as CraftState).ok,
      ).toBe(false)
    }
    expect(
      createCraftState(catalog, {
        ...current,
        affixes: [{ ...required(current.affixes[0]), crafted: true }],
      }).ok,
    ).toBe(false)
    expect(createCraftState(catalog, { ...current, rarity: 'magic' }).ok).toBe(false)
    expect(
      createCraftState(catalog, {
        ...current,
        affixes: [
          ...current.affixes,
          { modId: 'life', lines: ['+15 to maximum Life'], desecrated: true },
        ],
      }).ok,
    ).toBe(false)
    expect(
      createCraftState(catalog, {
        ...current,
        affixes: [{ modId: 'exclusive', lines: ['15% increased Spell Damage'] }],
      }).ok,
    ).toBe(false)
    expect(craftCandidates(catalog, current).map((mod) => mod.id)).toEqual(['life'])
    const candidates = craftTargetCandidates(catalog, current.baseId)
    expect(candidates.some((entry) => entry.id === 'exclusive')).toBe(true)
  })
  it('神圣与增幅保留来源，移除/混沌/替换精华不会传染新增组，状态变化可比较', () => {
    const current = state()
    const divine = applyCraftOperation(catalog, current, {
      currency: 'divine',
      modIds: [],
      rolls: [{ modId: 'mana', values: [20] }],
    })
    expect(divine).toMatchObject({ ok: true, value: { affixes: [{ desecrated: true }] } })
    const exalt = applyCraftOperation(catalog, current, {
      currency: 'exalted',
      modIds: ['life'],
      rolls: [{ modId: 'life', values: [15] }],
    })
    expect(exalt).toMatchObject({
      ok: true,
      value: { affixes: [{ desecrated: true }, { modId: 'life' }] },
    })
    for (const currency of ['annulment', 'chaos'] as const) {
      const next = applyCraftOperation(catalog, current, {
        currency,
        removeModId: 'mana',
        modIds: currency === 'chaos' ? ['mana'] : [],
      })
      expect(next.ok).toBe(true)
      if (next.ok) expect(next.value.affixes.every((a) => !a.desecrated)).toBe(true)
    }
    const essence = applyCraftStep(catalog, current, {
      kind: 'essence',
      essenceId,
      removeModId: 'mana',
      values: [15],
    })
    expect(essence).toMatchObject({
      ok: true,
      value: { affixes: [{ modId: 'life', crafted: true }] },
    })
    if (essence.ok) expect(essence.value.affixes[0]).not.toHaveProperty('desecrated')
    const ordinary = {
      ...current,
      affixes: current.affixes.map(({ desecrated: _, ...affix }) => affix),
    }
    expect(compareCraftStates(catalog, current, ordinary)).toMatchObject({
      ok: true,
      value: {
        affixes: [{ kind: 'changed', desecrated: { before: true, after: false }, numeric: [] }],
      },
    })
  })
  it('已有普通亵渎数值目标继续获得神圣与随机移除风险提示', () => {
    const result = analyzeCraftTargets(
      catalog,
      state(),
      ['mana'],
      [{ modId: 'mana', bounds: [{ index: 0, min: 20 }] }],
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.steps.find((step) => step.currency === 'divine')).toMatchObject({
      rerolledTargetIds: ['mana'],
    })
    const missing = analyzeCraftTargets(catalog, state(), ['life'])
    expect(missing.ok).toBe(true)
    if (missing.ok)
      expect(
        missing.value.steps.some(
          (step) =>
            step.currency === 'chaos' && step.randomRemovalRisk && step.removeModId === 'mana',
        ),
      ).toBe(true)
  })
  it('序列化不能借JSON丢弃显式非法亵渎字段', () => {
    for (const marker of [false, null, undefined]) {
      const saved = project()
      saved.initialState.affixes[0] = {
        ...required(saved.initialState.affixes[0]),
        desecrated: marker,
      } as unknown as CraftState['affixes'][number]
      expect(() => serializeCraftProject(saved)).toThrow()
    }
  })
  it('v20保存恢复指纹与完整历史，v2-v19不能夹带字段、原文或专属ID', () => {
    const saved = project()
    saved.operations = [
      { currency: 'divine', modIds: [], rolls: [{ modId: 'mana', values: [20] }] },
      { currency: 'annulment', modIds: [], removeModId: 'mana' },
    ]
    saved.cursor = 1
    const restored = parseCraftProject(serializeCraftProject(saved), catalog, dictionary)
    expect(
      parseCraftProject(
        JSON.stringify({ ...saved, rulesVersion: 'basic-2026-09-12-v20' }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(true)
    expect(restored).toMatchObject({
      ok: true,
      value: {
        project: {
          desecrationSourceHash: DESECRATION_SOURCE.sha256,
          rulesVersion: 'basic-2026-09-12-v39',
          cursor: 1,
        },
      },
    })
    if (restored.ok) {
      expect(restored.value.states[1]?.affixes[0]?.desecrated).toBe(true)
      expect(restored.value.states[2]?.affixes).toEqual([])
    }
    for (const hash of [undefined, null, 'b'.repeat(64)]) {
      expect(
        parseCraftProject(
          JSON.stringify({ ...saved, desecrationSourceHash: hash }),
          catalog,
          dictionary,
        ).ok,
      ).toBe(false)
    }
    expect(
      parseCraftProject(
        JSON.stringify({ ...saved, initialState: { ...saved.initialState, sourceText: null } }),
        catalog,
      ).ok,
    ).toBe(false)
    expect(
      parseCraftProject(
        JSON.stringify({
          ...saved,
          cursor: 0,
          operations: [...saved.operations, { currency: 'exalted', modIds: ['exclusive'] }],
        }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
    for (let version = 2; version <= 19; version++) {
      for (const initialState of [
        saved.initialState,
        {
          ...saved.initialState,
          affixes: saved.initialState.affixes.map(({ desecrated: _, ...affix }) => affix),
        },
        {
          ...saved.initialState,
          sourceText: null,
          affixes: [{ modId: 'exclusive', lines: ['15% increased Spell Damage'] }],
        },
      ]) {
        expect(
          parseCraftProject(
            JSON.stringify({
              ...saved,
              initialState,
              operations: [],
              cursor: 0,
              rulesVersion: `basic-2026-09-12-v${version}`,
              desecrationSourceHash: undefined,
            }),
            catalog,
            dictionary,
          ).ok,
        ).toBe(false)
      }
    }
    const plain = imported(text().replace('Desecrated ', '')).result
    expect(plain.ok).toBe(true)
    if (plain.ok)
      expect(
        parseCraftProject(
          JSON.stringify({
            ...project(plain.value),
            desecrationSourceHash: undefined,
            rulesVersion: 'basic-2026-09-12-v19',
          }),
          catalog,
          dictionary,
        ),
      ).toMatchObject({ ok: true, value: { project: { rulesVersion: 'basic-2026-09-12-v39' } } })
  })
})
