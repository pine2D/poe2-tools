import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { compareCraftStates } from './comparison'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'

const rune = (name: string, line: string) => ({
  id: `pob2:augment:${JSON.stringify([name, 'armour'])}`,
  name,
  category: 'armour',
  type: 'Rune' as const,
  localMod: false,
  lines: [line],
  statOrder: [1],
  tradeHashes: {},
  levelReq: 0,
})
const fire = rune('Lesser Desert Rune', '+10% to Fire Resistance')
const cold = rune('Lesser Glacial Rune', '+10% to Cold Resistance')
const hash = 'c'.repeat(64)
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    excludedBases: [],
    sources: [{ path: 'src/Data/ModRunes.lua', url: 'https://example.test/source', sha256: hash }],
  },
  bases: [
    {
      id: 'Test Helmet',
      name: 'Test Helmet',
      type: 'Helmet',
      tags: ['default'],
      requirements: {},
      properties: {},
      implicit: null,
      implicitTags: [],
      sourceQuality: null,
      socketLimit: 3,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: [],
  augments: [fire, cold],
}
function project() {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: CRAFT_RULES_VERSION,
    augmentSourceHash: hash,
    initialState: {
      baseId: 'Test Helmet',
      itemLevel: 1,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      sockets: [null],
    },
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId: fire.id },
      { kind: 'socket', socketIndex: 0, augmentId: cold.id },
    ],
    cursor: 1,
  }
}
const read = (value: unknown) =>
  parseCraftProject(JSON.stringify(value), catalog, {
    items: { bases: { 'Test Helmet': '测试头盔' }, uniques: {} },
  })

describe('镶嵌项目和比较', () => {
  const sourceText = 'Item Class: Helmets\nRarity: Normal\nTest Helmet\n--------\nItem Level: 1'
  function importedProject(sockets: (string | null)[] = [fire.id]) {
    const p = project()
    return {
      ...p,
      rulesVersion: 'basic-2026-09-12-v7',
      importedSockets: [...sockets],
      initialState: { ...p.initialState, sourceText, sockets: [...sockets] },
      operations: [{ kind: 'socket', socketIndex: 0, augmentId: cold.id }],
      cursor: 0,
    }
  }
  it('v7重解析声明起点并回放未来覆盖，初始符文不产生历史步骤且声明独立', () => {
    const result = read(importedProject())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.states.map((state) => state.sockets)).toEqual([[fire.id], [cold.id]])
    expect(result.value.project.importedSockets).toEqual([fire.id])
    expect(result.value.project.operations).toHaveLength(1)
    expect(result.value.project.cursor).toBe(0)
    result.value.project.importedSockets?.push(null)
    expect(result.value.states[0]?.sockets).toEqual([fire.id])
  })
  it('v7明确零孔后可回放打孔，来源原文保持不变', () => {
    const result = read({ ...importedProject([]), operations: [{ kind: 'artificer' }] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.states.map((state) => state.sockets)).toEqual([[], [null]])
      expect(result.value.project.importedSockets).toEqual([])
      expect(result.value.project.initialState.sourceText).toBe(sourceText)
    }
  })
  it('v7声明须与原文数量、起点孔内ID完全一致且不能用于空白起点', () => {
    const p = importedProject()
    expect(
      read({
        ...p,
        initialState: { ...p.initialState, sourceText: `${sourceText}\n--------\nSockets: S` },
      }).ok,
    ).toBe(true)
    for (const patch of [
      { importedSockets: undefined },
      { importedSockets: [] },
      { importedSockets: [cold.id] },
      { importedSockets: null },
      { importedSockets: [3] },
      { initialState: { ...p.initialState, sockets: undefined } },
      { initialState: { ...p.initialState, sourceText: null } },
      { initialState: { ...p.initialState, sourceText: `${sourceText}\n--------\nSockets: S S` } },
      { operations: [...p.operations, { kind: 'socket', socketIndex: 1, augmentId: cold.id }] },
    ])
      expect(read({ ...p, ...patch }).ok).toBe(false)
    expect(
      read({
        ...importedProject([]),
        initialState: { ...p.initialState, sourceText: null, sockets: [] },
        operations: [],
      }).ok,
    ).toBe(false)
  })
  it('零孔声明也拒绝缺失或错误来源指纹', () => {
    const p = { ...importedProject([]), operations: [] }
    expect(read(p).ok).toBe(true)
    expect(read({ ...p, augmentSourceHash: undefined }).ok).toBe(false)
    expect(read({ ...p, augmentSourceHash: 'd'.repeat(64) }).ok).toBe(false)
    const source = structuredClone(catalog)
    source._meta.sources = []
    expect(parseCraftProject(JSON.stringify(p), source).ok).toBe(false)
  })
  it.each([2, 3, 4, 5, 6])('旧v%s不允许新导入声明', (version) => {
    expect(read({ ...importedProject(), rulesVersion: `basic-2026-09-12-v${version}` }).ok).toBe(
      false,
    )
  })
  it('旧v6保留合法的空白孔位项目并升级规则', () => {
    const result = read({ ...project(), rulesVersion: 'basic-2026-09-12-v6' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.project.rulesVersion).toBe(CRAFT_RULES_VERSION)
  })
  it('零孔项目回放巧匠石后镶嵌，v5不得冒用打孔且未来满孔步骤拒绝', () => {
    const p = project()
    const input = {
      ...p,
      initialState: { ...p.initialState, sockets: [] },
      operations: [{ kind: 'artificer' }, p.operations[0]],
      cursor: 1,
    }
    const result = read(input)
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.value.states.map((state) => state.sockets)).toEqual([[], [null], [fire.id]])
    expect(read({ ...input, rulesVersion: 'basic-2026-09-12-v5' }).ok).toBe(false)
    expect(read({ ...input, operations: [...input.operations, { kind: 'artificer' }] }).ok).toBe(
      false,
    )
    expect(read({ ...input, operations: [{ kind: 'artificer', socketIndex: 0 }] }).ok).toBe(false)
  })
  it('旧v5符文项目升级并保持孔内结果', () => {
    const result = read({ ...project(), rulesVersion: 'basic-2026-09-12-v5' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.project.rulesVersion).toBe(CRAFT_RULES_VERSION)
  })
  it('回放空孔到火抗再覆盖冰抗，保留撤销后的未来历史并比较独立效果', () => {
    const result = read(project())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.states.map((state) => state.sockets)).toEqual([
      [null],
      [fire.id],
      [cold.id],
    ])
    expect(result.value.project.cursor).toBe(1)
    expect(result.value.project.augmentSourceHash).toBe(hash)
    const before = result.value.states[1]
    const after = result.value.states[2]
    if (!before || !after) throw new Error('缺少回放状态')
    expect(compareCraftStates(catalog, before, after)).toMatchObject({
      ok: true,
      value: {
        affixes: [],
        sockets: [
          {
            socketIndex: 0,
            beforeId: fire.id,
            afterId: cold.id,
            beforeLines: fire.lines,
            afterLines: cold.lines,
          },
        ],
      },
    })
  })
  it.each(['basic-2026-09-12-v2', 'basic-2026-09-12-v3', 'basic-2026-09-12-v4'])(
    '旧规则 %s 不得携带新孔位、来源或操作',
    (rulesVersion) => {
      const p = { ...project(), rulesVersion }
      expect(read(p).ok).toBe(false)
      expect(read({ ...p, operations: [], cursor: 0, augmentSourceHash: undefined }).ok).toBe(false)
    },
  )
  it('v4 无孔项目升级不凭空增加孔', () => {
    const p = project()
    const result = read({
      ...p,
      rulesVersion: 'basic-2026-09-12-v4',
      augmentSourceHash: undefined,
      initialState: { ...p.initialState, sockets: undefined },
      operations: [],
      cursor: 0,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.project.rulesVersion).toBe(CRAFT_RULES_VERSION)
      expect(result.value.states[0]?.sockets).toBeUndefined()
    }
  })
  it('来源指纹缺失或改变、非法未来孔位、起点凭空镶好均拒绝', () => {
    const p = project()
    for (const patch of [
      { augmentSourceHash: undefined },
      { augmentSourceHash: 'd'.repeat(64) },
      { operations: [p.operations[0], { kind: 'socket', socketIndex: 1, augmentId: cold.id }] },
      { initialState: { ...p.initialState, sockets: [fire.id] } },
      { operations: [{ kind: 'socket', socketIndex: 0, augmentId: fire.id, currency: 'divine' }] },
    ])
      expect(read({ ...p, ...patch }).ok).toBe(false)
  })
  it('不能给没有孔位来源的导入装备附加空孔', () => {
    const p = project()
    const sourceText = 'Item Class: Helmets\nRarity: Normal\nTest Helmet\n--------\nItem Level: 1'
    expect(
      read({ ...p, initialState: { ...p.initialState, sourceText }, operations: [], cursor: 0 }).ok,
    ).toBe(false)
  })
})
