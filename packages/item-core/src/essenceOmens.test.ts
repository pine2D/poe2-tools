import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { applyCraftStep } from './craftSteps'
import { prepareEssenceCraft } from './essenceCraft'
import { ESSENCE_OMEN_RULES, isEssenceOmen } from './essenceOmens'
import { CRAFT_OMEN_RULES, isCraftOmen } from './omens'
import type { CraftState } from './rehearsal'

const perfect = 'Metadata/Items/Currency/CurrencyPerfectEssenceLife'
const corrupted = 'Metadata/Items/Currency/CurrencyCorruptedEssenceHorror'
const left = 'sinistral_crystallisation'
const right = 'dextral_crystallisation'
const hash = 'b'.repeat(64)
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
  modifiers: ['p1', 'p2', 'p3', 's1', 's2', 's3', 'guaranteed'].map((id) => ({
    id,
    name: id,
    kind: id.startsWith('p') ? 'prefix' : 'suffix',
    group: id,
    level: 10,
    lines: ['+(10-20) to maximum Mana'],
    statOrder: [1],
    tags: [],
    addsTags: [],
    eligibility: [{ tag: 'default', value: 1 }],
    tradeHashes: {},
  })),
  essences: [
    perfect,
    corrupted,
    ...['Lesser', '', 'Greater'].map(
      (tier) => `Metadata/Items/Currency/Currency${tier}EssenceLife`,
    ),
  ].map((id) => ({ id, name: id, type: 'Life', tierLevel: 1, mods: { Focus: 'guaranteed' } })),
}
const affix = (modId: string) => ({ modId, lines: ['+15 to maximum Mana'] })
const rare = (ids = ['p1', 's1']): CraftState => ({
  baseId: 'focus',
  rarity: 'rare',
  itemLevel: 80,
  sourceText: null,
  affixes: ids.map(affix),
})
const operation = {
  kind: 'essence' as const,
  essenceId: perfect,
  values: [15],
  removeModId: 'p1',
  omen: left,
}
function project(): CraftProject {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: CRAFT_RULES_VERSION,
    initialState: { ...rare([]), rarity: 'normal' },
    operations: [
      { currency: 'transmutation', modIds: ['p1'] },
      { currency: 'regal', modIds: ['s1'] },
      operation as never,
    ],
    cursor: 0,
    essenceSourceHash: hash,
  }
}

describe('结晶预兆核心', () => {
  it('独立规则仅接收两枚，与普通制作预兆维持隔离', () => {
    expect(CRAFT_OMEN_RULES).toHaveProperty('whittling')
    expect(ESSENCE_OMEN_RULES).toEqual({
      [left]: { name: 'Omen of Sinistral Crystallisation', kind: 'prefix' },
      [right]: { name: 'Omen of Dextral Crystallisation', kind: 'suffix' },
    })
    for (const omen of [left, right]) {
      expect(isEssenceOmen(omen)).toBe(true)
      expect(isCraftOmen(omen)).toBe(false)
    }
    for (const omen of [
      undefined,
      null,
      [],
      [left],
      '',
      'toString',
      ...Object.keys(CRAFT_OMEN_RULES),
    ])
      expect(isEssenceOmen(omen)).toBe(false)
  })
  it('预兆保留完整前置资格、冲突和特殊数值限制', () => {
    const inputs: CraftState[] = [
      { ...rare(), itemLevel: 9 },
      { ...rare(), rarity: 'magic' },
      { ...rare(), affixes: [affix('guaranteed')] },
      { ...rare(), affixes: [{ ...affix('guaranteed'), crafted: true }] },
    ]
    for (const input of inputs)
      expect(prepareEssenceCraft(catalog, input, perfect, left).ok).toBe(false)
    for (const source of [
      { ...catalog, _meta: { ...catalog._meta, sources: [] } },
      {
        ...catalog,
        modifiers: catalog.modifiers.map((m) =>
          m.id === 'guaranteed' ? { ...m, group: 'p1' } : m,
        ),
      },
      {
        ...catalog,
        modifiers: catalog.modifiers.map((m) =>
          m.id === 'guaranteed'
            ? { ...m, lines: ['(10-20)% increased effect of Socketed Runes'] }
            : m,
        ),
      },
      {
        ...catalog,
        essences: (catalog.essences ?? []).map((e) => ({ ...e, mods: { Shield: 'guaranteed' } })),
      },
    ])
      expect(prepareEssenceCraft(source, { ...rare(), sockets: [null] }, perfect, left).ok).toBe(
        false,
      )
  })
  it('保留来源、孔位、品质、符文和技能行，只新增一组工艺属性', () => {
    const source = {
      ...catalog,
      bases: catalog.bases.map((base) => ({
        ...base,
        implicit: 'Grants Skill: Level (1-20) Skeletal Warrior Minion',
      })),
    }
    const input: CraftState = {
      ...rare(),
      quality: 20,
      sockets: [null],
      implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion'],
      sourceText:
        'Item Class: Foci\nRarity: Rare\nTest\nTest Focus\n--------\nItem Level: 80\n--------\n+10% to Fire Resistance (rune)',
      runeSourceLines: ['+10% to Fire Resistance'],
    }
    const before = structuredClone(input)
    const result = applyCraftStep(source, input, operation as never)
    expect(result).toMatchObject({
      ok: true,
      value: { ...input, affixes: [affix('s1'), { modId: 'guaranteed', crafted: true }] },
    })
    expect(input).toEqual(before)
  })
  it('保证前缀时右旋仍只移后缀，满前缀则拒绝右旋', () => {
    const source = {
      ...catalog,
      modifiers: catalog.modifiers.map((m) =>
        m.id === 'guaranteed' ? { ...m, kind: 'prefix' as const } : m,
      ),
    }
    for (const essenceId of [perfect, corrupted]) {
      expect(prepareEssenceCraft(source, rare(), essenceId, right)).toMatchObject({
        ok: true,
        value: { mod: { kind: 'prefix' }, removableAffixes: [affix('s1')] },
      })
      expect(prepareEssenceCraft(source, rare(['p1', 'p2', 'p3', 's1']), essenceId, right).ok).toBe(
        false,
      )
    }
  })
  it.each([perfect, corrupted])('两侧仅过滤合法池且不改变保证后缀 %s', (essenceId) => {
    for (const [omen, removal] of [
      [left, 'p1'],
      [right, 's1'],
    ] as const) {
      expect(prepareEssenceCraft(catalog, rare(), essenceId, omen)).toMatchObject({
        ok: true,
        value: { mod: { id: 'guaranteed', kind: 'suffix' }, removableAffixes: [affix(removal)] },
      })
      expect(
        applyCraftStep(catalog, rare(), {
          ...operation,
          essenceId,
          omen,
          removeModId: removal,
        } as never),
      ).toMatchObject({
        ok: true,
        value: {
          affixes: [affix(removal === 'p1' ? 's1' : 'p1'), { modId: 'guaranteed', crafted: true }],
        },
      })
    }
    expect(prepareEssenceCraft(catalog, rare(), essenceId)).toMatchObject({
      ok: true,
      value: { removableAffixes: [affix('p1'), affix('s1')] },
    })
  })
  it('保证后缀已满时左旋不能解除容量；无前缀也拒绝', () => {
    for (const ids of [['p1', 's1', 's2', 's3'], ['s1']])
      expect(prepareEssenceCraft(catalog, rare(ids), perfect, left).ok).toBe(false)
    expect(
      prepareEssenceCraft(catalog, rare(['p1', 's1', 's2', 's3']), perfect, right),
    ).toMatchObject({ ok: true, value: { removableAffixes: ['s1', 's2', 's3'].map(affix) } })
  })
  it('前三档拒绝结晶且普通通货不能借用结晶', () => {
    for (const essence of catalog.essences?.slice(2) ?? [])
      expect(
        prepareEssenceCraft(catalog, { ...rare(), rarity: 'magic' }, essence.id, left).ok,
      ).toBe(false)
    expect(
      applyCraftStep(catalog, rare(), {
        currency: 'annulment',
        modIds: [],
        removeModId: 'p1',
        omen: left,
      } as never).ok,
    ).toBe(false)
  })
  it('非法预兆及错误移除保持原子性', () => {
    const input = rare()
    const before = structuredClone(input)
    for (const omen of [null, '', [], [left], 'unknown', 'sinistral_annulment']) {
      expect(prepareEssenceCraft(catalog, input, perfect, omen as never).ok).toBe(false)
      expect(applyCraftStep(catalog, input, { ...operation, omen } as never).ok).toBe(false)
    }
    for (const invalid of [
      { ...operation, omen: undefined },
      { ...operation, removeModId: 's1' },
      { ...operation, values: [99] },
    ])
      expect(applyCraftStep(catalog, input, invalid as never).ok).toBe(false)
    expect(input).toEqual(before)
  })
  it('v17保存与完整未来历史；v2–16拒绝新字段；v16无字段升级', () => {
    expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v62')
    expect(parseCraftProject(serializeCraftProject(project()), catalog)).toMatchObject({
      ok: true,
      value: { project: { operations: project().operations, essenceSourceHash: hash } },
    })
    for (let version = 2; version <= 16; version++)
      expect(
        parseCraftProject(
          JSON.stringify({ ...project(), rulesVersion: `basic-2026-09-12-v${version}` }),
          catalog,
        ).ok,
      ).toBe(false)
    const { omen: _, ...plain } = operation
    expect(
      parseCraftProject(
        JSON.stringify({
          ...project(),
          rulesVersion: 'basic-2026-09-12-v16',
          operations: [...project().operations.slice(0, 2), plain],
        }),
        catalog,
      ),
    ).toMatchObject({ ok: true, value: { project: { rulesVersion: CRAFT_RULES_VERSION } } })
    for (const changes of [
      { omen: null },
      { omen: [] },
      { omen: 'unknown' },
      { removeModId: 's1' },
      { values: [99] },
    ])
      expect(
        parseCraftProject(
          JSON.stringify({
            ...project(),
            operations: [...project().operations.slice(0, 2), { ...operation, ...changes }],
          }),
          catalog,
        ).ok,
      ).toBe(false)
    expect(
      parseCraftProject(
        JSON.stringify({ ...project(), essenceSourceHash: 'c'.repeat(64) }),
        catalog,
      ).ok,
    ).toBe(false)
  })
  it('显式undefined不能被序列化剥除以绕过字段门禁', () => {
    for (const rulesVersion of ['basic-2026-09-12-v16', CRAFT_RULES_VERSION])
      expect(() =>
        serializeCraftProject({
          ...project(),
          rulesVersion,
          operations: [{ ...operation, omen: undefined }],
        } as never),
      ).toThrow()
  })
})
